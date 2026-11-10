import { DomainError } from './contracts.js';

export function dateInZone(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function nextDate(date: string) {
  if (!/^\d{4}-\d\d-\d\d$/.test(date)) throw new DomainError('INVALID_DATE');
  const value = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== date) throw new DomainError('INVALID_DATE');
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}
export function startOfDay(date: string, timezone: string) {
  nextDate(date);
  const desired = Date.parse(`${date}T00:00:00.000Z`);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  let candidate = desired;
  const possibilities: number[] = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map((part) => [part.type, part.value]));
    const local = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000Z`);
    if (local === desired) return new Date(candidate).toISOString();
    if (`${parts.year}-${parts.month}-${parts.day}` === date && local >= desired) possibilities.push(candidate);
    candidate += desired - local;
  }
  if (possibilities.length) return new Date(Math.min(...possibilities)).toISOString();
  throw new DomainError('UNREPRESENTABLE_LOCAL_DATE');
}

export const DISPLAY_TIMEZONE = 'America/Sao_Paulo';
const displayFormatters = new Map<string, Intl.DateTimeFormat>();
/** Data e hora para leitura humana: DD/MM/YYYY H:mm:ss no fuso informado (padrão: horário de Brasília). */
export function formatDateTime(value: string | number | Date, timezone = DISPLAY_TIMEZONE) {
  let formatter = displayFormatters.get(timezone);
  if (!formatter) displayFormatters.set(timezone, formatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }));
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  const p = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${p.day}/${p.month}/${p.year} ${Number(p.hour)}:${p.minute}:${p.second}`;
}
/** Dia local YYYY-MM-DD como DD/MM/YYYY. */
export function formatDate(date: string) { const [year, month, day] = date.split('-'); return `${day}/${month}/${year}`; }
/** Converte instante UTC para o valor de <input type="datetime-local"> no fuso (YYYY-MM-DDTHH:mm:ss). */
export function toLocalInput(value: string | number, timezone = DISPLAY_TIMEZONE) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
/** Valor de <input type="datetime-local"> interpretado no fuso, devolvido em ISO UTC. */
export function fromLocalInput(value: string, timezone = DISPLAY_TIMEZONE) {
  const match = /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d)(?::(\d\d))?$/.exec(value);
  if (!match) throw new DomainError('INVALID_DATE');
  const [, date, hour, minute, second = '00'] = match;
  return new Date(Date.parse(startOfDay(date!, timezone)) + ((Number(hour) * 60 + Number(minute)) * 60 + Number(second)) * 1000).toISOString();
}
