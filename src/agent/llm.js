// LLM agent: any OpenAI-compatible /chat/completions endpoint with function calling
// (OpenRouter, Gemini's OpenAI endpoint, Groq, OpenAI...). The model decides which
// PayPal/catalog tools to call; guardrails live in the tools, not the prompt.
import { runTool, openAiTools } from '../tools.js';
import { CATALOG } from '../catalog.js';

const MAX_STEPS = 6;

export function systemPrompt(config) {
  const cats = [...new Set(CATALOG.map((p) => p.category))].join(', ');
  return `You are ChatCart, the WhatsApp shop agent for "${config.shopName}", a small handicrafts & textiles business in Jodhpur, Rajasthan.
You don't just recommend: you transact using tools. Categories: ${cats}. Prices are in ${config.currency}.
Rules:
- Always use search_catalog before naming products or prices; never invent products, prices, order ids or links.
- Use add_to_cart / remove_from_cart / view_cart to manage the cart. Confirm quantities briefly.
- When the buyer wants to pay, call create_checkout. The chat UI renders the PayPal button from the tool result, so don't paste the URL; just tell them to tap it and say "I have paid" afterwards.
- When the buyer says they paid, call capture_payment.
- For order questions call get_order_status. For refunds call request_refund with a short reason; refunds over ${config.currency} ${config.policy.autoRefundLimit} are queued for the merchant; explain that kindly.
- Bulk (${config.policy.bulkQtyThreshold}+ units) or custom orders: ask for an email and call create_invoice.
- Be warm, concise (WhatsApp style, 1-3 short sentences), use light Indian hospitality ("Namaste", "Dhanyavaad"). Use **bold** for totals.`;
}

export async function llmAgent(ctx, message, fetchImpl = fetch) {
  const { config, store } = ctx;
  const session = store.session(ctx.sessionId);
  session.history.push({ role: 'user', content: message });
  const messages = [{ role: 'system', content: systemPrompt(config) }, ...session.history.slice(-20)];
  // Never start the window on an orphaned tool message.
  while (messages.length > 1 && messages[1].role === 'tool') messages.splice(1, 1);
  const out = { reply: '', attachments: [], toolCalls: [] };

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await callLlm(config, messages, fetchImpl);
    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('LLM returned no message');
    const calls = msg.tool_calls || [];
    messages.push({ role: 'assistant', content: msg.content || '', ...(calls.length ? { tool_calls: calls } : {}) });
    session.history.push(messages.at(-1));
    if (!calls.length) {
      out.reply = msg.content || '';
      break;
    }
    for (const c of calls) {
      let args = {};
      try { args = JSON.parse(c.function.arguments || '{}'); } catch { /* bad JSON from model */ }
      out.toolCalls.push(c.function.name);
      const r = await runTool(ctx, c.function.name, args);
      out.attachments.push(...(r.attachments || []));
      const toolMsg = { role: 'tool', tool_call_id: c.id, content: JSON.stringify({ ok: r.ok, message: r.text, data: r.data ?? null }) };
      messages.push(toolMsg);
      session.history.push(toolMsg);
    }
  }
  if (!out.reply) out.reply = 'Done! Anything else I can help with?';
  if (session.history.length > 60) session.history.splice(0, session.history.length - 40);
  return out;
}

// Tries the configured model (a comma list is allowed, and a "-contributor" model also tries its
// base model) with the key as normalised and as given; remembers the first pair that works.
let working = null;
async function callLlm(config, messages, fetchImpl) {
  const models = config.llm.model.split(',').map((m) => m.trim()).filter(Boolean);
  for (const m of [...models]) if (m.endsWith('-contributor')) models.push(m.replace(/-contributor$/, ''));
  const keys = [...new Set([config.llm.apiKey, config.llm.apiKeyRaw].filter(Boolean))];
  const pairs = working ? [working] : models.flatMap((model) => keys.map((key) => ({ model, key })));
  let last;
  for (const p of pairs) {
    const res = await fetchImpl(`${config.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: p.model, messages, tools: openAiTools(), tool_choice: 'auto', temperature: 0.3 }),
    });
    if (res.ok) {
      if (!working) console.log(`[agent] LLM ok with model ${p.model} (key variant ${keys.indexOf(p.key)})`);
      working = p;
      return res;
    }
    last = `LLM error ${res.status} (model ${JSON.stringify(p.model)}, key variant ${keys.indexOf(p.key)}): ${(await res.text()).slice(0, 300)}`;
    if (working || (res.status !== 404 && res.status !== 401 && res.status !== 403)) break;
  }
  working = null;
  for (const [i, k] of keys.entries()) {
    try {
      const r = await fetchImpl(`${config.llm.baseUrl}/models`, { headers: { Authorization: `Bearer ${k}` } });
      const j = await r.json().catch(() => ({}));
      last += ` | /models v${i} ${r.status}: ${(j.data || []).map((m) => m.id).join(',') || JSON.stringify(j).slice(0, 160)}`;
    } catch { /* ignore */ }
  }
  throw new Error(last);
}
