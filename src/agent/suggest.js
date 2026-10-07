// Context-aware quick-reply chips, shared by both agents.
export function suggestReplies(ctx) {
  const s = ctx.store.session(ctx.sessionId);
  const order = s.lastOrderId ? ctx.store.getOrder(s.lastOrderId) : null;
  if (order && !order.captureId && ['CREATED', 'PAYER_ACTION_REQUIRED', 'APPROVED'].includes(order.status)) return ['I have paid', 'Order status', 'My cart'];
  if (s.cart.length) return ['Checkout', 'My cart', 'Show catalog'];
  if (order?.captureId) return ['Order status', 'Refund $10 – item damaged', 'Show catalog'];
  return ['Show catalog', 'Show me bedsheets', 'Gifts under $20'];
}
