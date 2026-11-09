import { uuid, utc, tools, DomainError, type AppContext, type ReportFilter, type Tool } from './contracts.js';

export function validateFilter(filter: ReportFilter) {
  if (filter.onlyUnassigned !== undefined && typeof filter.onlyUnassigned !== 'boolean' || filter.onlyUnassigned && !filter.includeUnassigned) throw new DomainError('INVALID_FILTER');
  utc(filter.from); utc(filter.to);
  if (filter.from >= filter.to || !Array.isArray(filter.projectIds) || filter.projectIds.length > 100) throw new DomainError('INVALID_PERIOD');
  filter.projectIds.forEach(uuid);
  if (filter.sourceIds !== undefined) {
    if (!Array.isArray(filter.sourceIds) || filter.sourceIds.length > 100) throw new DomainError('INVALID_FILTER');
    filter.sourceIds.forEach(uuid);
  }
  if (filter.deviceIds !== undefined) {
    if (!Array.isArray(filter.deviceIds) || filter.deviceIds.length > 100) throw new DomainError('INVALID_FILTER');
    filter.deviceIds.forEach(uuid);
  }
  if (filter.tools !== undefined && (!Array.isArray(filter.tools) || filter.tools.length > tools.length || filter.tools.some((tool) => !tools.includes(tool)))) throw new DomainError('INVALID_FILTER');
  try { new Intl.DateTimeFormat('pt-BR', { timeZone: filter.timezone }).format(); } catch { throw new DomainError('INVALID_TIMEZONE'); }
}
export function selectedProjects(ctx: AppContext, filter: ReportFilter): Set<string> {
  if (filter.onlyUnassigned) return new Set();
  return new Set(filter.projectIds.length ? filter.projectIds : ctx.db.all<{ id: string }>('SELECT id FROM projects').map((project) => project.id));
}
export function selectedOrigin(filter: ReportFilter, deviceId: string, tool: Tool, sourceId?: string) {
  return (!filter.deviceIds?.length || filter.deviceIds.includes(deviceId)) && (!filter.tools?.length || filter.tools.includes(tool)) && (!filter.sourceIds?.length || !!sourceId && filter.sourceIds.includes(sourceId));
}
