import { useEffect, useState, type FormEvent } from 'react';
import { dateInZone, formatDate } from '../../core/dates.js';
import type { ManualTime as Entry } from '../../core/manual-time.js';
import { api, duration, errorMessage, type DashboardData } from '../api.js';

/** Lançamento manual: soma à dedicação automática no dia escolhido, sem substituir nada. */
export function ManualTime({ data, query, updated, changed }: { data: DashboardData; query: string; updated: string; changed: () => void }) {
  const today = dateInZone(new Date(), data.settings.timezone);
  const projects = data.projects.items;
  const [projectId, setProjectId] = useState(''); const [date, setDate] = useState(today);
  const [hours, setHours] = useState(''); const [minutes, setMinutes] = useState(''); const [note, setNote] = useState('');
  const [items, setItems] = useState<Entry[] | null>(null); const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState('');
  const selected = projectId || projects[0]?.id || '';
  const names = new Map(projects.map((p) => [p.id, p.name]));
  useEffect(() => {
    const controller = new AbortController();
    void api<{ items: Entry[] }>(`/api/manual-time?${query}`, { signal: controller.signal }).then((value) => setItems(value.items)).catch((e: unknown) => { if (!controller.signal.aborted) setError(errorMessage(e)); });
    return () => controller.abort();
  }, [query, updated, reload]);
  const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await api('/api/manual-time', { method: 'POST', body: JSON.stringify({ projectId: selected, date, minutes: total, ...(note.trim() ? { note: note.trim() } : {}) }) });
      setMessage(`${duration(total * 60_000)} lançados em ${names.get(selected) ?? 'projeto'} (${formatDate(date)}).`);
      setHours(''); setMinutes(''); setNote(''); setReload((n) => n + 1); changed();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true); setError(''); setMessage('');
    try { await api(`/api/manual-time/${id}/remove`, { method: 'POST' }); setConfirming(''); setMessage('Lançamento removido. O registro original fica no histórico.'); setReload((n) => n + 1); changed(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <section className="panel manual-time" aria-labelledby="manual-title">
    <div className="section-heading"><div><h2 id="manual-title">Lançar tempo</h2><p className="muted">Some horas trabalhadas sem IA ou fora do Mac. O valor entra no dia escolhido e não apaga a dedicação automática.</p></div></div>
    <form className="manual-form" onSubmit={(e) => void submit(e)}>
      <label>Projeto<select value={selected} onChange={(e) => setProjectId(e.target.value)} disabled={!projects.length} required>{!projects.length && <option value="">Cadastre um projeto</option>}{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Dia<input type="date" value={date} max={today} required onChange={(e) => setDate(e.target.value)} /></label>
      <label>Horas<input type="number" inputMode="numeric" min="0" max="24" step="1" value={hours} placeholder="0" onChange={(e) => setHours(e.target.value)} /></label>
      <label>Minutos<input type="number" inputMode="numeric" min="0" max="59" step="1" value={minutes} placeholder="0" onChange={(e) => setMinutes(e.target.value)} /></label>
      <label className="manual-note">Nota (opcional)<input value={note} maxLength={2000} placeholder="Ex.: reunião com cliente" onChange={(e) => setNote(e.target.value)} /></label>
      <button disabled={busy || !selected || total <= 0 || total > 1440}>Lançar {total > 0 ? duration(total * 60_000) : 'tempo'}</button>
    </form>
    {error && <p role="alert" className="inline-error manual-feedback">{error}</p>}{message && <p role="status" className="inline-message manual-feedback">{message}</p>}
    {items && items.length > 0 && <div className="table-scroll"><table><thead><tr><th>Dia</th><th>Projeto</th><th>Tempo</th><th>Nota</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{items.map((item) => <tr key={item.id}>
      <td className="tabular">{formatDate(item.date)}</td><td>{names.get(item.projectId) ?? 'Projeto'}</td><td className="tabular">{duration(item.durationMs)}</td><td>{item.note || <span className="muted">—</span>}</td>
      <td className="manual-actions">{confirming === item.id ? <span className="button-row"><button className="button-flat" disabled={busy} onClick={() => void remove(item.id)}>Confirmar remoção</button><button className="button-flat" disabled={busy} onClick={() => setConfirming('')}>Cancelar</button></span> : <button className="button-flat" disabled={busy} aria-label={`Remover lançamento de ${duration(item.durationMs)} em ${names.get(item.projectId) ?? 'projeto'}`} onClick={() => setConfirming(item.id)}>Remover</button>}</td>
    </tr>)}</tbody></table></div>}
    {items && !items.length && <p className="manual-empty muted">Nenhum lançamento manual no período filtrado.</p>}
  </section>;
}
