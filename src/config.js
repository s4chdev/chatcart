import 'dotenv/config';

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export function loadConfig(env = process.env) {
  const paypalReal = Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET) && env.PAYPAL_MODE !== 'mock';
  const llmReal = Boolean(env.LLM_API_KEY && env.LLM_MODEL) && env.LLM_MODE !== 'mock';
  const port = num(env.PORT, 3000);
  return {
    port,
    baseUrl: (env.BASE_URL || `http://localhost:${port}`).replace(/\/$/, ''),
    shopName: env.SHOP_NAME || 'Marwar Crafts, Jodhpur',
    currency: env.CURRENCY || 'USD',
    paypal: {
      mode: paypalReal ? 'sandbox' : 'mock',
      clientId: env.PAYPAL_CLIENT_ID || '',
      clientSecret: env.PAYPAL_CLIENT_SECRET || '',
      apiBase: env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com',
      invoicerEmail: env.PAYPAL_INVOICER_EMAIL || '',
    },
    llm: {
      mode: llmReal ? 'llm' : 'mock',
      baseUrl: (env.LLM_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
      apiKey: env.LLM_API_KEY || '',
      model: env.LLM_MODEL || '',
    },
    policy: {
      // Refunds up to this amount are executed by the agent; above it they wait for the merchant.
      autoRefundLimit: num(env.AUTO_REFUND_LIMIT, 50),
      refundWindowDays: num(env.REFUND_WINDOW_DAYS, 30),
      // Carts with this many units or more are steered to a PayPal invoice (bulk/custom orders).
      bulkQtyThreshold: num(env.BULK_QTY_THRESHOLD, 10),
    },
  };
}
