// End-to-end flow in MOCK mode: browse -> cart -> PayPal order -> approve -> capture -> refunds -> invoice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig({ PAYPAL_MODE: 'mock', LLM_MODE: 'mock', AUTO_REFUND_LIMIT: '50' });
const app = createApp({ config });
const chat = async (sessionId, message) => (await request(app).post('/api/chat').send({ sessionId, message }).expect(200)).body;

test('full purchase, capture and refund flow with merchant guardrail', async () => {
  const S = 'test-session-1';
  const browse = await chat(S, 'show me bedsheets');
  assert.equal(browse.attachments[0].type, 'products');

  await chat(S, 'add 2 bs-dabu');
  const add = await chat(S, 'add 1 pp-kathputli');
  assert.equal(add.cart.total, 86);

  const co = await chat(S, 'checkout');
  const pay = co.attachments.find((a) => a.type === 'pay');
  assert.ok(pay.url.includes('/mock-paypal/checkout'));

  const early = await chat(S, 'I have paid');
  assert.match(early.reply, /isn't approved/);

  await request(app).post('/mock-paypal/approve').type('form').send({ token: pay.orderId }).expect(302);
  const paid = await chat(S, 'I have paid');
  assert.equal(paid.attachments[0].status, 'COMPLETED');
  assert.equal(paid.cart.items.length, 0);

  const small = await chat(S, 'refund $10 for a dye stain');
  assert.equal(small.attachments[0].status, 'COMPLETED');

  const big = await chat(S, 'refund the rest please');
  assert.equal(big.attachments[0].status, 'PENDING_MERCHANT_APPROVAL');

  const dash = (await request(app).get('/api/dashboard').expect(200)).body;
  assert.equal(dash.stats.pendingApprovals, 1);
  const pending = dash.refunds.find((r) => r.status === 'PENDING_MERCHANT_APPROVAL');
  await request(app).post(`/api/merchant/refunds/${pending.id}/approve`).expect(200);

  const status = await chat(S, 'order status');
  assert.equal(status.attachments[0].status, 'REFUNDED');
  const again = await chat(S, 'refund $5');
  assert.match(again.reply, /already fully refunded/);
});

test('bulk orders are steered to a PayPal invoice', async () => {
  const S = 'test-session-bulk';
  await chat(S, 'add 12 cc-mirror');
  const co = await chat(S, 'checkout');
  assert.match(co.reply, /invoice/i);
  const inv = await chat(S, 'send the invoice to buyer@example.com');
  assert.equal(inv.attachments.find((a) => a.type === 'invoice').total, 144);
});

test('buyers cannot touch other sessions\' orders; bad input rejected', async () => {
  await request(app).post('/api/chat').send({ sessionId: 'x', message: 'hi' }).expect(400);
  const r = await chat('stranger-session', 'refund $5');
  assert.match(r.reply, /couldn't find/);
});

test('serves chat UI and dashboard', async () => {
  const home = await request(app).get('/').expect(200);
  assert.match(home.text, /ChatCart/);
  const dash = await request(app).get('/dashboard').expect(200);
  assert.match(dash.text, /Merchant Dashboard/);
});
