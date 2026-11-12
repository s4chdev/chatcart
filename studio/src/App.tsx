// ChatCart merchant dashboard on AG Studio. A thin shell (header, page tabs, edit/view, undo/redo,
// save/reset layout) around one AgStudio instance. Data comes from GET /api/studio/data; refund
// decisions go to POST /api/merchant/refunds/:id/approve|reject and then reload the data.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgStudioAiModule, type AgReportState, type AgStudioApi, type AgStudioMode } from 'ag-studio';
import { AgStudio, AgStudioProvider } from 'ag-studio-react';
import type { DashboardContext, StudioPayload } from './types';
import { buildStudioData, hasData } from './studio/data';
import { chatCartTheme } from './studio/theme';
import { initialReport, PAGE_TITLES } from './studio/initial-report';
import { buildAi } from './studio/ai';
import { chatCartWidgets } from './widgets';

const STORAGE_KEY = 'chatcart.studio.report.v1';

const loadSaved = (): AgReportState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return initialReport;
};

const withFiltersPanelFor = (mode: AgStudioMode, s: AgReportState): AgReportState => ({
  ...s,
  panels: { ...s.panels, filters: { ...s.panels?.filters, collapsed: true } },
});

async function fetchData(): Promise<StudioPayload> {
  const res = await fetch('/api/studio/data', { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load dashboard data (HTTP ${res.status})`);
  return res.json();
}

// Shown inside the chat page's side-by-side view.
const EMBED = new URLSearchParams(window.location.search).has('embed') || window.self !== window.top;

export default function App() {
  const [payload, setPayload] = useState<StudioPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetchData().then(setPayload, (e) => setError(String(e.message || e))); }, []);
  if (error) return <div className="center"><div><h2>Dashboard unavailable</h2><p>{error}</p><p><a href="/dashboard/classic">Open the classic dashboard</a></p></div></div>;
  if (!payload) return <div className="center">Loading Marwar Crafts…</div>;
  return <Dashboard initial={payload} />;
}

function Dashboard({ initial }: { initial: StudioPayload }) {
  const [payload, setPayload] = useState(initial);
  const latest = useRef(initial);
  latest.current = payload;
  const apiRef = useRef<AgStudioApi | null>(null);
  const [mode, setMode] = useState<AgStudioMode>('view');
  const [state, setState] = useState<AgReportState | null>(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [toast, setToast] = useState<string | null>(null);
  const [initialState] = useState(() => withFiltersPanelFor('view', loadSaved()));

  const flash = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(null), 3200); };
  const [version, setVersion] = useState(0);
  const reload = useCallback(async () => { setPayload(await fetchData()); setVersion((v) => v + 1); }, []);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data === 'chatcart:refresh') reload(); };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [reload]);

  const context = useMemo<DashboardContext>(() => ({
    currency: initial.currency,
    version,
    policy: initial.policy,
    async decideRefund(id, decision) {
      const res = await fetch(`/api/merchant/refunds/${encodeURIComponent(id)}/${decision}`, { method: 'POST', credentials: 'same-origin' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { flash(`Could not ${decision} ${id}: ${body.error || res.status}`); return false; }
      flash(decision === 'approve' ? `Refund ${id} approved and sent to PayPal ✅` : `Refund ${id} rejected`);
      await reload();
      return true;
    },
  }), [initial.currency, initial.policy, reload, version]);

  const studioData = useMemo(() => buildStudioData(payload), [payload]);
  const aiModels = initial.studio.aiModels;
  const ai = useMemo(() => (aiModels.length ? buildAi(aiModels, () => latest.current) : undefined), [aiModels]);
  const modules = useMemo(() => (ai ? [AgStudioAiModule] : undefined), [ai]);

  const current = state ?? initialState;
  const pages = current.pages.map((p, i) => ({ id: p.id, title: PAGE_TITLES[p.id] ?? `Page ${i + 1}` }));
  const update = (fn: (s: AgReportState) => AgReportState) => { const api = apiRef.current; if (api) api.setState(fn(api.getState())); };

  const save = () => { const api = apiRef.current; if (!api) return; localStorage.setItem(STORAGE_KEY, JSON.stringify(api.getState())); flash('Layout saved in this browser'); };
  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    const api = apiRef.current; if (!api) return;
    api.setState(withFiltersPanelFor(mode, initialReport)); api.clearHistory(); flash('Back to the default Marwar Crafts report');
  };
  const addPage = () => {
    const id = `page-${Date.now().toString(36)}`;
    update((s) => ({ ...s, pages: [...s.pages, { id }], selectedPageId: id }));
    setMode('edit');
  };

  return (
    <div className={`shell ${EMBED ? 'embed' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">🛒</div>
          <div style={{ minWidth: 0 }}>
            <div className="brand-name">ChatCart · {payload.shop}</div>
            <div className="brand-sub">Merchant dashboard · PayPal {payload.mode.paypalMode} · agent {payload.mode.llmMode}</div>
          </div>
        </div>
        <nav className="tabs">
          {pages.map((p) => (
            <button key={p.id} className={`tab ${p.id === current.selectedPageId ? 'active' : ''}`} onClick={() => update((s) => ({ ...s, selectedPageId: p.id }))}>{p.title}</button>
          ))}
          {mode === 'edit' && <button className="tab" onClick={addPage} title="Add a page">+</button>}
        </nav>
        <div className="spacer" />
        {payload.demo && <span className="chip chip-demo" title="Seeded demo data (mock mode). Set DEMO_SEED=0 to start empty.">DEMO DATA</span>}
        {mode === 'edit' && (<>
          <button className="tool-btn" disabled={!history.canUndo} onClick={() => apiRef.current?.undo()}>↶ Undo</button>
          <button className="tool-btn" disabled={!history.canRedo} onClick={() => apiRef.current?.redo()}>↷ Redo</button>
          <button className="tool-btn" onClick={reset}>Reset</button>
          <button className="tool-btn primary" onClick={save}>Save layout</button>
        </>)}
        <button className="tool-btn" onClick={() => reload().then(() => flash('Data refreshed'))}>⟳ Refresh</button>
        <button className={`tool-btn ${mode === 'edit' ? 'active' : ''}`} onClick={() => { const next = mode === 'edit' ? 'view' : 'edit'; update((s) => withFiltersPanelFor(next, s)); setMode(next); }}>
          {mode === 'edit' ? 'Done editing' : '✎ Edit'}
        </button>
        {!EMBED && <a className="toplink" href="/dashboard/classic">Classic</a>}
        {!EMBED && <a className="toplink" href="/">Chat</a>}
      </header>
      <div className="studio-wrap">
        {hasData(payload) ? (
          <AgStudioProvider licenseKey={initial.studio.licenseKey} modules={modules}>
            <AgStudio
              style={{ height: '100%', width: '100%' }}
              theme={chatCartTheme}
              layout={{ widgetBorderEnabled: true }}
              data={studioData}
              widgets={chatCartWidgets as any}
              context={context}
              ai={ai}
              initialState={initialState}
              mode={mode}
              onApiReady={(e) => { apiRef.current = e.api; }}
              onStudioReady={(e) => setState(e.api.getState())}
              onStateUpdated={(e) => {
                const { undo, redo } = e.api.getHistory();
                setState(e.state);
                setHistory({ canUndo: undo.length > 0, canRedo: redo.length > 0 });
              }}
            />
          </AgStudioProvider>
        ) : (
          <div className="center"><div><h2>No orders yet</h2><p>Start a conversation in the <a href="/">chat</a>, or run with DEMO_SEED=1 to load demo data.</p></div></div>
        )}
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
