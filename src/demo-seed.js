// Demo data so the merchant dashboard is not empty on first load in mock mode.
// Every record is flagged `demo: true` (and demo ids start with DEMO-), uses the real catalog and
// policy, and is deterministic, so screenshots and judges see the same shop each time.
// Demo records never touch PayPal: approving a demo refund settles it locally (see app.js).
import { CATALOG } from './catalog.js';
import { toCents, fromCents, fmt } from './money.js';

const BUYERS = [
  'Emma W. (London)', 'Priya S. (Toronto)', 'Lukas M. (Berlin)', 'Aarav K. (Dubai)', 'Sophie L. (Paris)',
  'Rahul J. (New Jersey)', 'Chloe B. (Sydney)', 'Meera P. (Singapore)', 'Daniel R. (Austin)', 'Isabel G. (Madrid)',
  'Kunal D. (Leicester)', 'Hannah T. (Melbourne)',
];
const REFUND_REASONS = ['Colour differs from photo', 'Dye bled in first wash', 'Wrong size mojari', 'Arrived damaged', 'Changed my mind', 'Delayed delivery'];

// Small deterministic PRNG (mulberry32) so the demo shop looks the same on every boot.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lineTotal = (items) => fromCents(items.reduce((s, i) => s + toCents(i.unitPrice) * i.qty, 0));

/**
 * Fill the store with ~6 weeks of a small Jodhpur handicrafts shop: chat orders, captures,
 * agent auto-refunds, refunds waiting for the merchant, PayPal invoices for bulk orders, and the
 * matching agent action log. Returns counts.
 */
