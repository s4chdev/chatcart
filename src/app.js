import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createStore } from './store.js';
import { createPayPal } from './paypal/index.js';
import { handleMessage } from './agent/index.js';
import { runTool, executeRefund } from './tools.js';
import { CATALOG } from './catalog.js';
import { fmt, toCents, fromCents } from './money.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createApp({ config = loadConfig(), store = createStore(), paypal } = {}) {
  paypal = paypal || createPayPal(config);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '50kb' }));
  app.use(express.urlencoded({ extended: false }));
  const ctxFor = (sessionId) => ({ config, store, paypal, sessionId });

  // Optional basic auth for merchant pages (set DASHBOARD_PASSWORD in production).
  const merchantAuth = (req, res, next) => {
    const pw = process.env.DASHBOARD_PASSWORD;
    if (!pw) return next();
    const [, b64 = ''] = (req.headers.authorization || '').split(' ');
    const [, given] = Buffer.from(b64, 'base64').toString().split(':');
    if (given === pw) return next();
    res.set('WWW-Authenticate', 'Basic realm="ChatCart merchant"').status(401).send('Auth required');
  };

  app.get('/api/health', (_req, res) => res.json({ ok: true, paypalMode: paypal.mode, llmMode: config.llm.mode, shop: config.shopName }));
  app.get('/api/catalog', (_req, res) => res.json({ currency: config.currency, products: CATALOG }));

  app.post('/api/chat', async (req, res) => {
    const { sessionId, message } = req.body || {};
    if (typeof sessionId !== 'string' || !/^[\w-]{4,64}$/.test(sessionId)) return res.status(400).json({ error: 'sessionId (4-64 chars, [A-Za-z0-9_-]) required' });
    if (typeof message !== 'string' || !message.trim() || message.length > 1000) return res.status(400).json({ error: 'message required (max 1000 chars)' });
    try {
      res.json(await handleMessage(ctxFor(sessionId), message.trim()));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'agent_error', reply: 'Sorry, something went wrong on our side. Please try again.' });
    }
  });

  // PayPal redirects the buyer here after approval; the agent captures immediately.
  app.get('/paypal/return', async (req, res) => {
    const id = String(req.query.token || '');
    const order = store.getOrder(id);
    if (!order) return res.redirect('/?error=unknown_order');
    await runTool(ctxFor(order.sessionId), 'capture_payment', { order_id: id });
    res.redirect(`/?paid=${encodeURIComponent(id)}`);
  });
  app.get('/paypal/cancel', (_req, res) => res.redirect('/?cancelled=1'));

  // ---- Mock PayPal pages (only in mock mode) ----
  if (paypal.mode === 'mock') {
    app.get('/mock-paypal/checkout', (req, res) => {
      const o = paypal.peek(String(req.query.token || ''));
      if (!o) return res.status(404).send('Unknown order');
      res.send(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>PayPal (mock)</title>
<body style="font-family:system-ui;background:#f5f7fa;display:grid;place-items:center;min-height:100vh;margin:0">
<form method=post action="/mock-paypal/approve" style="background:#fff;padding:32px;border-radius:12px;box-shadow:0 2px 12px #0002;width:320px;text-align:center">
<div style="font-size:28px;font-weight:800;color:#003087">Pay<span style="color:#009cde">Pal</span> <small style="font-size:12px;color:#888">sandbox mock</small></div>
<p>${esc(config.shopName)}</p><p style="font-size:32px;margin:8px 0">${esc(fmt(o.total, o.currency))}</p>
<p style="color:#666;font-size:13px">Order ${esc(o.id)}<br>Paying as sb-buyer@personal.example.com</p>
<input type=hidden name=token value="${esc(o.id)}">
<button style="background:#FFC439;border:0;border-radius:24px;padding:12px 24px;font-weight:700;font-size:16px;width:100%;cursor:pointer">Complete Purchase</button>
<p><a href="/paypal/cancel" style="color:#666;font-size:13px">Cancel and return to ChatCart</a></p></form></body>`);
    });
    app.post('/mock-paypal/approve', (req, res) => {
      try { paypal.approve(String(req.body.token || req.query.token || '')); } catch { return res.status(404).send('Unknown order'); }
      res.redirect(`/paypal/return?token=${encodeURIComponent(req.body.token || req.query.token)}`);
    });
    app.get('/mock-paypal/invoice/:id', (req, res) => {
      const inv = store.listInvoices().find((i) => i.id === req.params.id);
      if (!inv) return res.status(404).send('Unknown invoice');
      res.send(`<!doctype html><title>Invoice ${esc(inv.id)}</title><body style="font-family:system-ui;max-width:520px;margin:40px auto">
<h2>PayPal invoice (mock) ${esc(inv.id)}</h2><p>From ${esc(config.shopName)} to ${esc(inv.recipientEmail)}</p><ul>
${inv.items.map((i) => `<li>${i.qty} × ${esc(i.name)} @ ${esc(fmt(i.unitPrice, inv.currency))}</li>`).join('')}</ul>
<h3>Total ${esc(fmt(inv.total, inv.currency))}</h3><p>Status: ${esc(inv.status)}</p></body>`);
    });
  }

  // ---- Merchant ----
  app.get('/api/dashboard', merchantAuth, (_req, res) => {
    const orders = store.listOrders();
    const refunds = store.listRefunds();
    const paid = orders.filter((o) => o.captureId);
    const sum = (arr, f) => fromCents(arr.reduce((s, x) => s + toCents(f(x)), 0));
    res.json({
      mode: { paypalMode: paypal.mode, llmMode: config.llm.mode },
      policy: { autoRefundLimit: config.policy.autoRefundLimit, refundWindowDays: config.policy.refundWindowDays, bulkQtyThreshold: config.policy.bulkQtyThreshold, currency: config.currency },
      stats: {
        revenue: sum(paid, (o) => o.total - (o.refundedAmount || 0)),
        orders: orders.length,
        paidOrders: paid.length,
        refunded: sum(refunds.filter((r) => r.status === 'COMPLETED'), (r) => r.amount),
        pendingApprovals: refunds.filter((r) => r.status === 'PENDING_MERCHANT_APPROVAL').length,
        currency: config.currency,
      },
      orders, refunds, invoices: store.listInvoices(), actions: store.listActions().slice(0, 100),
    });
  });

  app.post('/api/merchant/refunds/:id/:decision(approve|reject)', merchantAuth, async (req, res) => {
    const refund = store.getRefund(req.params.id);
    if (!refund) return res.status(404).json({ error: 'not_found' });
    if (refund.status !== 'PENDING_MERCHANT_APPROVAL') return res.status(409).json({ error: 'not_pending', status: refund.status });
    const ctx = { ...ctxFor(refund.sessionId) };
    try {
      if (req.params.decision === 'reject') {
        refund.status = 'REJECTED';
        store.saveRefund(refund);
      } else {
        await executeRefund(ctx, refund);
      }
      store.logAction({ sessionId: 'merchant', tool: `merchant_${req.params.decision}_refund`, args: { refund_id: refund.id, amount: refund.amount }, ok: true, summary: `Merchant ${req.params.decision}d refund ${refund.id} (${fmt(refund.amount, refund.currency)}) → ${refund.status}` });
      res.json(refund);
    } catch (err) {
      store.logAction({ sessionId: 'merchant', tool: 'merchant_approve_refund', args: { refund_id: refund.id }, ok: false, summary: err.message });
      res.status(502).json({ error: err.message });
    }
  });

  app.get('/dashboard', merchantAuth, (_req, res) => res.sendFile(path.join(PUBLIC, 'dashboard.html')));
  app.use(express.static(PUBLIC));
  return app;
}
