import { useEffect, useState } from 'react';
import type { Note, NoteClassification } from '../../core/contracts.js';
import { dateInZone, startOfDay } from '../../core/dates.js';
import { api, errorMessage } from '../api.js';

export function NoteEditor({ targetId, timezone, from, changed }: { targetId: string; timezone: string; from: string; changed?: () => void }) {
  const [text, setText] = useState(''); const [classification, setClassification] = useState<NoteClassification>('context');
  const [day, setDay] = useState(dateInZone(new Date(from), timezone)); const [revision, setRevision] = useState(0); const [busy, setBusy] = useState(true); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void api<{ item: Note | null }>(`/api/notes?targetId=${targetId}`, { signal: controller.signal }).then(({ item }) => { if (item) { setText(item.text); setClassification(item.classification); setRevision(item.revision); setDay(dateInZone(new Date(item.occurredAt), timezone)); } setBusy(false); }).catch((e) => { if (!controller.signal.aborted) { setError(errorMessage(e)); setBusy(false); } });
    return () => controller.abort();
  }, [targetId]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { const result = await api<{ item: Note }>('/api/notes', { method: 'POST', body: JSON.stringify({ targetId, text, classification, revision, occurredAt: startOfDay(day, timezone) }) }); setRevision(result.item.revision); setMessage('Nota salva com versão auditável.'); changed?.(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <form className="note-editor" onSubmit={(e) => void save(e)}><h3>Nota do usuário</h3>
    <label>Texto da nota<textarea aria-label="Texto da nota" value={text} maxLength={8192} rows={4} onChange={(e) => setText(e.target.value)} /></label>
    <div className="form-fields"><label>Classificação da nota<select value={classification} onChange={(e) => setClassification(e.target.value as NoteClassification)}><option value="context">Contexto</option><option value="work">Trabalho</option><option value="pending">Pendência</option><option value="verification">Verificação registrada pelo usuário</option></select></label><label>Data da nota<input type="date" required value={day} onChange={(e) => setDay(e.target.value)} /></label></div>
    <p className="muted">Texto explícito do usuário · versão {revision} · data no fuso {timezone}. A classificação não comprova automaticamente um teste.</p><button disabled={busy}>Salvar nota</button>
    {error && <p role="alert" className="inline-error">{error}</p>}{message && <p role="status" className="inline-message">{message}</p>}
  </form>;
}
