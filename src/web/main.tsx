import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Shell, applyTheme, readTheme, type View } from './Shell.js';
import { Workspace } from './Workspace.js';
import './styles.css';

applyTheme(readTheme());

let bootstrapToken = new URLSearchParams(location.hash.slice(1)).get('token');
if (location.hash) history.replaceState(null, '', location.pathname + location.search);

function App() {
  const [state, setState] = useState<'loading' | 'ready' | 'locked' | 'error'>('loading');
  const [health, setHealth] = useState(false); const [view, setView] = useState<View>('overview');
  async function connect() {
    setState('loading');
    try {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error('Health indisponível');
      const result = await response.json() as { status: string; database: string };
      setHealth(result.status === 'ok' && result.database === 'ok');
      if (bootstrapToken) {
        const token = bootstrapToken; bootstrapToken = null;
        const auth = await fetch('/api/auth/bootstrap', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        if (!auth.ok) { setState('locked'); return; }
      }
      const session = await fetch('/api/auth/session');
      if (session.status === 401) { setState('locked'); return; }
      if (!session.ok) throw new Error('Sessão indisponível');
      setState('ready');
    } catch { setState('error'); }
  }
  useEffect(() => { void connect(); }, []);
  async function logout() {
    try { const response = await fetch('/api/auth/logout', { method: 'POST' }); setState(response.ok ? 'locked' : 'error'); }
    catch { setState('error'); }
  }
  if (state === 'ready') return <Workspace logout={() => void logout()} expired={() => setState('locked')} />;
  return <Shell view={view} navigate={setView} logout={() => void logout()} authenticated={false}>
    <h1>Um lugar para acompanhar<br className="desktop-break" /> o que você constrói.</h1><p className="intro">Projetos, sessões e evidências, com dedicação humana e execução de IA apresentadas separadamente.</p>
    <section className="connection" aria-labelledby="connection-title"><div className="section-heading"><h2 id="connection-title">Base local</h2><span className="badge">{health ? 'API e banco disponíveis' : 'Verificando ambiente'}</span></div><div className="auth-state" role="status" aria-live="polite">
      {state === 'loading' && <p>Verificando sua conexão local…</p>}
      {state === 'locked' && <><h3>Conecte este navegador</h3><p>Com o servidor ativo, execute no terminal do projeto:</p><code>npm run cli -- open</code><p className="help">O comando abre uma sessão local autenticada neste navegador.</p><button onClick={() => void connect()}>Verificar conexão</button></>}
      {state === 'error' && <><h3>Não foi possível acessar a base local.</h3><p>Confirme que o servidor está ativo e tente novamente.</p><button onClick={() => void connect()}>Tentar novamente</button></>}
    </div></section>
  </Shell>;
}
createRoot(document.getElementById('root')!).render(<App />);
