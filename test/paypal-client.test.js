// Verifies the real PayPal REST client builds correct Orders v2 / Payments requests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPayPalClient } from '../src/paypal/client.js';

test('creates order with item breakdown and returns payer-action link; refunds capture', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (url.endsWith('/v1/oauth2/token')) return json(200, { access_token: 'T', expires_in: 3600 });
    if (url.endsWith('/v2/checkout/orders')) return json(201, { id: 'O1', status: 'PAYER_ACTION_REQUIRED', links: [{ rel: 'payer-action', href: 'https://sandbox.paypal.com/checkoutnow?token=O1' }] });
    if (url.includes('/refund')) return json(201, { id: 'R1', status: 'COMPLETED' });
    return json(404, { name: 'RESOURCE_NOT_FOUND' });
  };
  const pp = createPayPalClient({ clientId: 'id', clientSecret: 'sec', apiBase: 'https://api-m.sandbox.paypal.com' }, fakeFetch);
  const o = await pp.createOrder({ items: [{ productId: 'a', name: 'A', qty: 3, unitPrice: 10.1 }], currency: 'USD', referenceId: 'r', returnUrl: 'http://r', cancelUrl: 'http://c', brandName: 'Shop' });
  assert.equal(o.approveUrl, 'https://sandbox.paypal.com/checkoutnow?token=O1');
  const body = JSON.parse(calls[1].opts.body);
  assert.equal(body.intent, 'CAPTURE');
  assert.equal(body.purchase_units[0].amount.value, '30.30');
  assert.equal(body.purchase_units[0].items[0].quantity, '3');
  assert.equal(calls[1].opts.headers.Authorization, 'Bearer T');

  const r = await pp.refundCapture('CAP1', { amount: 5, currency: 'USD', note: 'x' });
  assert.equal(r.status, 'COMPLETED');
  assert.ok(calls.at(-1).url.endsWith('/v2/payments/captures/CAP1/refund'));
  assert.equal(calls.filter((c) => c.url.endsWith('/oauth2/token')).length, 1, 'token is cached');
  await assert.rejects(() => pp.getOrder('nope'), /RESOURCE_NOT_FOUND/);
});
