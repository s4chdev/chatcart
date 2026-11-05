import { useEffect, useState } from 'react';
import type { AgWidgetApi } from 'ag-studio';

/** Reads `fieldIds` through Studio's query engine (so page filters, the date filter and cross
 * filters apply) and keeps them up to date when the data or filters change. */
export function useRows(widgetApi: AgWidgetApi, queryId: string, fieldIds: string[], version = 0) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const key = fieldIds.join('|');
  useEffect(() => {
    let alive = true;
    // Query fields are Studio's own field objects, looked up by id in the report schema; each
    // result row is keyed by the field's `key`.
    const all = widgetApi.getSchema().flatMap((t) => t.fields) as any[];
    const fields = fieldIds.map((id) => all.find((f) => f.fieldId === id)).filter(Boolean);
    const pick = (raw: Record<string, any>[]) =>
      raw.map((r) => Object.fromEntries(fields.map((f) => [String(f.fieldId).split('.').pop()!, r[f.key] ?? r[f.fieldId]])));
    if (!fields.length) { setRows([]); return; }
    // After a reload, give Studio a moment to swap in the new data before asking again.
    const timer = window.setTimeout(() => widgetApi
      .getData(
        { kind: 'flat', fields } as any,
        {
          queryId,
          onDataUpdated: (next: any) => { if (alive && !next.replaced) setRows(pick(next.results.rows)); },
        } as any,
      )
      .then((res: any) => {
        if (!alive || res.replaced) return;
        setRows(pick(res.results.rows));
      })
      .catch((err) => { console.error('[ChatCart widget] query failed', err); if (alive) setRows([]); }), version ? 400 : 0);
    return () => { alive = false; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetApi, queryId, key, version]);
  return rows;
}

export const money = (n: unknown, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(n) || 0);

export const ago = (iso: unknown) => {
  const t = iso instanceof Date ? iso.getTime() : Date.parse(String(iso));
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
