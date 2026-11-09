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