export function seedDemo({ store, config, now = Date.now(), seed = 342008 }) {
  const rand = rng(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const DAY = 86_400_000;
  const currency = config.currency;
  const events = []; // [timeMs, fn] applied in time order so newest-first lists come out right
  // Popularity weights: bedsheets and cushions sell most, rugs rarely.
  const weighted = CATALOG.flatMap((p) => Array(({ bedsheets: 4, 'home decor': 2, gifts: 3, textiles: 3, footwear: 2 })[p.category] || 1).fill(p));

  let n = 0;
  const orders = [];
  for (let d = 41; d >= 0; d--) {
    const perDay = rand() < 0.25 ? 0 : 1 + Math.floor(rand() * (d < 10 ? 3 : 2));
    for (let k = 0; k < perDay; k++) {
      n += 1;
      const t = now - d * DAY - Math.floor(rand() * 10 * 3600_000) - 3600_000;
      const lines = [];
      const kinds = 1 + Math.floor(rand() * 2.2);
      for (let j = 0; j < kinds; j++) {
        const p = pick(weighted);
        if (lines.some((l) => l.productId === p.id)) continue;
        lines.push({ productId: p.id, name: p.name, qty: 1 + Math.floor(rand() * 2.4), unitPrice: p.price });
      }
      const paid = d > 0 ? rand() < 0.88 : rand() < 0.6;
      const id = `DEMO-${String(n).padStart(4, '0')}`;
      const total = lineTotal(lines);
      const order = {
        id, demo: true, sessionId: `demo-buyer-${(n % BUYERS.length) + 1}`, buyer: BUYERS[n % BUYERS.length],
        status: paid ? 'COMPLETED' : 'PAYER_ACTION_REQUIRED', items: lines, total, currency,
        approveUrl: null, captureId: paid ? `DEMOCAP${String(n).padStart(4, '0')}` : null, refundedAmount: 0,
        createdAt: new Date(t).toISOString(), createdAtMs: t, paidAtMs: paid ? t + 6 * 60_000 : undefined,
      };
      orders.push(order);
      events.push([t, () => {
        store.saveOrder(order);
        store.logAction({ ts: new Date(t).toISOString(), demo: true, sessionId: order.sessionId, tool: 'create_order', args: { items: lines.length }, ok: true, summary: `PayPal order ${id} created for ${fmt(total, currency)}.` });
      }]);
      if (paid) {
        events.push([t + 6 * 60_000, () => store.logAction({ ts: new Date(t + 6 * 60_000).toISOString(), demo: true, sessionId: order.sessionId, tool: 'capture_payment', args: { order_id: id }, ok: true, summary: `Payment captured for ${id}.` })]);
      }
    }
  }

  // Refunds: small ones the agent settled itself, bigger/older ones queued for the merchant.
  const paidOrders = orders.filter((o) => o.captureId);
  let refundCount = 0;
  const addRefund = (order, amount, status, extra = {}) => {
    refundCount += 1;
    const t = order.createdAtMs + (1 + Math.floor(rand() * 4)) * DAY;
    const tt = Math.min(t, now - 3600_000);
    const refund = {
      id: `RF-DEMO${String(refundCount).padStart(2, '0')}`, demo: true, orderId: order.id, captureId: order.captureId,
      amount, currency, reason: pick(REFUND_REASONS), sessionId: order.sessionId, createdAt: new Date(tt).toISOString(), status, ...extra,
    };
    events.push([tt, () => {
      if (status === 'COMPLETED') {
        refund.paypalRefundId = `DEMORFD${refundCount}`;
        order.refundedAmount = fromCents(toCents(order.refundedAmount) + toCents(amount));
        order.status = toCents(order.refundedAmount) >= toCents(order.total) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      }
      store.saveRefund(refund);
      store.saveOrder(order);
      const summary = status === 'COMPLETED' ? `Refunded ${fmt(amount, currency)} to the buyer's PayPal.`
        : status === 'PENDING_MERCHANT_APPROVAL' ? `Refund of ${fmt(amount, currency)} queued for merchant approval (${refund.policyReason}).`
          : `Merchant rejected refund ${refund.id} (${fmt(amount, currency)}).`;
      store.logAction({ ts: new Date(tt).toISOString(), demo: true, sessionId: status === 'REJECTED' ? 'merchant' : order.sessionId, tool: status === 'REJECTED' ? 'merchant_reject_refund' : 'request_refund', args: { order_id: order.id, amount }, ok: true, summary });
    }]);
  };
  const limit = config.policy.autoRefundLimit;
  const small = paidOrders.filter((o) => o.total <= limit);
  const big = paidOrders.filter((o) => o.total > limit);
  for (let i = 0; i < Math.min(7, small.length); i++) {
    const o = small[Math.floor((i * small.length) / 7)];
    const partial = rand() < 0.5;
    addRefund(o, partial ? fromCents(Math.round(toCents(o.total) * 0.4)) : o.total, 'COMPLETED');
  }
  const recentBig = big.filter((o) => o.createdAtMs > now - 14 * DAY);
  for (const o of recentBig.slice(-3)) {
    addRefund(o, o.total, 'PENDING_MERCHANT_APPROVAL', { policyReason: `amount over auto-refund limit of ${fmt(limit, currency)}` });
  }
  if (big.length > 3) addRefund(big[1], big[1].total, 'REJECTED', { policyReason: `amount over auto-refund limit of ${fmt(limit, currency)}` });

  // Bulk orders go out as PayPal invoices (weddings, boutiques, hotels).
  const bulk = [
    ['wedding.planner@example.com', 'sf-jodhpuri', 40, 33, 'PAID'],
    ['boutique.lisbon@example.com', 'cc-mirror', 30, 27, 'PAID'],
    ['hotel.udaipur@example.com', 'bs-sanganeri', 18, 21, 'PAID'],
    ['events.dubai@example.com', 'pp-kathputli', 25, 12, 'SENT'],
    ['craftshop.nyc@example.com', 'dp-bandhej', 20, 8, 'SENT'],
    ['yoga.retreat@example.com', 'rg-salawas', 6, 3, 'SENT'],
    ['diwali.party@example.com', 'lp-camel', 12, 16, 'PAID'],
  ];
  bulk.forEach(([email, pidRef, qty, daysAgo, status], i) => {
    const p = CATALOG.find((c) => c.id === pidRef);
    const t = now - daysAgo * DAY - 5 * 3600_000;
    const items = [{ productId: p.id, name: p.name, qty, unitPrice: p.price }];
    const inv = { id: `INV2-DEMO-${String(i + 1).padStart(4, '0')}`, demo: true, sessionId: `demo-bulk-${i + 1}`, recipientEmail: email, items, total: lineTotal(items), currency, status, url: null, createdAt: new Date(t).toISOString(), paidAt: status === 'PAID' ? new Date(t + 3 * DAY).toISOString() : null };
    events.push([t, () => {
      store.saveInvoice(inv);
      store.logAction({ ts: new Date(t).toISOString(), demo: true, sessionId: inv.sessionId, tool: 'create_invoice', args: { recipient_email: email, units: qty }, ok: true, summary: `PayPal invoice ${inv.id} for ${fmt(inv.total, currency)} sent to ${email}.` });
    }]);
  });

  events.sort((a, b) => a[0] - b[0]).forEach(([, fn]) => fn());
  return { orders: orders.length, refunds: refundCount, invoices: bulk.length };
}
