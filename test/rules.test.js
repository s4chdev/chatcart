import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/agent/rules.js';
import { searchCatalog, resolveProduct } from '../src/catalog.js';

test('parses browse, add, checkout, capture intents', () => {
  assert.equal(parseIntent('show me bedsheets').intent, 'browse');
  const add = parseIntent('add 2 bs-dabu');
  assert.equal(add.intent, 'add');
  assert.equal(add.product.id, 'bs-dabu');
  assert.equal(add.qty, 2);
  assert.equal(parseIntent('add two puppets').qty, 2);
  assert.equal(parseIntent('checkout').intent, 'checkout');
  assert.equal(parseIntent('I have paid').intent, 'capture');
  assert.equal(parseIntent('where is my order').intent, 'status');
});

test('parses refund amount and reason', () => {
  const r = parseIntent('Refund $10 – item damaged');
  assert.equal(r.intent, 'refund');
  assert.equal(r.amount, 10);
  assert.equal(r.reason, 'item damaged');
});

test('parses bulk invoice with email and quantity', () => {
  const r = parseIntent('bulk order of 20 cushion covers, invoice to a.b@example.com');
  assert.equal(r.intent, 'invoice');
  assert.equal(r.email, 'a.b@example.com');
  assert.equal(r.qty, 20);
  assert.equal(r.product.id, 'cc-mirror');
});

test('catalog search handles plurals and price caps', () => {
  assert.ok(searchCatalog('bedsheets').length >= 2);
  assert.ok(searchCatalog('gifts', { maxPrice: 20 }).every((p) => p.price <= 20));
  assert.equal(resolveProduct('mojari').id, 'fw-mojari');
});
