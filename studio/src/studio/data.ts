// AG Studio data sources for ChatCart: one table per row type from GET /api/studio/data, the
// relationships between them, a shared calendar and a few calculated measures.
import type { AgDataSourcesDefinition, AgExpressionFieldDefinition, AgFieldDefinition, AgFormat, AgRelationDefinition } from 'ag-studio';
import type { StudioPayload } from '../types';

const CALENDAR_ID = 'calendar';
type FieldSpec = [id: string, name: string, format: AgFormat, hide?: boolean];
let money: Intl.NumberFormat | undefined;
// Currency fields show the shop currency's symbol ($1,234.00) instead of a bare number.
const fields = (specs: FieldSpec[]): AgFieldDefinition[] =>
  specs.map(([id, name, format, hide]) => ({
    id, name, format, ...(hide && { hide }),
    ...(format === 'currencyFormat' && money && { formatOptions: { format: money } }),
  }) as AgFieldDefinition);

const manyToOne = (id: string, source: string, target: string): AgRelationDefinition => {
  const [sourceTable, sourceField] = source.split('.');
  const [targetTable, targetField] = target.split('.');
  return { id, source: { tableId: sourceTable, fieldId: sourceField }, target: { tableId: targetTable, fieldId: targetField }, type: 'many-to-one' };
};
const onCalendar = (tableId: string, fieldId: string): AgRelationDefinition => ({
  id: `${tableId}-${fieldId}-calendar`,
  source: { tableId, fieldId },
  target: { calendarId: CALENDAR_ID },
});
const sumOf = (id: string) => ({ id, aggregation: 'sum' as const });
const ratio = (id: string, name: string, description: string, numerator: string, denominator: string): AgExpressionFieldDefinition => ({
  id, name, description, format: 'percentageFormat', isMeasure: true,
  expression: { operator: 'divide', inputs: [sumOf(numerator), sumOf(denominator)] },
});

export const hasData = (d: StudioPayload) => d.orders.length + d.invoices.length + d.agentActions.length > 0;

