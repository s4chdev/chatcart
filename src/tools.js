// Agent tools. Each tool has an OpenAI-style JSON schema (for LLM function calling)
// and a `run` that does the real work: catalog, cart, and PayPal calls.
// Every call is written to the merchant's action log.
import { searchCatalog, resolveProduct, getProduct } from './catalog.js';
import { toCents, fromCents, fmt } from './money.js';

const cartTotal = (cart) => fromCents(cart.reduce((s, i) => s + toCents(i.unitPrice) * i.qty, 0));
const cartUnits = (cart) => cart.reduce((s, i) => s + i.qty, 0);
export const cartView = (session, currency) => ({ items: session.cart, total: cartTotal(session.cart), currency });
const cartAttachment = (session, currency) => ({ type: 'cart', ...cartView(session, currency) });

function findOrder(ctx, orderId) {
  const s = ctx.store.session(ctx.sessionId);
  const id = orderId || s.lastOrderId;
  const order = id ? ctx.store.getOrder(id) : null;
  if (order && order.sessionId !== ctx.sessionId) return null; // buyers only see their own orders
  return order;
}

const orderAttachment = (o) => ({ type: 'order', orderId: o.id, status: o.status, total: o.total, currency: o.currency, captureId: o.captureId });

/** Executes a refund through PayPal and updates the order. Shared by the agent and merchant approval. */
export async function executeRefund(ctx, refund) {
  const order = ctx.store.getOrder(refund.orderId);
  const r = await ctx.paypal.refundCapture(order.captureId, { amount: refund.amount, currency: refund.currency, note: refund.reason });
  refund.status = r.status === 'COMPLETED' ? 'COMPLETED' : r.status;
  refund.paypalRefundId = r.id;
  order.refundedAmount = fromCents(toCents(order.refundedAmount || 0) + toCents(refund.amount));
  order.status = toCents(order.refundedAmount) >= toCents(order.total) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
  ctx.store.saveRefund(refund);
  ctx.store.saveOrder(order);
  return refund;
}

