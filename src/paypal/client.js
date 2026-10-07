// Thin PayPal REST client (sandbox) for Orders v2, Payments v2 and Invoicing v2.
import { randomUUID } from 'node:crypto';

export class PayPalError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function createPayPalClient({ clientId, clientSecret, apiBase, invoicerEmail }, fetchImpl = fetch) {
  let token = null;
  let tokenExp = 0;

  async function getToken() {
    if (token && Date.now() < tokenExp - 60_000) return token;
    const res = await fetchImpl(`${apiBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new PayPalError(`PayPal auth failed: ${data.error_description || res.status}`, res.status, data);
    token = data.access_token;
    tokenExp = Date.now() + data.expires_in * 1000;
    return token;
  }

  async function call(method, path, body, extraHeaders = {}) {
    const res = await fetchImpl(`${apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await getToken()}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const issue = data.details?.[0]?.issue || data.name || res.status;
      throw new PayPalError(`PayPal ${method} ${path} failed: ${issue}`, res.status, data);
    }
    return data;
  }

  return {
    mode: 'sandbox',

    /** Orders v2: create an order with line items; returns { id, status, approveUrl } */
    async createOrder({ items, currency, referenceId, returnUrl, cancelUrl, brandName }) {
      const itemTotal = items.reduce((s, i) => s + Math.round(i.unitPrice * 100) * i.qty, 0) / 100;
      const order = await call('POST', '/v2/checkout/orders', {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: referenceId,
          description: `${brandName} order`,
          amount: {
            currency_code: currency,
            value: itemTotal.toFixed(2),
            breakdown: { item_total: { currency_code: currency, value: itemTotal.toFixed(2) } },
          },
          items: items.map((i) => ({
            name: i.name.slice(0, 127),
            sku: i.productId,
            quantity: String(i.qty),
            unit_amount: { currency_code: currency, value: Number(i.unitPrice).toFixed(2) },
            category: 'PHYSICAL_GOODS',
          })),
        }],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: brandName.slice(0, 127),
              user_action: 'PAY_NOW',
              shipping_preference: 'GET_FROM_FILE',
              return_url: returnUrl,
              cancel_url: cancelUrl,
            },
          },
        },
      }, { 'PayPal-Request-Id': randomUUID() });
      const link = order.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve');
      return { id: order.id, status: order.status, approveUrl: link?.href, raw: order };
    },

    async getOrder(id) {
      const o = await call('GET', `/v2/checkout/orders/${encodeURIComponent(id)}`);
      const cap = o.purchase_units?.[0]?.payments?.captures?.[0];
      return { id: o.id, status: o.status, captureId: cap?.id || null, captureStatus: cap?.status || null, raw: o };
    },

    async captureOrder(id) {
      const o = await call('POST', `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, undefined, { 'PayPal-Request-Id': `cap-${id}` });
      const cap = o.purchase_units?.[0]?.payments?.captures?.[0];
      return {
        id: o.id,
        status: o.status,
        captureId: cap?.id,
        captureStatus: cap?.status,
        amount: Number(cap?.amount?.value),
        payerEmail: o.payer?.email_address || o.payment_source?.paypal?.email_address || null,
        raw: o,
      };
    },

    /** Payments v2: refund (partial or full) a captured payment. */
    async refundCapture(captureId, { amount, currency, note }) {
      const r = await call('POST', `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
        amount: { value: Number(amount).toFixed(2), currency_code: currency },
        note_to_payer: note?.slice(0, 255),
      }, { 'PayPal-Request-Id': randomUUID() });
      return { id: r.id, status: r.status, raw: r };
    },

    /** Invoicing v2: create a draft invoice, send it, and return the payer link. */
    async createAndSendInvoice({ items, currency, recipientEmail, note, brandName }) {
      const draft = await call('POST', '/v2/invoicing/invoices', {
        detail: {
          currency_code: currency,
          note: note?.slice(0, 4000),
          payment_term: { term_type: 'DUE_ON_RECEIPT' },
        },
        invoicer: {
          business_name: brandName,
          ...(invoicerEmail ? { email_address: invoicerEmail } : {}),
        },
        primary_recipients: [{ billing_info: { email_address: recipientEmail } }],
        items: items.map((i) => ({
          name: i.name.slice(0, 200),
          quantity: String(i.qty),
          unit_amount: { currency_code: currency, value: Number(i.unitPrice).toFixed(2) },
          unit_of_measure: 'QUANTITY',
        })),
      });
      const id = draft.id || draft.href?.split('/').pop();
      await call('POST', `/v2/invoicing/invoices/${id}/send`, { send_to_invoicer: true });
      const inv = await call('GET', `/v2/invoicing/invoices/${id}`);
      return {
        id,
        status: inv.status,
        url: inv.detail?.metadata?.recipient_view_url || `https://www.sandbox.paypal.com/invoice/p/#${id}`,
        total: Number(inv.amount?.value),
        raw: inv,
      };
    },
  };
}
