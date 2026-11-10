import { useEffect, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from 'react';
import type { TimeSeries } from '../../core/time.js';
import { api, duration, errorMessage, type DashboardData } from '../api.js';
import { formatDate } from '../../core/dates.js';

interface Tip { x: number; y: number; value: string; label: string; extra?: string }

/** Tooltip único por gráfico; posicionado relativo ao contêiner e limitado às bordas. */
function useTooltip() {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  function place(clientX: number, clientY: number, content: Omit<Tip, 'x' | 'y'>) {
    const rect = box.current?.getBoundingClientRect(); if (!rect) return;
    setTip({ ...content, x: Math.min(Math.max(clientX - rect.left, 70), rect.width - 70), y: clientY - rect.top });
  }
  const handlers = (content: Omit<Tip, 'x' | 'y'>) => ({
    onPointerMove: (event: PointerEvent<HTMLElement>) => place(event.clientX, event.clientY, content),
    onPointerLeave: () => setTip(null),
    onFocus: (event: FocusEvent<HTMLElement>) => { const r = event.currentTarget.getBoundingClientRect(); place(r.left + r.width / 2, r.top, content); },
    onBlur: () => setTip(null),
  });
  const layer = tip && <div className="chart-tooltip" role="presentation" style={{ left: tip.x, top: tip.y }}><strong>{tip.value}</strong><span>{tip.label}</span>{tip.extra && <span>{tip.extra}</span>}</div>;
  return { box, handlers, layer };
}

/** Escala em minutos com passos redondos (máx. 4 linhas de grade). */
function scale(maxMs: number) {
  const steps = [5, 15, 30, 60, 120, 180, 240, 360, 480, 720, 1440].map((m) => m * 60_000);
  const step = steps.find((s) => maxMs / s <= 4) ?? steps.at(-1)!;
  const top = Math.max(step, Math.ceil(maxMs / step) * step);
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}
const tickLabel = (ms: number) => ms === 0 ? '0' : ms < 3_600_000 ? `${ms / 60_000} min` : `${+(ms / 3_600_000).toFixed(1)} h`;
const dayLabel = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const fullDay = (date: string) => `${weekdayName(date)}, ${formatDate(date)}`;
const weekdayName = (date: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)).replace('.', '');

function ChartPanel({ id, title, subtitle, children, table }: { id: string; title: string; subtitle: string; children: ReactNode; table: ReactNode }) {
  return <section className="panel chart-panel" aria-labelledby={id}>
    <div className="section-heading"><div><h2 id={id}>{title}</h2><p className="muted">{subtitle}</p></div></div>
    <div className="chart-body">{children}</div>
    <details className="chart-table"><summary>Ver dados em tabela</summary><div className="table-scroll">{table}</div></details>
  </section>;
}

function DailyChart({ series }: { series: TimeSeries }) {
  const { box, handlers, layer } = useTooltip();
  const { days } = series;
  const { top, ticks } = scale(Math.max(0, ...days.map((d) => d.agentWallMs)));
  const every = Math.ceil(days.length / 12);
  const focusable = days.length <= 31;
  return <ChartPanel id="chart-daily" title="Atividade por dia" subtitle="Execução de IA no relógio (união, sem sobreposição) · sessões ativas no dia" table={
    <table><thead><tr><th>Dia</th><th>IA no relógio</th><th>Sessões</th></tr></thead><tbody>{days.map((d) => <tr key={d.date}><td>{fullDay(d.date)}</td><td className="tabular">{duration(d.agentWallMs)}</td><td className="tabular">{d.sessionCount}</td></tr>)}</tbody></table>
  }>
    {days.length === 1 && <p className="chart-hint">Amplie o período no filtro para comparar dias.</p>}
    <div className="chart-frame" ref={box}>
      <div className="column-chart">
        <div className="chart-axis-y" aria-hidden="true">{ticks.map((t) => <span key={t} style={{ bottom: `${(t / top) * 100}%` }}>{tickLabel(t)}</span>)}</div>
        <div className="chart-plot">
          {ticks.map((t) => <i key={t} className={t === 0 ? 'chart-baseline' : 'chart-grid'} style={{ bottom: `${(t / top) * 100}%` }} aria-hidden="true" />)}
          <div className="chart-columns" role="list" aria-label="Execução de IA por dia">{days.map((d) => {
            const label = fullDay(d.date);
            return <div key={d.date} role="listitem" className="chart-slot" tabIndex={focusable ? 0 : -1} aria-label={`${label}: ${duration(d.agentWallMs)} de IA, ${d.sessionCount} sessões`} {...handlers({ value: duration(d.agentWallMs), label, extra: `${d.sessionCount} ${d.sessionCount === 1 ? 'sessão' : 'sessões'}` })}>
              {d.agentWallMs > 0 && <div className="chart-column" style={{ height: `${(d.agentWallMs / top) * 100}%` }} />}
            </div>;
          })}</div>
        </div>
        <div />
        <div className="chart-axis-x" aria-hidden="true">{days.map((d, i) => <span key={d.date}>{i % every === 0 ? dayLabel(d.date) : ''}</span>)}</div>
      </div>
      {layer}
    </div>
    {series.truncated && <p className="chart-hint">Exibindo os primeiros 366 dias do período.</p>}
  </ChartPanel>;
}