export function buildStudioData(d: StudioPayload): AgDataSourcesDefinition {
  const dates = [...d.orders, ...d.refunds, ...d.invoices, ...d.agentActions]
    .map((r) => r.date as string | null)
    .filter((x): x is string => !!x)
    .sort();
  const today = d.asOf.slice(0, 10);
  money = new Intl.NumberFormat('en-US', { style: 'currency', currency: d.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return {
    description:
      `ChatCart: an AI shop agent for "${d.shop}", a small handicrafts and textiles shop that sells over a WhatsApp-style chat ` +
      `and takes payment through PayPal (Orders v2 checkout, Payments refunds, Invoicing v2 for bulk orders). All money is in ${d.currency}. ` +
      `Refunds up to ${d.policy.autoRefundLimit} ${d.currency} are executed by the agent automatically; larger ones or ones older than ` +
      `${d.policy.refundWindowDays} days wait for the merchant. Orders of ${d.policy.bulkQtyThreshold}+ units are sent a PayPal invoice instead.` +
      (d.demo ? ' Rows with demo = true are seeded demo data.' : ''),
    sources: [
      {
        id: 'orders',
        description: 'One row per chat checkout (PayPal order). Captured is the paid amount, refunded what has been returned, net = captured - refunded.',
        data: d.orders,
        fields: fields([
          ['id', 'Order ID', 'textFormat'],
          ['date', 'Order Date', 'dateFormat'],
          ['createdAt', 'Created At', 'dateTimeFormat', true],
          ['buyer', 'Buyer', 'textFormat'],
          ['status', 'PayPal Status', 'textFormat'],
          ['statusGroup', 'Order Status', 'textFormat'],
          ['isPaid', 'Is Paid', 'booleanFormat'],
          ['units', 'Units', 'integerFormat'],
          ['lines', 'Lines', 'integerFormat', true],
          ['total', 'Order Total', 'currencyFormat'],
          ['captured', 'Revenue Captured', 'currencyFormat'],
          ['refunded', 'Refunded', 'currencyFormat'],
          ['net', 'Net Revenue', 'currencyFormat'],
          ['currency', 'Currency', 'textFormat', true],
          ['demo', 'Demo', 'booleanFormat', true],
        ]),
      },
      {
        id: 'orderItems',
        name: 'Order Lines',
        description: 'Order lines with product and category. Order refunds are spread across lines by value, so refunds can be read by product.',
        data: d.orderItems,
        fields: fields([
          ['id', 'Line ID', 'textFormat', true],
          ['orderId', 'Order ID', 'textFormat', true],
          ['productId', 'Product ID', 'textFormat', true],
          ['product', 'Product', 'textFormat'],
          ['productFull', 'Product (full name)', 'textFormat', true],
          ['category', 'Category', 'textFormat'],
          ['date', 'Line Date', 'dateFormat', true],
          ['qty', 'Quantity', 'integerFormat'],
          ['unitPrice', 'Unit Price', 'currencyFormat'],
          ['lineTotal', 'Line Total', 'currencyFormat'],
          ['captured', 'Line Revenue', 'currencyFormat'],
          ['refunded', 'Line Refunded', 'currencyFormat'],
          ['net', 'Line Net', 'currencyFormat'],
        ]),
      },
      {
        id: 'products',
        description: 'The shop catalog (Jodhpur handicrafts).',
        data: d.products,
        fields: fields([
          ['id', 'Product ID', 'textFormat', true],
          ['name', 'Catalog Product', 'textFormat'],
          ['fullName', 'Catalog Product (full name)', 'textFormat', true],
          ['category', 'Catalog Category', 'textFormat'],
          ['price', 'List Price', 'currencyFormat'],
          ['stock', 'Stock', 'integerFormat'],
          ['emoji', 'Icon', 'textFormat', true],
        ]),
      },
      {
        id: 'refunds',
        description: 'Refund requests made through the chat agent. Status: COMPLETED, PENDING_MERCHANT_APPROVAL or REJECTED.',
        data: d.refunds,
        fields: fields([
          ['id', 'Refund ID', 'textFormat'],
          ['orderId', 'Refund Order ID', 'textFormat'],
          ['date', 'Refund Date', 'dateFormat'],
          ['status', 'Refund PayPal Status', 'textFormat', true],
          ['statusGroup', 'Refund Status', 'textFormat'],
          ['amount', 'Refund Requested', 'currencyFormat'],
          ['refundedAmount', 'Refunded to Buyer', 'currencyFormat'],
          ['pendingAmount', 'Refund Pending', 'currencyFormat'],
          ['rejectedAmount', 'Refund Rejected', 'currencyFormat'],
          ['isPending', 'Awaiting Merchant', 'booleanFormat'],
          ['decidedBy', 'Decided By', 'textFormat'],
          ['reason', 'Refund Reason', 'textFormat'],
          ['policyReason', 'Policy Rule', 'textFormat'],
          ['buyer', 'Refund Buyer', 'textFormat'],
          ['demo', 'Refund Demo', 'booleanFormat', true],
        ]),
      },
      {
        id: 'invoices',
        description: 'PayPal invoices (Invoicing v2) sent for bulk or custom orders. Outstanding = unpaid total.',
        data: d.invoices,
        fields: fields([
          ['id', 'Invoice', 'textFormat'],
          ['date', 'Invoice Date', 'dateFormat'],
          ['recipient', 'Invoice Recipient', 'textFormat'],
          ['status', 'Invoice PayPal Status', 'textFormat', true],
          ['statusGroup', 'Invoice Status', 'textFormat'],
          ['isPaid', 'Invoice Paid', 'booleanFormat'],
          ['units', 'Invoice Units', 'integerFormat'],
          ['total', 'Invoice Total', 'currencyFormat'],
          ['paidAmount', 'Invoice Collected', 'currencyFormat'],
          ['outstanding', 'Invoice Outstanding', 'currencyFormat'],
          ['currency', 'Invoice Currency', 'textFormat', true],
          ['demo', 'Invoice Demo', 'booleanFormat', true],
        ]),
      },
      {
        id: 'agentActions',
        name: 'Agent Actions',
        description: 'Audit log of every tool the ChatCart agent (and the merchant) ran: PayPal orders, captures, refunds, invoices.',
        data: d.agentActions,
        fields: fields([
          ['id', 'Action ID', 'textFormat', true],
          ['ts', 'Action Time', 'dateTimeFormat'],
          ['date', 'Action Date', 'dateFormat', true],
          ['tool', 'Tool', 'textFormat'],
          ['actor', 'Actor', 'textFormat'],
          ['session', 'Session', 'textFormat'],
          ['ok', 'Succeeded', 'booleanFormat', true],
          ['outcome', 'Outcome', 'textFormat'],
          ['summary', 'Summary', 'textFormat'],
          ['demo', 'Action Demo', 'booleanFormat', true],
        ]),
      },
    ],
    relationships: [
      manyToOne('line-order', 'orderItems.orderId', 'orders.id'),
      manyToOne('line-product', 'orderItems.productId', 'products.id'),
      manyToOne('refund-order', 'refunds.orderId', 'orders.id'),
      onCalendar('orders', 'date'),
      onCalendar('refunds', 'date'),
      onCalendar('invoices', 'date'),
      onCalendar('agentActions', 'date'),
    ],
    calendars: [
      {
        id: CALENDAR_ID,
        label: 'Calendar',
        range: { from: { type: 'date', value: dates[0] ?? today }, to: { type: 'date', value: dates.at(-1) ?? today } },
        fragments: ['year', 'month', 'week', 'day', 'dayOfWeek'],
      },
    ],
    expressions: [
      ratio('refundRate', 'Refund Rate', 'Refunded / captured revenue across orders.', 'orders.refunded', 'orders.captured'),
      ratio('productRefundRate', 'Product Refund Rate', 'Refunded / revenue on order lines; use it per product or category.', 'orderItems.refunded', 'orderItems.captured'),
      ratio('collectionRate', 'Invoice Collection Rate', 'Collected / invoiced on PayPal invoices.', 'invoices.paidAmount', 'invoices.total'),
    ],
  };
}
