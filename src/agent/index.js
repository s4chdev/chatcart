import { rulesAgent } from './rules.js';
import { llmAgent } from './llm.js';
import { suggestReplies } from './suggest.js';
import { cartView } from '../tools.js';

/** Handle one chat turn. LLM mode falls back to the rule-based agent if the LLM call fails. */
export async function handleMessage(ctx, message) {
  let result;
  if (ctx.config.llm.mode === 'llm') {
    try {
      result = await llmAgent(ctx, message);
    } catch (err) {
      console.warn('[agent] LLM failed, falling back to rules:', err.message);
      result = await rulesAgent(ctx, message);
      result.fallback = true;
    }
  } else {
    result = await rulesAgent(ctx, message);
  }
  return {
    reply: result.reply,
    attachments: dedupe(result.attachments),
    quickReplies: suggestReplies(ctx),
    cart: cartView(ctx.store.session(ctx.sessionId), ctx.config.currency),
    toolCalls: result.toolCalls,
    ...(result.fallback ? { fallback: true } : {}),
  };
}

// Keep only the latest cart card per turn so the chat doesn't stack duplicates.
function dedupe(atts = []) {
  const lastCart = atts.map((a) => a.type).lastIndexOf('cart');
  return atts.filter((a, i) => a.type !== 'cart' || i === lastCart);
}
