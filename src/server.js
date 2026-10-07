import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
createApp({ config }).listen(config.port, () => {
  console.log(`ChatCart running on ${config.baseUrl}  (PayPal: ${config.paypal.mode}, agent: ${config.llm.mode})`);
  console.log(`Chat: ${config.baseUrl}/   Merchant dashboard: ${config.baseUrl}/dashboard`);
});
