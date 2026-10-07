// Rule-based agent used in MOCK mode (no LLM key). It maps chat messages to the same
// tools the LLM uses, so the PayPal flow is identical in both modes.
import { runTool } from '../tools.js';
import { resolveProduct, CATALOG } from '../catalog.js';
import { fmt } from '../money.js';

const NUM_WORDS = { one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, twenty: 20 };

export function parseIntent(raw) {
  const m = String(raw || '').trim();
  const t = m.toLowerCase();
  const email = m.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
  const money = t.match(/(?:\$|usd\s?|rs\.?\s?|₹)\s?(\d+(?:\.\d{1,2})?)/)?.[1];

  if (/^(hi|hello|hey|namaste|hola|yo)\b/.test(t) && t.length < 25) return { intent: 'greet' };
  if (/\b(help|what can you do)\b/.test(t)) return { intent: 'help' };
  if (/\brefund|money back|return\b/.test(t)) {
    const reason = m.replace(/.*?refund\s*/i, '').replace(/(?:\$|usd\s?|₹)\s?\d+(?:\.\d+)?/i, '').replace(/^[\s,–-]+|[\s,–-]+$/g, '').replace(/^(for|of|please|because|the rest|everything|all|full)[\s,]*/i, '');
    return { intent: 'refund', amount: money ? Number(money) : undefined, reason: reason || 'Customer request', orderId: m.match(/\b(MOCK[A-Z0-9]+|[A-Z0-9]{17})\b/)?.[1] };
  }
  if (/\binvoice|bulk|wholesale|custom order\b/.test(t)) return { intent: 'invoice', email, ...parseAdd(t, true) };
  if (/\b(i('ve| have)? paid|paid|payment done|done paying|capture)\b/.test(t)) return { intent: 'capture' };
  if (/\b(status|track|where is my order|my orders?)\b/.test(t)) return { intent: 'status', orderId: m.match(/\b(MOCK[A-Z0-9]+|[A-Z0-9]{17})\b/)?.[1] };
  if (/\b(checkout|check out|pay now|place order|buy now)\b/.test(t)) return { intent: 'checkout' };
  if (/\b(remove|delete)\b/.test(t)) return { intent: 'remove', ...parseAdd(t) };
  if (/\b(cart|basket)\b/.test(t)) return { intent: 'cart' };
  if (/\b(add|take|buy|want|i'?ll have)\b/.test(t)) {
    const a = parseAdd(t);
    if (a.product) return { intent: 'add', ...a };
  }
  if (/\b(catalog|catalogue|everything|all products|menu)\b/.test(t)) return { intent: 'browse', query: '' };
  const under = t.match(/under\s*\$?\s?(\d+)/)?.[1];
  const q = t.replace(/under\s*\$?\s?\d+/, '').replace(/\b(show( me)?|do you (have|sell)|looking for|search|find|i need|any|some|please|the|your)\b/g, ' ').trim();
  if (q || under) return { intent: 'browse', query: q, maxPrice: under ? Number(under) : undefined };
  return { intent: 'help' };
}

function parseAdd(t, allowMissing = false) {
  const qtyMatch = t.match(/\b(\d+)\b/) || t.match(new RegExp(`\\b(${Object.keys(NUM_WORDS).join('|')})\\b`));
  const qty = qtyMatch ? (Number(qtyMatch[1]) || NUM_WORDS[qtyMatch[1]] || 1) : 1;
  const idHit = t.match(/\b([a-z]{2}-[a-z]+)\b/)?.[1];
  const rest = t.replace(/\b(add|take|buy|want|i'?ll have|remove|delete|to|my|cart|from|of|please|invoice|bulk|send|for|an?|\d+)\b/g, ' ').replace(/\S+@\S+/g, ' ');
  const product = resolveProduct(idHit) || resolveProduct(rest);
  return product || allowMissing ? { product, qty } : { product: null, qty };
}

export async function rulesAgent(ctx, message) {
  const it = parseIntent(message);
  const out = { reply: '', attachments: [], toolCalls: [] };
  const call = async (name, args) => {
    out.toolCalls.push(name);
    const r = await runTool(ctx, name, args);
    out.attachments.push(...(r.attachments || []));
    return r;
  };
  const cur = ctx.config.currency;

  switch (it.intent) {
    case 'greet':
      out.reply = `Namaste! 🙏 Welcome to **${ctx.config.shopName}**. We make hand-block bedsheets, dhurries, mojaris and more. What are you looking for today?`;
      break;
    case 'help':
      out.reply = 'I can **show products**, **add to cart**, **checkout with PayPal**, confirm your **payment**, check **order status**, process **refunds**, and send a **PayPal invoice** for bulk/custom orders. Try "show me bedsheets".';
      break;
    case 'browse': {
      const r = await call('search_catalog', { query: it.query, max_price: it.maxPrice });
      out.reply = r.ok && r.data.length
        ? `Here ${r.data.length === 1 ? 'is' : 'are'} ${r.data.length} pick${r.data.length === 1 ? '' : 's'} from our Jodhpur workshop${it.query ? ` for "${it.query}"` : ''}. Tap **Add to cart** or tell me e.g. "add 2 ${r.data[0].id}".`
        : `Hmm, nothing matched "${it.query}". We carry: ${[...new Set(CATALOG.map((p) => p.category))].join(', ')}.`;
      if (!r.data?.length) { await call('search_catalog', { query: '' }); out.reply += ' Here is the full catalog:'; }
      break;
    }
    case 'add': {
      const r = await call('add_to_cart', { product_id: it.product.id, qty: it.qty });
      out.reply = r.ok ? `✅ ${r.text} Cart total: **${fmt(r.data.total, cur)}**. Say **checkout** when ready.` : r.text;
      break;
    }
    case 'remove': {
      const r = it.product ? await call('remove_from_cart', { product_id: it.product.id }) : { text: 'Which item should I remove?' };
      out.reply = r.text;
      break;
    }
    case 'cart': {
      const r = await call('view_cart', {});
      out.reply = r.data.items.length ? `Your cart: **${fmt(r.data.total, cur)}**.` : 'Your cart is empty. Want to see the catalog?';
      break;
    }
    case 'checkout': {
      const r = await call('create_checkout', {});
      out.reply = r.ok
        ? `🧾 I've created a PayPal order for **${fmt(r.data.total, cur)}**. Tap the button to pay securely with PayPal, then come back and say "I have paid".`
        : r.text;
      break;
    }
    case 'capture': {
      const r = await call('capture_payment', {});
      out.reply = r.ok
        ? `🎉 Payment received! Order **${r.data.order_id}** is ${r.data.status}. We'll pack it in Jodhpur and ship within 2 days. Dhanyavaad!`
        : r.text;
      break;
    }
    case 'status': {
      const r = await call('get_order_status', { order_id: it.orderId });
      out.reply = r.ok ? `Order **${r.data.order_id}**: ${r.data.status}${r.data.refunded ? ` (refunded ${fmt(r.data.refunded, cur)})` : ''}.` : r.text;
      break;
    }
    case 'refund': {
      const r = await call('request_refund', { order_id: it.orderId, amount: it.amount, reason: it.reason });
      if (!r.ok) out.reply = r.text;
      else if (r.data.status === 'PENDING_MERCHANT_APPROVAL') out.reply = `I've raised a refund of **${fmt(r.data.amount, cur)}**. Shop policy says refunds like this (${r.data.policy}) need the owner's OK, so it's waiting for approval. You'll get it as soon as they approve.`;
      else out.reply = `💸 Done: **${fmt(r.data.amount, cur)}** refunded to your PayPal. Order is now ${r.data.order_status}. Sorry about the trouble!`;
      break;
    }
    case 'invoice': {
      if (it.product) await call('add_to_cart', { product_id: it.product.id, qty: it.qty });
      if (!it.email) { out.reply = 'Happy to send a PayPal invoice for a bulk/custom order. Which email should I send it to?'; break; }
      const r = await call('create_invoice', { recipient_email: it.email });
      out.reply = r.ok ? `📨 ${r.text} The buyer can pay it with PayPal or card.` : r.text;
      break;
    }
    default:
      out.reply = 'Sorry, I did not get that. Try "show catalog".';
  }
  return out;
}
