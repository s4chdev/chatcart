// The built-in "Marwar Crafts" report: Overview, Refunds & invoices, Agent log. Field ids refer to
// ./data.ts; 'refund-queue' and 'agent-feed' are ChatCart's custom widgets (../widgets).
import type { AgReportState, AgWidgetLayoutState } from 'ag-studio';

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string) => ({ title: { enabled: true, text } });
const sum = (id: string) => ({ id, aggregation: 'sum' as const });
const countd = (id: string) => ({ id, aggregation: 'countd' as const });
const FONT = '"Inter", "Segoe UI", system-ui, -apple-system, Helvetica, Arial, sans-serif';
const typography = (fontSize: number, fontWeight: 'normal' | 'bold' = 'normal') => ({ fontFamily: FONT, fontSize, fontWeight, fontStyle: 'normal' as const });
const legend = { style: { theme: { common: { legend: { enabled: true } } } } };

const kpi = (text: string, value: { id: string; aggregation?: 'sum' | 'avg' | 'countd' }, caption = '', sparklineX?: string) => ({
  type: 'value' as const,
  dataMapping: { value: [value], ...(sparklineX && { sparklineX: [{ id: sparklineX }] }) },
  format: {
    title: { enabled: true, text, typography: typography(13, 'bold') },
    caption: { enabled: Boolean(caption), text: caption, typography: typography(11) },
    style: { typography: typography(24, 'bold') },
  },
});

const overview: any = {
  id: 'overview',
  widgets: {
    'kpi-revenue': kpi('Revenue captured', sum('orders.captured'), 'PayPal captures, before refunds', 'calendar::week'),
    'kpi-orders': kpi('Orders', countd('orders.id'), 'chat checkouts', 'calendar::week'),
    'kpi-refund-rate': kpi('Refund rate', { id: 'refundRate' }, 'refunded ÷ captured'),
    'kpi-outstanding': kpi('Outstanding invoices', sum('invoices.outstanding'), 'unpaid PayPal invoices'),
    'order-date': {
      type: 'date-filter',
      dataMapping: { value: [{ id: 'orders.date' }] },
      format: { style: { filterType: 'relative' } },
    },
    'revenue-by-product': {
      type: 'bar-chart-grouped',
      dataMapping: { categoryKey: [{ id: 'orderItems.product' }], valueKey: [sum('orderItems.captured'), sum('orderItems.refunded')] },
      sort: [{ field: sum('orderItems.captured'), direction: 'desc' }],
      format: { ...title('Revenue and refunds by product'), ...legend },
    },
    'revenue-by-category': {
      type: 'donut-chart',
      dataMapping: { categoryKey: [{ id: 'orderItems.category' }], valueKey: [sum('orderItems.captured')] },
      format: { ...title('Revenue by category'), style: { custom: { pieDataLabel: { enabled: true }, totalLabel: { enabled: true } }, theme: { common: { legend: { enabled: true, position: 'right' } } } } },
    },
    'refund-queue': { type: 'refund-queue', dataMapping: {} },
    'refunds-over-time': {
      type: 'column-chart-stacked',
      dataMapping: { categoryKey: [{ id: 'calendar::week' }], valueKey: [sum('refunds.refundedAmount'), sum('refunds.pendingAmount'), sum('refunds.rejectedAmount')] },
      format: { ...title('Refunds by week and outcome'), ...legend },
    },
    'invoices-paid': {
      type: 'donut-chart',
      dataMapping: { categoryKey: [{ id: 'invoices.statusGroup' }], valueKey: [sum('invoices.total')] },
      format: { ...title('Invoices: paid vs unpaid'), style: { custom: { pieDataLabel: { enabled: true }, totalLabel: { enabled: true } } } },
    },
    'agent-feed': { type: 'agent-feed', dataMapping: {} },
    orders: {
      type: 'grid',
      dataMapping: {
        cols: [
          { id: 'orders.id' }, { id: 'orders.date' }, { id: 'orders.buyer' }, { id: 'orders.statusGroup' },
          sum('orders.units'), sum('orders.total'), sum('orders.captured'), sum('orders.refunded'), sum('orders.net'),
        ],
      },
      sort: [{ field: { id: 'orders.date' }, direction: 'desc' }],
      format: { ...title('Orders'), style: { grandTotalRow: { enabled: false } } },
    },
  },
  widgetLayout: {
    'kpi-revenue': at(0, 0, 4, 7),
    'kpi-orders': at(4, 0, 4, 7),
    'kpi-refund-rate': at(8, 0, 4, 7),
    'kpi-outstanding': at(12, 0, 4, 7),
    'order-date': at(16, 0, 8, 7),
    'revenue-by-category': at(0, 7, 7, 18),
    'revenue-by-product': at(7, 7, 10, 18),
    'refund-queue': at(17, 7, 7, 18),
    'refunds-over-time': at(0, 25, 10, 16),
    'invoices-paid': at(10, 25, 7, 16),
    'agent-feed': at(17, 25, 7, 38),
    orders: at(0, 41, 17, 22),
  },
};

