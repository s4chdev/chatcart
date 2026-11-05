// Shape of GET /api/studio/data (built by src/studio-data.js on the Express side).
export interface StudioPayload {
  asOf: string;
  shop: string;
  currency: string;
  mode: { paypalMode: string; llmMode: string };
  policy: { autoRefundLimit: number; refundWindowDays: number; bulkQtyThreshold: number };
  demo: boolean;
  orders: Record<string, unknown>[];
  orderItems: Record<string, unknown>[];
  products: Record<string, unknown>[];
  refunds: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  agentActions: Record<string, unknown>[];
  studio: { licenseKey?: string; aiModels: string[] };
}

/** Passed to every widget through Studio's `context` property. */
export interface DashboardContext {
  currency: string;
  /** Bumped every time the data is reloaded, so custom widgets query again. */
  version: number;
  policy: StudioPayload['policy'];
  /** Approve or reject a refund through the merchant API, then reload the data. */
  decideRefund(id: string, decision: 'approve' | 'reject'): Promise<boolean>;
}
