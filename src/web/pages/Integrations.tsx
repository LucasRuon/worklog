import { useState } from 'react';
import { api, errorMessage, machineName, timestamp, type DashboardData } from '../api.js';
import { Maintenance } from './Maintenance.js';

export function Integrations({ data, refresh }: { data: DashboardData; refresh: () => void }) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''); const [removal, setRemoval] = useState<string | null>(null);
  const [tool, setTool] = useState('claude'); const [profile, setProfile] = useState(''); const [configPath, setConfigPath] = useState(''); const [version, setVersion] = useState('');
  const automation = data.settings.automation;
  const plugin = data.sources.items.find((source) => source.tool === 'opencode' && source.observation?.transport === 'plugin-v2' && source.enabled && source.canManage && source.availability === 'present' && source.compatibility === 'supported');
  async function windowChange(minutes: number) {
    setBusy(true); setError('');
    try { await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ humanWindowMs: minutes * 60_000 }) }); refresh(); }
    catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  async function register(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { await api('/api/sources', { method: 'POST', body: JSON.stringify({ tool, profile, configPath, version }) }); setConfigPath(''); setMessage('Fonte cadastrada. Somente eventos recebidos comprovam coleta; instale e revise a instrumentação pelo CLI.'); refresh(); }
    catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  async function changeSource(id: string, enabled: boolean, revision: number, remove = false) {
    setBusy(true); setError(''); setMessage('');
    try { await api(`/api/sources/${id}${remove ? '/remove' : ''}`, { method: remove ? 'POST' : 'PATCH', body: JSON.stringify(remove ? { revision } : { enabled, revision }) }); setRemoval(null); setMessage(remove ? 'Instrumentação removida. Histórico preservado.' : enabled ? 'Fonte habilitada para novas capturas.' : 'Fonte pausada. Histórico preservado.'); refresh(); }
    catch (error) { setError(errorMessage(error)); refresh(); } finally { setBusy(false); }
  }
  const labels: Record<string, string> = { observed: 'Eventos recebidos', paused: 'Pausada', error: 'Requer atenção', 'no-data': 'Sem dados', unsupported: 'Versão não suportada', removed: 'Instrumentação removida', delayed: 'Sincronização atrasada' };
  return <>
    <section className="panel" aria-labelledby="automatic-title">
      <div className="section-heading"><h2 id="automatic-title">Abertura automática</h2><span className="badge">{plugin ? `Plugin instalado · OpenCode ${plugin.version}` : 'Configuração inicial'}</span></div>
      <div className="instructions">
        {plugin ? <><p><strong>Abra o OpenCode no projeto e trabalhe normalmente.</strong> Novas sessões são identificadas pelo plugin; os repositórios nas pastas autorizadas são cadastrados automaticamente.</p><code>opencode</code></> : <><p>Configure uma vez a pasta de projetos e o plugin global. Depois, basta abrir o OpenCode dentro de cada projeto.</p><code>npm run cli -- automation install --workspace "/caminho/dos/projetos"</code></>}
        <h3>Pastas autorizadas nesta máquina</h3>
        {automation?.workspaces.length ? <ul>{automation.workspaces.map((path) => <li key={path}><code>{path}</code></li>)}</ul> : <p className="muted">Nenhum workspace automático autorizado. As raízes cadastradas em Projetos mantêm seus estados.</p>}
        <p>Metadados de sessão, ferramentas e tempos são filtrados antes da fila. Prompts, respostas, argumentos e resultados não são copiados. O plugin mantém uma fila de recuperação para falhas transitórias; interrupções do stream são sinalizadas no armazenamento do plugin.</p>
        <p className="muted">Serviço local: {automation?.localService.running ? `em execução (${automation.localService.manager})` : 'não confirmado para este diretório de dados'}. A coleta continua com o navegador e o terminal fechados quando o serviço está ativo.</p>
      </div>
    </section>
    <section className="panel" aria-labelledby="remote-title">
      <div className="section-heading"><h2 id="remote-title">Máquinas via SSH</h2></div>
      {automation?.remotes.length ? <div className="table-scroll"><table><thead><tr><th>Máquina</th><th>Última sincronização</th><th>Estado</th></tr></thead><tbody>{automation.remotes.map((remote) => <tr key={remote.host}>
        <td><strong>{remote.host}</strong><small>Projetos autorizados no coletor remoto</small></td>
        <td>{remote.last_sync_at ? timestamp(remote.last_sync_at, data.settings.timezone) : 'Aguardando primeiro lote'}</td>
        <td><span className={`badge ${remote.last_error ? 'badge-warning' : ''}`}>{!remote.enabled ? 'Pausada' : remote.last_error === 'clock-skew' ? 'Relógio divergente' : remote.last_error ? 'Falha de sincronização' : remote.last_sync_at && Date.now() - Date.parse(remote.last_sync_at) > 60_000 ? 'Sincronização atrasada' : 'Sincronizada'}</span>{remote.last_error && <small>{remote.last_error}</small>}</td>
      </tr>)}</tbody></table></div> : <div className="empty-state"><p>Nenhum host remoto cadastrado.</p></div>}
      <div className="instructions"><p>No host configurado, abra o Claude dentro da pasta de projetos autorizada:</p><code>claude</code><p>Os hooks identificam o projeto e gravam eventos locais. O Mac busca lotes pelo SSH; quando a conexão cai, o backlog permanece no host e é recuperado depois. A execução remota não inicia dedicação humana local.</p></div>
    </section>
    <section className="panel" aria-labelledby="sources-title">
      <div className="section-heading"><h2 id="sources-title">Fontes registradas</h2><span className="badge">{data.sources.collectorStatus === 'ok' ? 'Coleta local disponível' : 'Coleta requer atenção'}</span></div>
      <form className="project-form" onSubmit={(event) => void register(event)}>
        <label>Ferramenta da fonte<select value={tool} onChange={(event) => setTool(event.target.value)}><option value="claude">Claude Code</option><option value="codex">Codex</option><option value="opencode">OpenCode</option></select></label>
        <label>Perfil da fonte<input value={profile} onChange={(event) => setProfile(event.target.value)} required maxLength={120} placeholder="Ex.: pessoal" /></label>
        <label>Arquivo de configuração local<input value={configPath} onChange={(event) => setConfigPath(event.target.value)} required maxLength={4096} placeholder="/caminho/absoluto/settings.json" /></label>
        <label>Versão instalada<input value={version} onChange={(event) => setVersion(event.target.value)} required maxLength={120} placeholder="Ex.: 2.1.319" /></label>
        <div><button disabled={busy}>Cadastrar fonte</button><p className="muted">Cadastro local sem ler tokens. Cada perfil mantém identidade e histórico próprios.</p></div>
      </form>
      {error && <p role="alert" className="inline-error source-feedback">{error}</p>}{message && <p role="status" className="inline-message source-feedback">{message}</p>}
      {data.sources.items.length ? <div className="table-scroll"><table><thead><tr><th>Ferramenta / perfil</th><th>Versão</th><th>Última atividade</th><th>Estado observado</th></tr></thead><tbody>{data.sources.items.map((source) => <tr key={source.id}>
        <td><strong>{source.tool === 'focus' ? 'Sinais explícitos / máquina' : source.tool}</strong><small>{source.profile} · {machineName(data.settings, source.deviceId)}</small></td>
        <td>{source.version}<small>{source.compatibility === 'supported' ? 'Contrato suportado' : 'Revalidação necessária'}</small></td><td>{source.lastActivity ? timestamp(source.lastActivity, data.settings.timezone) : 'Nenhum evento'}</td>
        <td><span className={`badge ${['error', 'unsupported', 'delayed'].includes(source.state) ? 'badge-warning' : ''}`}>{labels[source.state]}</span>
          {source.availability === 'missing' && <small>Configuração ausente · histórico preservado</small>}
          {source.diagnostic && <small>{source.diagnostic}</small>}
          {source.history && <small>Histórico: {source.history.state === 'complete' ? 'registros disponíveis importados' : source.history.state === 'cancelled' ? 'cancelado; pode retomar' : 'parcial'} · {source.history.imported} importados{source.history.warnings.length ? ` · ${source.history.warnings.join(', ')}` : ''}</small>}
          {source.observation && <small>{source.observation.transport === 'plugin-v2' ? 'Plugin de eventos v2' : 'Banco nativo · somente leitura'}{source.observation.observedFrom ? ` · desde ${timestamp(source.observation.observedFrom, data.settings.timezone)}` : ''}</small>}
          {source.observation?.diagnostic && <small>{source.observation.diagnostic}</small>}
          {source.remote && <small>SSH {source.remote.host}{source.remote.last_error ? ` · ${source.remote.last_error}` : ''}</small>}
          {source.lagMs !== null && <small>Atraso desde a sincronização: {Math.floor(source.lagMs / 1000)} s</small>}
          {source.state !== 'removed' && <div className="source-actions"><button type="button" className="button-flat" disabled={busy} aria-label={`${source.enabled ? 'Pausar' : 'Habilitar'} fonte ${source.profile}`} onClick={() => void changeSource(source.id, !source.enabled, source.revision)}>{source.enabled ? 'Pausar fonte' : 'Habilitar fonte'}</button>
          {source.canManage && <button type="button" className="button-flat" disabled={busy} onClick={() => setRemoval(removal === source.id ? null : source.id)}>Remover instrumentação</button>}</div>}
          {removal === source.id && <div className="source-removal"><p>Remover somente os hooks/plugins Worklog de {source.profile}? O histórico permanece.</p><button type="button" disabled={busy} onClick={() => void changeSource(source.id, false, source.revision, true)}>Confirmar remoção</button><button type="button" className="button-flat" onClick={() => setRemoval(null)}>Cancelar remoção</button></div>}
        </td>
      </tr>)}</tbody></table></div> : <div className="empty-state"><h3>Nenhuma fonte registrada.</h3><p>Configure a automação local ou um coletor remoto.</p></div>}
    </section>
    <section className="panel"><div className="section-heading"><h2>Regra da estimativa</h2></div><div className="instructions">
      <label className="window-field">Janela máxima após sinal explícito<select aria-label="Janela da estimativa" value={data.settings.humanWindowMs / 60_000} disabled={busy} onChange={(event) => void windowChange(Number(event.target.value))}>{[1, 5, 10, 15, 30, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}</select></label>
      <p>Dedicação é uma estimativa revisável. Troca explícita de projeto e pausa encerram o trecho anterior. Sobreposição ambígua fica não atribuída. Mudar a janela reprocessa a estimativa a partir dos sinais preservados.</p>
      <p className="muted">Fuso: {data.settings.timezone}. Inatividade: {data.settings.idleMs / 60_000} min. Observação automática: {data.settings.focusObservation === 'observed' ? 'disponível nesta execução' : 'não confirmada nesta execução'}.</p>
      {error && <p role="alert" className="inline-error">{error}</p>}
    </div></section>
    <Maintenance data={data} refresh={refresh} />
  </>;
}
