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
    // Demo data for the merchant dashboard: on by default in mock mode, DEMO_SEED=0 turns it off,
    // DEMO_SEED=1 forces it on (demo records are flagged `demo: true` and never touch PayPal).
    demoSeed: env.DEMO_SEED === '1' || (env.DEMO_SEED !== '0' && !paypalReal),
    studio: {
      licenseKey: env.AG_STUDIO || '',
      // AG Studio's AI assistant speaks the OpenAI Responses API. Its own key wins; otherwise the
      // shop agent's OpenAI-compatible LLM settings are reused.
      ai: {
        apiKey: env.AG_STUDIO_OPENAI_API_KEY || env.LLM_API_KEY || '',
        baseUrl: (env.AG_STUDIO_AI_BASE_URL || (env.AG_STUDIO_OPENAI_API_KEY ? 'https://api.openai.com/v1' : env.LLM_BASE_URL || 'https://api.openai.com/v1')).replace(/\/$/, ''),
        models: (env.AG_STUDIO_AI_MODELS || (env.AG_STUDIO_OPENAI_API_KEY ? 'gpt-5.4-mini' : env.LLM_MODEL || ''))
          .split(',').map((m) => m.trim()).filter(Boolean),
        maxOutputTokens: num(env.AG_STUDIO_AI_MAX_TOKENS, 16000),
        disabled: env.AG_STUDIO_AI === 'off',
      },
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
