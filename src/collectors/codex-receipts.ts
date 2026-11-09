import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, linkSync, mkdirSync, openSync, realpathSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { DomainError, type EventInput } from '../core/contracts.js';
import { validateEvent } from '../core/events.js';
import { stableId } from '../core/policy.js';
import { atomicPrivate, readPrivate } from '../core/private-files.js';

function readReceipt(path: string): EventInput[] | undefined {
  let text: string;
  try { text = readPrivate(path, 64 * 1024); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  let values: unknown;
  try { values = JSON.parse(text); } catch { throw new DomainError('CODEX_RECEIPT_INVALID'); }
  if (!Array.isArray(values) || !values.length || values.length > 4) throw new DomainError('CODEX_RECEIPT_INVALID');
  values.forEach((event) => validateEvent(event));
  return values as EventInput[];
}

function sameObservation(previous: EventInput, current: EventInput) {
  const { occurredAt: _, ...old } = previous; const { occurredAt: __, ...next } = current;
  if (!isDeepStrictEqual(old, next)) throw new DomainError('CODEX_EVENT_CONFLICT');
  return previous;
}

/** Shared by native history and offline hooks: first durable observation wins, not last clock. */
export function canonicalCodexEvent(dataDir: string, input: EventInput, batchIds: string[], persist = true): EventInput {
  validateEvent(input);
  if (input.tool !== 'codex') throw new DomainError('CODEX_RECEIPT_INVALID');
  const directory = join(dataDir, 'codex-receipts');
  try { if (realpathSync(directory) !== directory) throw new DomainError('CODEX_RECEIPT_UNSAFE'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const legacy = readReceipt(join(directory, `${stableId(input.sourceId, ...batchIds)}.json`));
  const observed = legacy?.find((event) => event.eventId === input.eventId);
  const seed = observed ? sameObservation(observed, input) : input;
  const path = join(directory, `${stableId(input.sourceId, 'codex-event-v1', input.eventId)}.json`);
  const existing = readReceipt(path);
  if (existing) {
    if (existing.length !== 1) throw new DomainError('CODEX_RECEIPT_INVALID');
    const saved = sameObservation(existing[0]!, seed);
    if (observed && observed.occurredAt !== saved.occurredAt) throw new DomainError('CODEX_EVENT_CONFLICT');
    return saved;
  }
  if (!persist) return seed;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (realpathSync(directory) !== directory) throw new DomainError('CODEX_RECEIPT_UNSAFE');
  const temporary = join(directory, `${randomUUID()}.pending`);
  atomicPrivate(temporary, JSON.stringify([seed]));
  try {
    try { linkSync(temporary, path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const fd = openSync(directory, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
  } finally { unlinkSync(temporary); }
  const saved = readReceipt(path);
  if (!saved || saved.length !== 1) throw new DomainError('CODEX_RECEIPT_INVALID');
  return sameObservation(saved[0]!, seed);
}
