import { useState, type FormEvent } from 'react';
import type { Client } from '../../core/clients.js';
import { api, errorMessage } from '../api.js';

/** Cadastro de clientes: criar, renomear e remover (somente sem projetos). */
export function ClientsPanel({ clients, changed }: { clients: Client[]; changed: () => void }) {
  const [name, setName] = useState(''); const [editing, setEditing] = useState(''); const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState(''); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); setMessage(done); changed(); return true; } catch (e) { setError(errorMessage(e)); return false; } finally { setBusy(false); }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (await run(() => api('/api/clients', { method: 'POST', body: JSON.stringify({ name }) }), `Cliente "${name.trim()}" criado. Associe projetos na lista abaixo.`)) setName('');
  }
  async function rename(id: string) {
    if (await run(() => api(`/api/clients/${id}/rename`, { method: 'POST', body: JSON.stringify({ name: draft }) }), 'Cliente renomeado em todos os projetos.')) setEditing('');
  }
  return <section className="panel" aria-labelledby="clients-title">
    <div className="section-heading"><div><h2 id="clients-title">Clientes</h2><p className="muted">Um cliente pode ter vários projetos. Associe cada projeto na lista de projetos cadastrados.</p></div><span className="muted">{clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}</span></div>
    <form className="client-form" onSubmit={(e) => void create(e)}>
      <label>Novo cliente<input value={name} required maxLength={160} placeholder="Nome do cliente" onChange={(e) => setName(e.target.value)} /></label>
      <button disabled={busy || !name.trim()}>Criar cliente</button>
    </form>
    {error && <p role="alert" className="inline-error client-feedback">{error}</p>}{message && <p role="status" className="inline-message client-feedback">{message}</p>}
    {clients.length > 0 && <ul className="client-list">{clients.map((client) => <li key={client.id}>
      {editing === client.id
        ? <form className="client-rename" onSubmit={(e) => { e.preventDefault(); void rename(client.id); }}><input aria-label={`Novo nome de ${client.name}`} value={draft} maxLength={160} required autoFocus onChange={(e) => setDraft(e.target.value)} /><button disabled={busy || !draft.trim()}>Salvar</button><button type="button" className="button-flat" onClick={() => setEditing('')}>Cancelar</button></form>
        : <><span className="client-name"><strong>{client.name}</strong><small>{client.projectCount} {client.projectCount === 1 ? 'projeto' : 'projetos'}</small></span>
          <span className="button-row">
            <button className="button-flat" disabled={busy} onClick={() => { setEditing(client.id); setDraft(client.name); setConfirming(''); }}>Renomear</button>
            {confirming === client.id
              ? <><button className="button-flat" disabled={busy} onClick={() => void run(() => api(`/api/clients/${client.id}/remove`, { method: 'POST' }), 'Cliente removido.').then(() => setConfirming(''))}>Confirmar remoção</button><button className="button-flat" onClick={() => setConfirming('')}>Cancelar</button></>
              : <button className="button-flat" disabled={busy || client.projectCount > 0} title={client.projectCount > 0 ? 'Desassocie os projetos antes de remover' : undefined} onClick={() => setConfirming(client.id)}>Remover</button>}
          </span></>}
    </li>)}</ul>}
  </section>;
}
