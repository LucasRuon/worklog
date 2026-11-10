import { useEffect, useState, type FormEvent } from 'react';
import type { Client } from '../../core/clients.js';
import { api, errorMessage, machineName, type DashboardData } from '../api.js';
import { ClientsPanel } from './Clients.js';

export function Projects({ data, selectedIds, refresh, more, loading, openProject }: { data: DashboardData; selectedIds: string[]; refresh: () => void; more: () => void; loading: boolean; openProject: (id: string) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [clients, setClients] = useState<Client[]>([]); const [clientsRevision, setClientsRevision] = useState(0); const [assigning, setAssigning] = useState('');
  useEffect(() => { const controller = new AbortController(); void api<{ items: Client[] }>('/api/clients', { signal: controller.signal }).then((value) => setClients(value.items)).catch((e: unknown) => { if (!controller.signal.aborted) setError(errorMessage(e)); }); return () => controller.abort(); }, [clientsRevision]);
  const clientsChanged = () => { setClientsRevision((n) => n + 1); refresh(); };
  async function assign(projectId: string, clientId: string) {
    setAssigning(projectId); setError(''); setMessage('');
    try { await api(`/api/projects/${projectId}/client`, { method: 'POST', body: JSON.stringify({ clientId: clientId || null }) }); clientsChanged(); }
    catch (e) { setError(errorMessage(e)); } finally { setAssigning(''); }
  }
  const visible = data.projects.items.filter((p) => (!selectedIds.length || selectedIds.includes(p.id)) && `${p.name} ${p.client ?? ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).sort((a, b) => (a.client ?? '').localeCompare(b.client ?? '') || a.name.localeCompare(b.name));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form);
    setBusy(true); setError(''); setMessage('');
    try {
      await api('/api/projects', { method: 'POST', body: JSON.stringify({ projectName: fields.get('projectName'), path: fields.get('path'), ...(fields.get('client') ? { client: fields.get('client') } : {}), ...(fields.get('projectId') ? { projectId: fields.get('projectId') } : {}) }) });
      form.reset(); setMessage('Raiz cadastrada. A coleta se limita às pastas autorizadas.'); clientsChanged();
    } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <>
    <section className="panel" aria-labelledby="register-title"><div className="section-heading"><div><h2 id="register-title">Cadastrar raiz de projeto</h2><p className="muted">Associe pastas locais. Clones e worktrees compartilham a identidade do repositório.</p></div></div><form className="project-form" onSubmit={(event) => void submit(event)}><label>Nome do projeto<input name="projectName" required maxLength={160} placeholder="Nome do projeto" /></label><label>Pasta raiz autorizada<input name="path" required placeholder="/caminho/absoluto/do/projeto" autoComplete="off" spellCheck={false} /></label><label>Cliente (opcional)<input name="client" maxLength={160} placeholder="Escolha ou digite um novo" list="client-options" autoComplete="off" /><datalist id="client-options">{clients.map((client) => <option key={client.id} value={client.name} />)}</datalist></label><label>Associar a um projeto<select name="projectId"><option value="">Novo projeto / identidade do Git</option>{data.projects.items.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><div className="form-submit"><button disabled={busy}>{busy ? 'Cadastrando…' : 'Cadastrar raiz'}</button><span className="muted">Não inicia coleta fora desta raiz.</span></div>{error && <p role="alert" className="inline-error">{error}</p>}{message && <p role="status" className="inline-message">{message}</p>}</form></section>
    <ClientsPanel clients={clients} changed={clientsChanged} />
    <section className="panel" aria-labelledby="projects-title"><div className="section-heading"><h2 id="projects-title">Projetos cadastrados</h2><span className="muted">{visible.length} nesta página</span></div><div className="instructions"><label>Buscar projeto ou cliente<input value={search} onChange={(e) => setSearch(e.target.value)} type="search" /></label></div>{visible.length ? <div className="table-scroll"><table><thead><tr><th>Projeto</th><th>Cliente</th><th>Raízes autorizadas</th><th>Máquina</th></tr></thead><tbody>{visible.map((project) => <tr key={project.id}><td><button className="session-link" aria-label={`Abrir projeto ${project.name}`} onClick={() => openProject(project.id)}>{project.name}</button></td><td><select className="client-select" aria-label={`Cliente do projeto ${project.name}`} value={project.clientId ?? ''} disabled={assigning === project.id} onChange={(e) => void assign(project.id, e.target.value)}><option value="">Sem cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></td><td>{project.roots.map((root) => <div key={root.id} className="root-path"><code>{root.path}</code>{!root.enabled && <span className="badge badge-warning">Pausada</span>}</div>)}</td><td>{[...new Set(project.roots.map((root) => root.deviceId))].map((id) => <div key={id}>{id === data.settings.deviceId ? 'Esta máquina' : machineName(data.settings, id)}</div>)}</td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>{search ? 'Nenhum projeto corresponde à busca.' : 'Seu primeiro projeto começa por uma pasta.'}</h3><p>Cadastre uma raiz ou ajuste a busca. A busca inclui os projetos já carregados.</p></div>}{data.projects.nextCursor && <div className="panel-bottom"><button disabled={loading} onClick={more}>Carregar mais projetos</button></div>}</section>
  </>;
}
