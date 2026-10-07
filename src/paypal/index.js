import { createPayPalClient } from './client.js';
import { createMockPayPal } from './mock.js';

export function createPayPal(config) {
  return config.paypal.mode === 'sandbox'
    ? createPayPalClient(config.paypal)
    : createMockPayPal({ baseUrl: config.baseUrl });
}
