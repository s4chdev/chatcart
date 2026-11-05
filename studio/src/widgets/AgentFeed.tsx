// Custom AG Studio widget: a chat-style timeline of what the ChatCart agent (and the merchant) did,
// read from the agentActions table through Studio's query engine, so the date filter applies.
import type { AgWidgetParams } from 'ag-studio';
import { ago, useRows } from './useRows';

const FIELDS = ['agentActions.id', 'agentActions.ts', 'agentActions.tool', 'agentActions.actor', 'agentActions.ok', 'agentActions.summary', 'agentActions.demo'];
const ICON: Record<string, string> = {
  search_catalog: '🔎', add_to_cart: '🛒', view_cart: '🧺', remove_from_cart: '🗑️', create_order: '🧾', capture_payment: '💳',
  get_order_status: '📦', request_refund: '↩️', create_invoice: '📨', merchant_approve_refund: '✅', merchant_reject_refund: '⛔',
};

export default function AgentFeed(props: AgWidgetParams<any>) {
  const rows = useRows(props.widgetApi, 'agent-feed', FIELDS, (props.context as { version?: number })?.version);
  const time = (v: unknown) => (v instanceof Date ? v.getTime() : Date.parse(String(v)) || 0);
  const items = [...(rows ?? [])].sort((a, b) => time(b.ts) - time(a.ts)).slice(0, 60);
  return (
    <div className="af">
      <div className="af-head">
        <span className="af-title">Agent activity</span>
        <span className="af-sub">{rows ? `${rows.length} actions` : ''}</span>
      </div>
      <div className="af-list">
        {rows === null && <div className="rq-empty">Loading…</div>}
        {rows !== null && items.length === 0 && <div className="rq-empty">No agent activity yet. Start a chat at <a href="/">/</a>.</div>}
        {items.map((a) => {
          const who = a.actor === 'Merchant' ? 'merchant' : '';
          const fail = a.ok === false ? 'fail' : '';
          return (
            <div className="af-item" key={String(a.id)}>
              <div className={`af-dot ${who} ${fail}`}>{fail ? '⚠️' : ICON[String(a.tool)] || '🤖'}</div>
              <div>
                <div className={`af-bubble ${who} ${fail}`}>{String(a.summary || a.tool)}</div>
                <div className="af-meta"><span className="af-tool">{String(a.tool)}</span><span>{String(a.actor)}</span><span>{ago(a.ts)}</span>{a.demo ? <span className="demo-tag">DEMO</span> : null}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
