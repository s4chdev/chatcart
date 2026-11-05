import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createStore } from './store.js';
import { seedDemo } from './demo-seed.js';

const config = loadConfig();
const store = createStore();
if (config.demoSeed) {
  const n = seedDemo({ store, config });
  console.log(`Demo data seeded (${n.orders} orders, ${n.refunds} refunds, ${n.invoices} invoices; flagged demo). Set DEMO_SEED=0 to start empty.`);
}
createApp({ config, store }).listen(config.port, () => {
  console.log(`ChatCart running on ${config.baseUrl}  (PayPal: ${config.paypal.mode}, agent: ${config.llm.mode})`);
  console.log(`Chat: ${config.baseUrl}/   Merchant dashboard: ${config.baseUrl}/dashboard`);
});
