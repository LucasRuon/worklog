import { useEffect, useState } from 'react';
import type { Adjustment } from '../../core/contracts.js';
import { api, duration, errorMessage, timestamp } from '../api.js';
import { fromLocalInput, toLocalInput } from '../../core/dates.js';

export function Adjustments({ projectId, query, changed }: { projectId: string; query: string; changed: () => void }) {
  const params = new URLSearchParams(query); const [start, setStart] = useState(toLocalInput(params.get('from') ?? Date.now())); const [end, setEnd] = useState(toLocalInput(Math.min(Date.parse(params.get('to') ?? ''), Date.now())));
  const [minutes, setMinutes] = useState(''); const [reason, setReason] = useState(''); const [undoReason, setUndoReason] = useState('');
  const [ledger, setLedger] = useState<{ items: (Adjustment & { undone: boolean })[]; revision: number } | null>(null); const [reload, setReload] = useState(0); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { const controller = new AbortController(); void api<NonNullable<typeof ledger>>(`/api/adjustments?${query}`, { signal: controller.signal }).then(setLedger).catch((e) => { if (!controller.signal.aborted) setError(errorMessage(e)); }); return () => controller.abort(); }, [query, reload]);
  async function apply(event: React.FormEvent) {
    event.preventDefault(); if (!ledger) return; setBusy(true); setError(''); setMessage('');
    try { await api('/api/adjustments', { method: 'POST', body: JSON.stringify({ projectId, start: fromLocalInput(start), end: fromLocalInput(end), nextMs: Math.round(Number(minutes) * 60000), reason, revision: ledger.revision }) }); setMessage('Ajuste registrado. Estimativa original preservada.'); setReload((n) => n + 1); changed(); }
    catch (e) { setError(errorMessage(e)); setReload((n) => n + 1); } finally { setBusy(false); }
  }
  async function undo(id: string) {
    if (!ledger) return; setBusy(true); setError('');
    try { await api(`/api/adjustments/${id}/undo`, { method: 'POST', body: JSON.stringify({ revision: ledger.revision, reason: undoReason }) }); setMessage('Ajuste desfeito por registro compensatório.'); setReload((n) => n + 1); changed(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <section className="panel"><div className="section-heading"><h2>Dedicação ajustada e auditoria</h2></div><div className="instructions">
    <p>A correção substitui a dedicação do intervalo global e atribui o valor a este projeto. Não é somada à estimativa original nem representa faturamento.</p>
    <form className="adjustment-form" onSubmit={(e) => void apply(e)}><div className="form-fields"><label>Início do ajuste (horário de Brasília)<input type="datetime-local" step="1" required value={start} onChange={(e) => setStart(e.target.value)} /></label><label>Fim do ajuste (horário de Brasília)<input type="datetime-local" step="1" required value={end} onChange={(e) => setEnd(e.target.value)} /></label><label>Dedicação corrigida (minutos)<input type="number" min="0" step="0.01" required value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label><label>Motivo do ajuste<input required maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} /></label></div><button disabled={busy || !ledger}>Registrar ajuste</button></form>
    {error && <p role="alert" className="inline-error">{error}</p>}{message && <p role="status" className="inline-message">{message}</p>}
    <h3>Histórico auditável</h3><label>Motivo para desfazer<input value={undoReason} maxLength={2000} onChange={(e) => setUndoReason(e.target.value)} /></label>
    {!ledger?.items.length && <p>Nenhum ajuste neste período.</p>}{ledger?.items.map((a) => <div className="evidence-link" key={a.id}><p><strong>{a.undoOf ? 'Compensação' : a.undone ? 'Ajuste desfeito' : 'Ajuste ativo'}</strong> · {timestamp(a.start)} → {timestamp(a.end)}<br />{duration(a.previousMs)} ({a.previousMs} ms) → {duration(a.nextMs)} ({a.nextMs} ms)<br />{a.reason}</p>{!a.undoOf && !a.undone && <button className="button-flat" disabled={busy || !undoReason.trim()} aria-label={`Desfazer ajuste ${a.id.slice(0, 8)}`} onClick={() => void undo(a.id)}>Desfazer ajuste</button>}</div>)}
  </div></section>;
}
