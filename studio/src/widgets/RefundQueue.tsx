// Custom AG Studio widget: the merchant's refund approval queue. Lists refunds the agent could not
// settle on its own (over the auto-refund limit or outside the window) with Approve / Reject buttons
// that call the merchant API; Studio's data is reloaded afterwards so every widget updates.
import { useState } from 'react';
import type { AgWidgetParams } from 'ag-studio';
import type { DashboardContext } from '../types';
import { ago, money, useRows } from './useRows';

const FIELDS = ['refunds.id', 'refunds.orderId', 'refunds.date', 'refunds.statusGroup', 'refunds.isPending', 'refunds.amount', 'refunds.reason', 'refunds.policyReason', 'refunds.buyer', 'refunds.demo'];

export default function RefundQueue(props: AgWidgetParams<any>) {
  const ctx = props.context as DashboardContext;
  const rows = useRows(props.widgetApi, 'refund-queue', FIELDS, (props.context as { version?: number })?.version);
  const [busy, setBusy] = useState<string | null>(null);
  // Decided refunds leave the queue at once, without waiting for Studio to re-query.
  const [decided, setDecided] = useState<string[]>([]);
  const pending = (rows ?? []).filter((r) => (r.isPending === true || r.statusGroup === 'Awaiting merchant') && !decided.includes(String(r.id)));
  const total = pending.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(id + decision);
    try { if (await ctx.decideRefund(id, decision)) setDecided((d) => [...d, id]); } finally { setBusy(null); }
  };

  return (
    <div className="rq">
      <div className="rq-head">
        <span className="rq-title">Refund approval queue</span>
        {pending.length > 0 && <span className="rq-count">{pending.length}</span>}
        <span className="rq-sub">{pending.length ? `${money(total, ctx.currency)} waiting` : `auto-limit ${money(ctx.policy.autoRefundLimit, ctx.currency)}`}</span>
      </div>
      {rows === null ? (
        <div className="rq-empty">Loading…</div>
      ) : pending.length === 0 ? (
        <div className="rq-empty"><div><b>✅</b>Nothing waiting. The agent settles refunds up to {money(ctx.policy.autoRefundLimit, ctx.currency)} itself.</div></div>
      ) : (
        <div className="rq-list">
          {pending.map((r) => {
            const id = String(r.id);
            return (
              <div className="rq-card" key={id}>
                <div className="rq-amt">{money(r.amount, ctx.currency)}{r.demo ? <span className="demo-tag">DEMO</span> : null}</div>
                <div className="rq-meta">{String(r.buyer ?? '')} · {String(r.orderId)} · {ago(r.date)}</div>
                <div className="rq-reason">“{String(r.reason || 'No reason given')}”</div>
                {r.policyReason ? <div className="rq-policy">⚖️ {String(r.policyReason)}</div> : null}
                <div className="rq-actions">
                  <button className="rq-btn rq-approve" disabled={!!busy} onClick={() => decide(id, 'approve')}>{busy === id + 'approve' ? 'Refunding…' : 'Approve'}</button>
                  <button className="rq-btn rq-reject" disabled={!!busy} onClick={() => decide(id, 'reject')}>{busy === id + 'reject' ? '…' : 'Reject'}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