function ProjectChart({ data }: { data: DashboardData }) {
  const { box, handlers, layer } = useTooltip();
  const rows = [...data.summary.byProject].filter((p) => p.summary.agentWallMs > 0 || p.sessionCount > 0).sort((a, b) => b.summary.agentWallMs - a.summary.agentWallMs).slice(0, 10);
  const max = Math.max(1, ...rows.map((p) => p.summary.agentWallMs));
  return <ChartPanel id="chart-projects" title="Tempo por projeto" subtitle="Execução de IA no relógio no período · até 10 projetos" table={
    <table><thead><tr><th>Projeto</th><th>IA no relógio</th><th>IA acumulada</th><th>Sessões</th></tr></thead><tbody>{rows.map((p) => <tr key={p.id}><td>{p.name}</td><td className="tabular">{duration(p.summary.agentWallMs)}</td><td className="tabular">{duration(p.summary.agentAccumulatedMs)}</td><td className="tabular">{p.sessionCount}</td></tr>)}</tbody></table>
  }>
    {rows.length ? <div className="chart-frame" ref={box}><ul className="bar-chart">{rows.map((p) => <li key={p.id} {...handlers({ value: duration(p.summary.agentWallMs), label: p.name, extra: `${duration(p.summary.agentAccumulatedMs)} acumulada · ${p.sessionCount} ${p.sessionCount === 1 ? 'sessão' : 'sessões'}` })}>
      <span className="bar-name" title={p.name}>{p.name}</span>
      <span className="bar-track">{p.summary.agentWallMs > 0 && <span className="bar-fill" style={{ width: `${(p.summary.agentWallMs / max) * 100}%` }} />}</span>
      <span className="bar-value tabular">{duration(p.summary.agentWallMs)}</span>
    </li>)}</ul>{layer}</div> : <div className="empty-state"><p>Nenhuma execução de IA atribuída a projetos neste período.</p></div>}
  </ChartPanel>;
}

const WEEK = [1, 2, 3, 4, 5, 6, 0];
const WEEK_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const LEVELS = 5;

function Heatmap({ series }: { series: TimeSeries }) {
  const { box, handlers, layer } = useTooltip();
  const cells = new Map(series.heatmap.map((c) => [`${c.weekday}:${c.hour}`, c.agentWallMs]));
  const max = Math.max(0, ...series.heatmap.map((c) => c.agentWallMs));
  const level = (ms: number) => ms <= 0 || !max ? 0 : Math.max(1, Math.ceil((ms / max) * LEVELS));
  const hours = Array.from({ length: 24 }, (_, h) => h);
  return <ChartPanel id="chart-heatmap" title="Horários de trabalho" subtitle="Execução de IA somada por dia da semana e hora no período · não equivale a dedicação humana" table={
    <table><thead><tr><th>Dia</th>{hours.map((h) => <th key={h} className="tabular">{String(h).padStart(2, '0')}h</th>)}</tr></thead><tbody>{WEEK.map((w) => <tr key={w}><td>{WEEK_NAMES[w]}</td>{hours.map((h) => { const ms = cells.get(`${w}:${h}`) ?? 0; return <td key={h} className="tabular">{ms ? duration(ms) : '—'}</td>; })}</tr>)}</tbody></table>
  }>
    {max ? <div className="chart-frame" ref={box}>
      <div className="heatmap" role="img" aria-label="Mapa de calor de execução de IA por dia da semana e hora. Valores na tabela abaixo.">
        <span />{hours.map((h) => <span key={h} className="heatmap-hour" aria-hidden="true">{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>)}
        {WEEK.map((w) => [<span key={`l${w}`} className="heatmap-day">{WEEK_NAMES[w]}</span>, ...hours.map((h) => {
          const ms = cells.get(`${w}:${h}`) ?? 0;
          return <span key={`${w}:${h}`} className={`heatmap-cell level-${level(ms)}`} {...handlers({ value: ms ? duration(ms) : 'Sem execução', label: `${WEEK_NAMES[w]}, ${String(h).padStart(2, '0')}h–${String((h + 1) % 24).padStart(2, '0')}h` })} />;
        })])}
      </div>
      <div className="heatmap-legend" aria-hidden="true"><span>Menos</span>{Array.from({ length: LEVELS + 1 }, (_, i) => <span key={i} className={`heatmap-cell level-${i}`} />)}<span>Mais · máx. {duration(max)}/h</span></div>
      {layer}
    </div> : <div className="empty-state"><p>Nenhuma execução de IA no período selecionado.</p></div>}
  </ChartPanel>;
}

export function Charts({ data, query, updated }: { data: DashboardData; query: string; updated: string }) {
  const [series, setSeries] = useState<TimeSeries | null>(null); const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void api<TimeSeries>(`/api/summary/series?${query}`, { signal: controller.signal }).then((value) => { setSeries(value); setError(''); }).catch((e: unknown) => { if (!controller.signal.aborted) setError(errorMessage(e)); });
    return () => controller.abort();
  }, [query, updated]);
  return <div className="charts">
    {error && <p role="alert" className="inline-error">{error}</p>}
    {series ? <DailyChart series={series} /> : !error && <p role="status" className="loading-status">Carregando gráficos…</p>}
    <div className="charts-row">
      <ProjectChart data={data} />
      {series && <Heatmap series={series} />}
    </div>
  </div>;
}
