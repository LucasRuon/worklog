import { useState, type ReactNode } from 'react';

export type View = 'overview' | 'projects' | 'activity' | 'files' | 'commits' | 'exports' | 'integrations';
export const views: Record<View, string> = { overview: 'Visão geral', projects: 'Projetos', activity: 'Atividade', files: 'Arquivos', commits: 'Commits', exports: 'Exportação', integrations: 'Integrações' };
const paths: Record<View, string> = { overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z', projects: 'M3 6h7l2 2h9v12H3z M3 6V4h7l2 2', activity: 'M3 12h4l3-8 4 16 3-8h4', files: 'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6', commits: 'M3 12h5 M16 12h5 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0', exports: 'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5', integrations: 'M8 3v5 M16 3v5 M5 8h14v3a7 7 0 0 1-14 0z M12 18v4' };

export type Theme = 'auto' | 'light' | 'dark';
const themeKey = 'worklog-theme';
const themes: { id: Theme; label: string; path: string }[] = [
  { id: 'auto', label: 'Tema automático (segue o sistema)', path: 'M3 4h18v12H3z M8 20h8 M12 16v4' },
  { id: 'light', label: 'Tema claro', path: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4' },
  { id: 'dark', label: 'Tema escuro', path: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z' },
];

/** Lê a preferência salva; armazenamento indisponível equivale a automático. */
export function readTheme(): Theme {
  try { const value = localStorage.getItem(themeKey); return value === 'light' || value === 'dark' ? value : 'auto'; } catch { return 'auto'; }
}

/** Automático remove o atributo e deixa o CSS seguir `prefers-color-scheme`. */
export function applyTheme(theme: Theme) {
  if (theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
}

function ThemeControl() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  function choose(next: Theme) {
    setTheme(next); applyTheme(next);
    try { if (next === 'auto') localStorage.removeItem(themeKey); else localStorage.setItem(themeKey, next); } catch { /* Preferência vale só nesta visita. */ }
  }
  return <div className="theme-control" role="group" aria-label="Tema">{themes.map((item) => <button key={item.id} type="button" aria-pressed={theme === item.id} aria-label={item.label} title={item.label} onClick={() => choose(item.id)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={item.path} /></svg></button>)}</div>;
}

export function Shell({ children, view, navigate, logout, authenticated }: { children: ReactNode; view: View; navigate: (view: View) => void; logout: () => void; authenticated: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <div className="shell">
    <a className="skip-link" href="#content">Ir para o conteúdo</a>
    <aside className="sidebar" aria-label="Worklog">
      <div className="sidebar-top"><a className="brand" href="/" aria-label="Worklog, início"><span className="monogram" aria-hidden="true">w.</span>worklog</a><button className="mobile-menu button-flat" aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen((open) => !open)}>Menu</button></div>
      <p className="sidebar-label">ESPAÇO PESSOAL</p>
      <nav id="main-navigation" className={menuOpen ? 'mobile-open' : ''} aria-label="Navegação principal">{(Object.keys(views) as View[]).map((id) => <a key={id} href={`?view=${id}`} className={view === id ? 'nav-current' : ''} aria-current={view === id ? 'page' : undefined} onClick={(event) => { event.preventDefault(); navigate(id); setMenuOpen(false); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[id]} /></svg>{views[id]}</a>)}</nav>
      <div className="local-note"><span className="status-dot" /> Ambiente local<p>Seus dados ficam nesta máquina.</p></div>
    </aside>
    <div className="workspace"><header className="topbar"><span>Meu espaço <span className="separator">/</span> {views[view]}</span><div className="topbar-actions"><span className="badge">Local</span><ThemeControl />{authenticated && <button className="button-flat" aria-label="Encerrar sessão neste navegador" onClick={logout}>Encerrar sessão<span className="topbar-extra"> neste navegador</span></button>}</div></header><main id="content" tabIndex={-1}>{children}<footer>Worklog <span aria-hidden="true">·</span> Pessoal, local e rastreável.</footer></main></div>
  </div>;
}
