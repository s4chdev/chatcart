// In-memory store. Good enough for a hackathon demo; swap for SQLite/Postgres later.
import { randomUUID } from 'node:crypto';

export function createStore() {
  const sessions = new Map(); // sessionId -> { cart: [{productId,name,qty,unitPrice}], history: [], lastOrderId }
  const orders = new Map(); // paypal order id -> order record
  const refunds = new Map();
  const invoices = new Map();
  const actions = [];

  return {
    session(id) {
      if (!sessions.has(id)) sessions.set(id, { id, cart: [], history: [], lastOrderId: null });
      return sessions.get(id);
    },
    saveOrder(o) { orders.set(o.id, o); return o; }, // Map keeps first-insertion order -> newest-first via reverse()
    getOrder(id) { return orders.get(id) || null; },
    listOrders() { return [...orders.values()].reverse(); },
    saveRefund(r) { if (!r.id) r.id = `RF-${randomUUID().slice(0, 8).toUpperCase()}`; refunds.set(r.id, r); return r; },
    getRefund(id) { return refunds.get(id) || null; },
    listRefunds() { return [...refunds.values()].reverse(); },
    saveInvoice(i) { invoices.set(i.id, i); return i; },
    listInvoices() { return [...invoices.values()].reverse(); },
    logAction(entry) {
      actions.unshift({ ts: new Date().toISOString(), ...entry });
      if (actions.length > 500) actions.pop();
    },
    listActions() { return actions; },
  };
}