const refunds: any = {
  id: 'refunds',
  widgets: {
    'kpi-paid-out': kpi('Refunded to buyers', sum('refunds.refundedAmount')),
    'kpi-pending': kpi('Awaiting your approval', sum('refunds.pendingAmount')),
    'kpi-collected': kpi('Invoices collected', sum('invoices.paidAmount')),
    'kpi-collection-rate': kpi('Invoice collection rate', { id: 'collectionRate' }),
    'refund-rate-by-product': {
      type: 'bar-chart-grouped',
      dataMapping: { categoryKey: [{ id: 'orderItems.product' }], valueKey: [{ id: 'productRefundRate' }] },
      sort: [{ field: { id: 'productRefundRate' }, direction: 'desc' }],
      format: title('Refund rate by product'),
    },
    'refund-reasons': {
      type: 'pie-chart',
      dataMapping: { categoryKey: [{ id: 'refunds.reason' }], valueKey: [sum('refunds.amount')] },
      format: title('Why buyers ask for refunds'),
    },
    'refund-queue': { type: 'refund-queue', dataMapping: {} },
    'refund-grid': {
      type: 'grid',
      dataMapping: {
        cols: [
          { id: 'refunds.id' }, { id: 'refunds.date' }, { id: 'refunds.buyer' }, { id: 'refunds.statusGroup' }, { id: 'refunds.decidedBy' },
          { id: 'refunds.reason' }, { id: 'refunds.policyReason' }, sum('refunds.amount'),
        ],
      },
      sort: [{ field: { id: 'refunds.date' }, direction: 'desc' }],
      format: title('Refund requests'),
    },
    'invoice-grid': {
      type: 'grid',
      dataMapping: {
        cols: [{ id: 'invoices.id' }, { id: 'invoices.date' }, { id: 'invoices.recipient' }, { id: 'invoices.statusGroup' }, sum('invoices.units'), sum('invoices.total'), sum('invoices.outstanding')],
      },
      sort: [{ field: { id: 'invoices.date' }, direction: 'desc' }],
      format: title('PayPal invoices (bulk orders)'),
    },
  },
  widgetLayout: {
    'kpi-paid-out': at(0, 0, 6, 7),
    'kpi-pending': at(6, 0, 6, 7),
    'kpi-collected': at(12, 0, 6, 7),
    'kpi-collection-rate': at(18, 0, 6, 7),
    'refund-rate-by-product': at(0, 7, 10, 18),
    'refund-reasons': at(10, 7, 7, 18),
    'refund-queue': at(17, 7, 7, 18),
    'refund-grid': at(0, 25, 24, 18),
    'invoice-grid': at(0, 43, 24, 16),
  },
};

const agent: any = {
  id: 'agent',
  widgets: {
    'kpi-actions': kpi('Agent actions', countd('agentActions.id')),
    'kpi-sessions': kpi('Chat sessions', countd('agentActions.session')),
    'kpi-orders': kpi('Orders created', countd('orders.id')),
    'kpi-invoices': kpi('Invoices sent', countd('invoices.id')),
    'actions-by-tool': {
      type: 'column-chart-stacked',
      dataMapping: { categoryKey: [{ id: 'agentActions.tool' }], valueKey: [countd('agentActions.id')], legendKey: [{ id: 'agentActions.actor' }] },
      format: { ...title('What the agent did, by tool'), ...legend },
    },
    'agent-feed': { type: 'agent-feed', dataMapping: {} },
    'actions-grid': {
      type: 'grid',
      dataMapping: { cols: [{ id: 'agentActions.ts' }, { id: 'agentActions.actor' }, { id: 'agentActions.tool' }, { id: 'agentActions.outcome' }, { id: 'agentActions.session' }, { id: 'agentActions.summary' }] },
      sort: [{ field: { id: 'agentActions.ts' }, direction: 'desc' }],
      format: title('Agent actions log'),
    },
  },
  widgetLayout: {
    'kpi-actions': at(0, 0, 6, 7),
    'kpi-sessions': at(6, 0, 6, 7),
    'kpi-orders': at(12, 0, 6, 7),
    'kpi-invoices': at(18, 0, 6, 7),
    'actions-by-tool': at(0, 7, 16, 18),
    'agent-feed': at(16, 7, 8, 42),
    'actions-grid': at(0, 25, 16, 24),
  },
};

export const PAGE_TITLES: Record<string, string> = { overview: 'Overview', refunds: 'Refunds & invoices', agent: 'Agent log' };

// Custom widget types aren't in Studio's default registry type, hence the cast.
export const initialReport = {
  selectedPageId: overview.id,
  pages: [overview, refunds, agent],
  panels: { filters: { collapsed: true } },
} as unknown as AgReportState;
