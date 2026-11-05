// Flat, related tables for the AG Studio merchant dashboard (GET /api/studio/data).
// The store keeps nested records (orders with items, refunds keyed to orders); AG Studio wants one
// table per row type joined by ids, with dates as YYYY-MM-DD so they can sit on a shared calendar.
import { CATALOG, getProduct } from './catalog.js';
import { toCents, fromCents } from './money.js';

// Short product labels so chart axes stay readable.
const SHORT = {
  'bs-dabu': 'Dabu bedsheet', 'bs-sanganeri': 'Sanganeri bedsheet', 'qt-razai': 'Razai quilt', 'rg-salawas': 'Salawas dhurrie',
  'cc-mirror': 'Mirror cushion', 'lp-camel': 'Camel-leather lamp', 'pp-kathputli': 'Kathputli puppets', 'dp-bandhej': 'Bandhej dupatta',
  'sf-jodhpuri': 'Jodhpuri safa', 'fw-mojari': 'Mojari',
};

const day = (iso) => (iso ? String(iso).slice(0, 10) : null);
const round = (n) => fromCents(toCents(n));

const orderGroup = (o) => {
  if (o.status === 'REFUNDED') return 'Refunded';
  if (o.status === 'PARTIALLY_REFUNDED') return 'Partly refunded';
  if (o.captureId) return 'Paid';
  return 'Awaiting payment';
};
const refundGroup = (s) => ({ COMPLETED: 'Refunded', PENDING_MERCHANT_APPROVAL: 'Awaiting merchant', REJECTED: 'Rejected' })[s] || s;
const actor = (a) => (a.sessionId === 'merchant' ? 'Merchant' : 'ChatCart agent');

export function buildStudioTables({ store, config, paypalMode }) {
  const orders = store.listOrders();
  const refunds = store.listRefunds();
  const invoices = store.listInvoices();
  const actions = store.listActions();

  const orderRows = orders.map((o) => {
    const captured = o.captureId ? o.total : 0;
    const refunded = o.refundedAmount || 0;
    return {
      id: o.id,
      date: day(o.createdAt),
      createdAt: o.createdAt,
      buyer: o.buyer || o.sessionId,
      status: o.status,
      statusGroup: orderGroup(o),
      isPaid: Boolean(o.captureId),
      units: o.items.reduce((s, i) => s + i.qty, 0),
      lines: o.items.length,
      total: o.total,
      captured,
      refunded,
      net: round(captured - refunded),
      currency: o.currency,
      demo: Boolean(o.demo),
    };
  });

  // Order-level refunds are spread over the order's lines by value, so refunds can be read by product.
  const orderItems = orders.flatMap((o) => o.items.map((i, idx) => {
    const p = getProduct(i.productId);
    const line = round(i.unitPrice * i.qty);
    const captured = o.captureId ? line : 0;
    const refunded = o.total > 0 ? round(((o.refundedAmount || 0) * line) / o.total) : 0;
    return {
      id: `${o.id}-${idx + 1}`,
      orderId: o.id,
      productId: i.productId || `custom-${idx + 1}`,
      product: SHORT[i.productId] || i.name,
      productFull: i.name,
      category: p?.category || 'custom',
      date: day(o.createdAt),
      qty: i.qty,
      unitPrice: i.unitPrice,
      lineTotal: line,
      captured,
      refunded,
      net: round(captured - refunded),
    };
  }));

  const refundRows = refunds.map((r) => ({
    id: r.id,
    orderId: r.orderId,
    date: day(r.createdAt),
    status: r.status,
    statusGroup: refundGroup(r.status),
    amount: r.amount,
    refundedAmount: r.status === 'COMPLETED' ? r.amount : 0,
    pendingAmount: r.status === 'PENDING_MERCHANT_APPROVAL' ? r.amount : 0,
    rejectedAmount: r.status === 'REJECTED' ? r.amount : 0,
    isPending: r.status === 'PENDING_MERCHANT_APPROVAL',
    decidedBy: r.policyReason ? 'Merchant' : 'Agent (auto)',
    reason: r.reason || '',
    policyReason: r.policyReason || '',
    buyer: orders.find((o) => o.id === r.orderId)?.buyer || r.sessionId,
    demo: Boolean(r.demo),
  }));

  const invoiceRows = invoices.map((i) => {
    const paid = i.status === 'PAID' || i.status === 'MARKED_AS_PAID';
    return {
      id: i.id,
      date: day(i.createdAt),
      recipient: i.recipientEmail,
      status: i.status,
      statusGroup: paid ? 'Paid' : 'Unpaid',
      isPaid: paid,
      units: i.items.reduce((s, x) => s + x.qty, 0),
      total: i.total,
      paidAmount: paid ? i.total : 0,
      outstanding: paid ? 0 : i.total,
      currency: i.currency,
      demo: Boolean(i.demo),
    };
  });

  const actionRows = actions.map((a, idx) => ({
    id: `ACT-${actions.length - idx}`,
    ts: a.ts,
    date: day(a.ts),
    tool: a.tool,
    actor: actor(a),
    session: a.sessionId,
    ok: Boolean(a.ok),
    outcome: a.ok ? 'OK' : 'Failed',
    summary: a.summary || '',
    demo: Boolean(a.demo),
  }));

  const products = CATALOG.map((p) => ({ id: p.id, name: SHORT[p.id] || p.name, fullName: p.name, category: p.category, price: p.price, stock: p.stock, emoji: p.emoji }));

  return {
    asOf: new Date().toISOString(),
    shop: config.shopName,
    currency: config.currency,
    mode: { paypalMode, llmMode: config.llm.mode },
    policy: { autoRefundLimit: config.policy.autoRefundLimit, refundWindowDays: config.policy.refundWindowDays, bulkQtyThreshold: config.policy.bulkQtyThreshold },
    demo: [...orderRows, ...refundRows, ...invoiceRows].some((r) => r.demo),
    orders: orderRows,
    orderItems,
    products,
    refunds: refundRows,
    invoices: invoiceRows,
    agentActions: actionRows,
  };
}
