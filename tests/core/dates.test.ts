import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dateInZone, nextDate, startOfDay } from '../../src/core/dates.js';

test('datas locais: UTC, virada de dia, DST de 23/25 horas e meia-noite inexistente', () => {
  assert.equal(startOfDay('2026-11-05', 'America/Sao_Paulo'), '2026-11-05T03:00:00.000Z');
  assert.equal(dateInZone(new Date('2026-11-05T02:59:59.999Z'), 'America/Sao_Paulo'), '2026-11-04');
  assert.equal(nextDate('2026-12-31'), '2027-01-01');
  assert.equal(Date.parse(startOfDay('2026-03-09', 'America/New_York')) - Date.parse(startOfDay('2026-03-08', 'America/New_York')), 23 * 3_600_000);
  assert.equal(Date.parse(startOfDay('2026-11-02', 'America/New_York')) - Date.parse(startOfDay('2026-11-01', 'America/New_York')), 25 * 3_600_000);
  assert.equal(startOfDay('2018-11-04', 'America/Sao_Paulo'), '2018-11-04T03:00:00.000Z');
  assert.throws(() => startOfDay('2026-02-30', 'America/Sao_Paulo'));
});
