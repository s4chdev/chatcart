// AG Studio dashboard backend: flat data endpoint, demo seed, demo refund approval, AI proxy guards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createStore } from '../src/store.js';
import { seedDemo } from '../src/demo-seed.js';
import { studioAiHandler } from '../src/studio-ai.js';

const base = { PAYPAL_MODE: 'mock', LLM_MODE: 'mock' };

test('GET /api/studio/data returns flat related tables from seeded demo data', async () => {
  const config = loadConfig(base);
  const store = createStore();
  const n = seedDemo({ store, config });
  assert.ok(n.orders > 20 && n.refunds > 3 && n.invoices > 3);
  const app = createApp({ config, store });
  const d = (await request(app).get('/api/studio/data').expect(200)).body;
  for (const k of ['orders', 'orderItems', 'products', 'refunds', 'invoices', 'agentActions']) assert.ok(Array.isArray(d[k]) && d[k].length, k);
  assert.equal(d.demo, true);
  assert.deepEqual(d.studio.aiModels, []); // no key -> assistant hidden
  const orderIds = new Set(d.orders.map((o) => o.id));
  assert.ok(d.orderItems.every((i) => orderIds.has(i.orderId) && i.product && i.category));
  assert.ok(d.refunds.every((r) => orderIds.has(r.orderId)));
  assert.match(d.orders[0].date, /^\d{4}-\d{2}-\d{2}$/);
  // refunds spread over lines add back up to the order-level refunded total
  const sum = (a, f) => Math.round(a.reduce((s, x) => s + f(x), 0) * 100);
  assert.ok(Math.abs(sum(d.orders, (o) => o.refunded) - sum(d.orderItems, (i) => i.refunded)) <= d.orderItems.length);
});

test('approving a seeded demo refund settles locally without calling PayPal', async () => {
  const config = loadConfig(base);
  const store = createStore();
  seedDemo({ store, config });
  const app = createApp({ config, store });
  const pending = store.listRefunds().find((r) => r.status === 'PENDING_MERCHANT_APPROVAL');
  const res = (await request(app).post(`/api/merchant/refunds/${pending.id}/approve`).expect(200)).body;
  assert.equal(res.status, 'COMPLETED');
  assert.equal(store.getOrder(pending.orderId).status, 'REFUNDED');
  await request(app).post(`/api/merchant/refunds/${pending.id}/approve`).expect(409);
});

test('dashboard routes: /dashboard and /dashboard/classic both serve', async () => {
  const app = createApp({ config: loadConfig(base) });
  assert.match((await request(app).get('/dashboard').expect(200)).text, /Merchant Dashboard/);
  assert.match((await request(app).get('/dashboard/classic').expect(200)).text, /Merchant Dashboard/);
});

test('AI proxy: 503 without a key, enforces model allow-list, caps tokens, hides the key', async () => {
  const off = createApp({ config: loadConfig(base) });
  await request(off).post('/api/studio/ai/responses').send({ input: [] }).expect(503);

  const config = loadConfig({ ...base, AG_STUDIO_OPENAI_API_KEY: 'sk-secret', AG_STUDIO_AI_MODELS: 'gpt-a,gpt-b', AG_STUDIO_AI_MAX_TOKENS: '1000' });
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response('data: {"type":"response.completed"}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  const app = express().post('/r', express.json(), studioAiHandler(config, { fetchImpl }));
  await request(app).post('/r').send({ model: 'gpt-evil', input: [] }).expect(400);
  const ok = await request(app).post('/r').send({ input: [], max_output_tokens: 999999 }).expect(200);
  assert.match(ok.text, /response.completed/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[0].body.model, 'gpt-a');
  assert.equal(calls[0].body.max_output_tokens, 1000);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-secret');
  // the key is never sent to the browser
  const pub = createApp({ config });
  const d = (await request(pub).get('/api/studio/data').expect(200)).body;
  assert.deepEqual(d.studio.aiModels, ['gpt-a', 'gpt-b']);
  assert.ok(!JSON.stringify(d).includes('sk-secret'));
});
