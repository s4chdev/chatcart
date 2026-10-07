export const toCents = (n) => Math.round(Number(n) * 100);
export const fromCents = (c) => Math.round(c) / 100;
export const fmt = (n, currency = 'USD') => {
  const sym = { USD: '$', EUR: '€', GBP: '£', INR: '₹' }[currency] || `${currency} `;
  return `${sym}${Number(n).toFixed(2)}`;
};
export const str = (n) => Number(n).toFixed(2);
