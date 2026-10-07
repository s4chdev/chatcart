// LLM agent with a fake OpenAI-compatible endpoint: model calls a tool, then answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { llmAgent } from '../src/agent/llm.js';
import { loadConfig } from '../src/config.js';
import { createStore } from '../src/store.js';
import { createMockPayPal } from '../src/paypal/mock.js';

test('executes tool calls returned by the model and returns final text', async () => {
  const config = loadConfig({ LLM_API_KEY: 'k', LLM_MODEL: 'm', PAYPAL_MODE: 'mock' });
  const ctx = { config, store: createStore(), paypal: createMockPayPal({ baseUrl: 'http://x' }), sessionId: 'llm-1' };
  const replies = [
    { choices: [{ message: { content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'add_to_cart', arguments: '{"product_id":"fw-mojari","qty":2}' } }] } }] },
    { choices: [{ message: { content: 'Added 2 mojaris. Total **$44.00**.' } }] },
  ];
  const sent = [];
  const fakeFetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true, json: async () => replies.shift() }; };
  const out = await llmAgent(ctx, 'two mojaris please', fakeFetch);
  assert.deepEqual(out.toolCalls, ['add_to_cart']);
  assert.match(out.reply, /44/);
  assert.equal(ctx.store.session('llm-1').cart[0].qty, 2);
  assert.ok(sent[0].tools.some((t) => t.function.name === 'create_checkout'));
  assert.equal(sent[1].messages.at(-1).role, 'tool');
});