export const TOOLS = [
  {
    name: 'search_catalog',
    description: 'Search the shop catalog by keywords (e.g. "bedsheet", "gift", "rug"). Empty query lists everything.',
    parameters: { type: 'object', properties: { query: { type: 'string' }, max_price: { type: 'number' } } },
    async run(ctx, { query = '', max_price } = {}) {
      const products = searchCatalog(query, { maxPrice: max_price });
      return {
        ok: true,
        data: products.map(({ id, name, price, stock, description }) => ({ id, name, price, stock, description })),
        text: products.length ? `Found ${products.length} product(s).` : `No products match "${query}".`,
        attachments: products.length ? [{ type: 'products', products: products.map((p) => ({ ...p, currency: ctx.config.currency })) }] : [],
      };
    },
  },
  {
    name: 'add_to_cart',
    description: 'Add a product to the buyer\'s cart. product_id must come from search_catalog.',
    parameters: { type: 'object', properties: { product_id: { type: 'string' }, qty: { type: 'integer', minimum: 1 } }, required: ['product_id'] },
    async run(ctx, { product_id, qty = 1 }) {
      const p = getProduct(product_id) || resolveProduct(product_id);
      if (!p) return { ok: false, text: `I couldn't find a product called "${product_id}".` };
      qty = Math.max(1, Math.floor(Number(qty) || 1));
      const s = ctx.store.session(ctx.sessionId);
      const line = s.cart.find((i) => i.productId === p.id);
      const newQty = (line?.qty || 0) + qty;
      if (newQty > p.stock) return { ok: false, text: `Only ${p.stock} × ${p.name} in stock.` };
      if (line) line.qty = newQty;
      else s.cart.push({ productId: p.id, name: p.name, qty, unitPrice: p.price });
      return { ok: true, data: cartView(s, ctx.config.currency), text: `Added ${qty} × ${p.name}.`, attachments: [cartAttachment(s, ctx.config.currency)] };
    },
  },
  {
    name: 'remove_from_cart',
    description: 'Remove a product (or reduce its quantity) from the cart.',
    parameters: { type: 'object', properties: { product_id: { type: 'string' }, qty: { type: 'integer', minimum: 1, description: 'Units to remove; omit to remove the line.' } }, required: ['product_id'] },
    async run(ctx, { product_id, qty }) {
      const s = ctx.store.session(ctx.sessionId);
      const p = getProduct(product_id) || resolveProduct(product_id);
      const line = p && s.cart.find((i) => i.productId === p.id);
      if (!line) return { ok: false, text: `That item isn't in your cart.` };
      if (qty && qty < line.qty) line.qty -= qty;
      else s.cart = s.cart.filter((i) => i !== line);
      return { ok: true, data: cartView(s, ctx.config.currency), text: `Updated your cart.`, attachments: [cartAttachment(s, ctx.config.currency)] };
    },
  },
  {
    name: 'view_cart',
    description: 'Show the current cart and total.',
    parameters: { type: 'object', properties: {} },
    async run(ctx) {
      const s = ctx.store.session(ctx.sessionId);
      if (!s.cart.length) return { ok: true, data: cartView(s, ctx.config.currency), text: 'Your cart is empty.' };
      return { ok: true, data: cartView(s, ctx.config.currency), text: `Cart total ${fmt(cartTotal(s.cart), ctx.config.currency)}.`, attachments: [cartAttachment(s, ctx.config.currency)] };
    },
  },
  {
    name: 'create_checkout',
    description: 'Create a PayPal order (Orders v2) for the current cart and return the PayPal approval link the buyer must open to pay.',
    parameters: { type: 'object', properties: {} },
    async run(ctx) {
      const { store, paypal, config } = ctx;
      const s = store.session(ctx.sessionId);
      if (!s.cart.length) return { ok: false, text: 'Your cart is empty, so there is nothing to check out yet.' };
      if (cartUnits(s.cart) >= config.policy.bulkQtyThreshold) {
        return { ok: false, text: `Orders of ${config.policy.bulkQtyThreshold}+ units are bulk orders; the shop sends a PayPal invoice for those. Share an email and I'll send it.` };
      }
      const items = s.cart.map((i) => ({ ...i }));
      const created = await paypal.createOrder({
        items,
        currency: config.currency,
        referenceId: `chatcart-${ctx.sessionId.slice(0, 20)}`,
        returnUrl: `${config.baseUrl}/paypal/return`,
        cancelUrl: `${config.baseUrl}/paypal/cancel`,
        brandName: config.shopName,
      });
      const order = store.saveOrder({
        id: created.id, sessionId: ctx.sessionId, status: created.status, items,
        total: cartTotal(items), currency: config.currency, approveUrl: created.approveUrl,
        captureId: null, refundedAmount: 0, createdAt: new Date().toISOString(), createdAtMs: Date.now(),
      });
      s.lastOrderId = order.id;
      return {
        ok: true,
        data: { order_id: order.id, status: order.status, approve_url: order.approveUrl, total: order.total },
        text: `PayPal order ${order.id} created for ${fmt(order.total, order.currency)}.`,
        attachments: [{ type: 'pay', url: order.approveUrl, orderId: order.id, total: order.total, currency: order.currency }],
      };
    },
  },
  {
    name: 'capture_payment',
    description: 'Capture the payment for a PayPal order after the buyer approved it. Defaults to the buyer\'s latest order.',
    parameters: { type: 'object', properties: { order_id: { type: 'string' } } },
    async run(ctx, { order_id } = {}) {
      const order = findOrder(ctx, order_id);
      if (!order) return { ok: false, text: 'I could not find an order to capture.' };
      if (order.captureId) return { ok: true, data: { order_id: order.id, status: order.status, capture_id: order.captureId, total: order.total, already_captured: true }, text: `Order ${order.id} is already paid.`, attachments: [orderAttachment(order)] };
      try {
        const cap = await ctx.paypal.captureOrder(order.id);
        Object.assign(order, { status: cap.status, captureId: cap.captureId, payerEmail: cap.payerEmail, paidAt: new Date().toISOString(), paidAtMs: Date.now() });
      } catch (err) {
        const issue = err.details?.details?.[0]?.issue || err.message;
        if (/ORDER_NOT_APPROVED|PAYER_ACTION_REQUIRED|COMPLIANCE/i.test(issue)) {
          return { ok: false, text: `Payment isn't approved yet. Please open the PayPal link and complete payment first.`, attachments: [{ type: 'pay', url: order.approveUrl, orderId: order.id, total: order.total, currency: order.currency }] };
        }
        if (/ALREADY_CAPTURED/i.test(issue)) {
          const o = await ctx.paypal.getOrder(order.id);
          Object.assign(order, { status: o.status, captureId: o.captureId });
        } else throw err;
      }
      ctx.store.saveOrder(order);
      ctx.store.session(ctx.sessionId).cart = [];
      return { ok: true, data: { order_id: order.id, status: order.status, capture_id: order.captureId, total: order.total }, text: `Payment captured for ${order.id}.`, attachments: [orderAttachment(order)] };
    },
  },
  {
    name: 'get_order_status',
    description: 'Look up the live PayPal status of an order (defaults to the buyer\'s latest order).',
    parameters: { type: 'object', properties: { order_id: { type: 'string' } } },
    async run(ctx, { order_id } = {}) {
      const order = findOrder(ctx, order_id);
      if (!order) return { ok: false, text: "You don't have any orders yet." };
      if (!['REFUNDED', 'PARTIALLY_REFUNDED'].includes(order.status)) {
        const live = await ctx.paypal.getOrder(order.id);
        order.status = live.status;
        order.captureId = order.captureId || live.captureId;
        ctx.store.saveOrder(order);
      }
      return { ok: true, data: { order_id: order.id, status: order.status, total: order.total, refunded: order.refundedAmount, items: order.items }, text: `Order ${order.id} is ${order.status}.`, attachments: [orderAttachment(order)] };
    },
  },
  {
    name: 'request_refund',
    description: 'Refund a paid order (full by default, or a partial amount). Policy: refunds above the auto-refund limit or outside the refund window need merchant approval and are queued.',
    parameters: { type: 'object', properties: { order_id: { type: 'string' }, amount: { type: 'number' }, reason: { type: 'string' } }, required: ['reason'] },
    async run(ctx, { order_id, amount, reason = 'Customer request' } = {}) {
      const { config, store } = ctx;
      const order = findOrder(ctx, order_id);
      if (!order) return { ok: false, text: "I couldn't find that order." };
      if (!order.captureId) return { ok: false, text: `Order ${order.id} hasn't been paid, so there's nothing to refund.` };
      const remaining = fromCents(toCents(order.total) - toCents(order.refundedAmount || 0));
      const pendingSame = store.listRefunds().find((r) => r.orderId === order.id && r.status === 'PENDING_MERCHANT_APPROVAL');
      if (pendingSame) return { ok: false, text: `A refund for this order is already waiting for the shop owner's approval.` };
      if (remaining <= 0) return { ok: false, text: `Order ${order.id} is already fully refunded.` };
      const amt = amount ? fromCents(toCents(amount)) : remaining;
      if (amt <= 0 || toCents(amt) > toCents(remaining)) return { ok: false, text: `The most I can refund on this order is ${fmt(remaining, order.currency)}.` };

      const refund = { orderId: order.id, captureId: order.captureId, amount: amt, currency: order.currency, reason, sessionId: ctx.sessionId, createdAt: new Date().toISOString() };
      const ageDays = (Date.now() - (order.paidAtMs || order.createdAtMs || Date.now())) / 86_400_000;
      const needsApproval = amt > config.policy.autoRefundLimit || ageDays > config.policy.refundWindowDays;
      if (needsApproval) {
        refund.status = 'PENDING_MERCHANT_APPROVAL';
        refund.policyReason = amt > config.policy.autoRefundLimit
          ? `amount over auto-refund limit of ${fmt(config.policy.autoRefundLimit, order.currency)}`
          : `outside ${config.policy.refundWindowDays}-day window`;
        store.saveRefund(refund);
        return {
          ok: true,
          data: { refund_id: refund.id, status: refund.status, amount: amt, policy: refund.policyReason },
          text: `Refund of ${fmt(amt, order.currency)} queued for merchant approval (${refund.policyReason}).`,
          attachments: [{ type: 'refund', refundId: refund.id, status: refund.status, amount: amt, currency: order.currency }],
        };
      }
      store.saveRefund(refund);
      await executeRefund(ctx, refund);
      return {
        ok: true,
        data: { refund_id: refund.id, paypal_refund_id: refund.paypalRefundId, status: refund.status, amount: amt, order_status: order.status },
        text: `Refunded ${fmt(amt, order.currency)} to the buyer's PayPal.`,
        attachments: [{ type: 'refund', refundId: refund.id, status: refund.status, amount: amt, currency: order.currency }],
      };
    },
  },
  {
    name: 'create_invoice',
    description: 'Send a PayPal invoice (Invoicing v2) for bulk or custom orders. Uses the cart unless items are given. Custom items can have a name and unit_price instead of product_id.',
    parameters: {
      type: 'object',
      properties: {
        recipient_email: { type: 'string' },
        items: { type: 'array', items: { type: 'object', properties: { product_id: { type: 'string' }, name: { type: 'string' }, unit_price: { type: 'number' }, qty: { type: 'integer' } } } },
        note: { type: 'string' },
      },
      required: ['recipient_email'],
    },
    async run(ctx, { recipient_email, items, note } = {}) {
      const { store, paypal, config } = ctx;
      if (!/^\S+@\S+\.\S+$/.test(recipient_email || '')) return { ok: false, text: 'I need a valid email address to send the invoice to.' };
      const s = store.session(ctx.sessionId);
      let lines;
      if (items?.length) {
        lines = [];
        for (const it of items) {
          const p = it.product_id ? (getProduct(it.product_id) || resolveProduct(it.product_id)) : null;
          if (p) lines.push({ productId: p.id, name: p.name, qty: it.qty || 1, unitPrice: p.price });
          else if (it.name && it.unit_price > 0) lines.push({ productId: 'custom', name: `Custom: ${it.name}`, qty: it.qty || 1, unitPrice: it.unit_price });
          else return { ok: false, text: `I couldn't price "${it.product_id || it.name}".` };
        }
      } else lines = s.cart.map((i) => ({ ...i }));
      if (!lines.length) return { ok: false, text: 'Nothing to invoice yet. Add items to the cart first.' };
      const inv = await paypal.createAndSendInvoice({ items: lines, currency: config.currency, recipientEmail: recipient_email, note: note || `Thank you for ordering from ${config.shopName}!`, brandName: config.shopName });
      const total = Number.isFinite(inv.total) ? inv.total : cartTotal(lines);
      store.saveInvoice({ id: inv.id, sessionId: ctx.sessionId, recipientEmail: recipient_email, items: lines, total, currency: config.currency, status: inv.status, url: inv.url, createdAt: new Date().toISOString() });
      if (!items?.length) s.cart = [];
      return {
        ok: true,
        data: { invoice_id: inv.id, status: inv.status, url: inv.url, total },
        text: `PayPal invoice ${inv.id} for ${fmt(total, config.currency)} sent to ${recipient_email}.`,
        attachments: [{ type: 'invoice', invoiceId: inv.id, url: inv.url, total, currency: config.currency }],
      };
    },
  },
];

const BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

/** Run a tool by name with logging and error capture. Never throws. */
export async function runTool(ctx, name, args = {}) {
  const tool = BY_NAME[name];
  let result;
  if (!tool) result = { ok: false, text: `Unknown tool ${name}` };
  else {
    try {
      result = await tool.run(ctx, args || {});
    } catch (err) {
      result = { ok: false, text: `Sorry, PayPal returned an error: ${err.message}`, error: err.message };
    }
  }
  ctx.store.logAction({ sessionId: ctx.sessionId, tool: name, args, ok: result.ok, summary: result.text });
  return { attachments: [], ...result };
}

/** Tool list in OpenAI function-calling format. */
export const openAiTools = () => TOOLS.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
