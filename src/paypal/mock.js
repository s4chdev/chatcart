// Fake PayPal with the same interface as client.js, so the whole flow runs with no keys.
// It enforces the same state machine as the real API: CREATED -> APPROVED -> COMPLETED.
import { randomBytes } from 'node:crypto';
import { PayPalError } from './client.js';

const pid = (prefix, n = 17) => prefix + randomBytes(16).toString('hex').toUpperCase().slice(0, n - prefix.length);

export function createMockPayPal({ baseUrl }) {
  const orders = new Map();
  const captures = new Map();

  return {
    mode: 'mock',

    async createOrder({ items, currency }) {
      const id = pid('MOCK');
      const total = items.reduce((s, i) => s + Math.round(i.unitPrice * 100) * i.qty, 0) / 100;
      orders.set(id, { id, status: 'PAYER_ACTION_REQUIRED', total, currency, captureId: null });
      return { id, status: 'PAYER_ACTION_REQUIRED', approveUrl: `${baseUrl}/mock-paypal/checkout?token=${id}` };
    },

    /** Mock-only: simulates the buyer clicking "Pay" on PayPal's approval page. */
    approve(id) {
      const o = orders.get(id);
      if (!o) throw new PayPalError('RESOURCE_NOT_FOUND', 404);
      if (o.status === 'PAYER_ACTION_REQUIRED') o.status = 'APPROVED';
      return o;
    },

    peek(id) { return orders.get(id) || null; },

    async getOrder(id) {
      const o = orders.get(id);
      if (!o) throw new PayPalError(`PayPal GET order failed: RESOURCE_NOT_FOUND`, 404);
      const cap = o.captureId ? captures.get(o.captureId) : null;
      return { id, status: o.status, captureId: o.captureId, captureStatus: cap?.status || null };
    },

    async captureOrder(id) {
      const o = orders.get(id);
      if (!o) throw new PayPalError('PayPal capture failed: RESOURCE_NOT_FOUND', 404);
      if (o.status === 'COMPLETED') throw new PayPalError('PayPal capture failed: ORDER_ALREADY_CAPTURED', 422);
      if (o.status !== 'APPROVED') throw new PayPalError('PayPal capture failed: ORDER_NOT_APPROVED', 422);
      o.status = 'COMPLETED';
      o.captureId = pid('CAP');
      captures.set(o.captureId, { id: o.captureId, status: 'COMPLETED', amount: o.total, refunded: 0, currency: o.currency });
      return { id, status: 'COMPLETED', captureId: o.captureId, captureStatus: 'COMPLETED', amount: o.total, payerEmail: 'sb-buyer@personal.example.com' };
    },

    async refundCapture(captureId, { amount, currency }) {
      const c = captures.get(captureId);
      if (!c) throw new PayPalError('PayPal refund failed: RESOURCE_NOT_FOUND', 404);
      const remaining = Math.round((c.amount - c.refunded) * 100);
      if (Math.round(amount * 100) > remaining) throw new PayPalError('PayPal refund failed: REFUND_AMOUNT_EXCEEDED', 422);
      if (currency !== c.currency) throw new PayPalError('PayPal refund failed: CURRENCY_MISMATCH', 422);
      c.refunded = Math.round((c.refunded + Number(amount)) * 100) / 100;
      c.status = c.refunded >= c.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      return { id: pid('RFD'), status: 'COMPLETED' };
    },

    async createAndSendInvoice({ items, recipientEmail }) {
      if (!/^\S+@\S+\.\S+$/.test(recipientEmail || '')) throw new PayPalError('PayPal invoice failed: INVALID_EMAIL', 422);
      const id = `INV2-${pid('', 4)}-${pid('', 4)}-${pid('', 4)}`;
      const total = items.reduce((s, i) => s + Math.round(i.unitPrice * 100) * i.qty, 0) / 100;
      return { id, status: 'SENT', url: `${baseUrl}/mock-paypal/invoice/${id}`, total };
    },
  };
}
