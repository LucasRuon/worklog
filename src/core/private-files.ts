import { constants, openSync, closeSync, readFileSync, writeFileSync, fsyncSync, fstatSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { DomainError } from './contracts.js';

export function readPrivate(path: string, limit = 1024 * 1024): string {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > limit || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0) throw new DomainError('UNSAFE_LOCAL_FILE');
    return readFileSync(fd, 'utf8');
  } finally { closeSync(fd); }
}

export function atomicPrivate(path: string, content: string) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, content); fsyncSync(fd); }
  finally { closeSync(fd); }
  try {
    renameSync(temporary, path);
    const directory = openSync(dirname(path), constants.O_RDONLY);
    try { fsyncSync(directory); } finally { closeSync(directory); }
  } catch (error) { try { unlinkSync(temporary); } catch { /* Arquivo já movido. */ } throw error; }
}
