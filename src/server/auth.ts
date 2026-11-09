import { randomBytes, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { join } from 'node:path';

export async function readBootstrapToken(dataDir: string): Promise<string> {
  const file = await open(join(dataDir, 'bootstrap.token'), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 128 || (info.mode & 0o777) !== 0o600 || info.uid !== process.getuid?.()) {
      throw new Error('Token local exige arquivo do usuário com permissão 0600.');
    }
    const token = (await file.readFile('utf8')).trim();
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Token local inválido.');
    return token;
  } finally { await file.close(); }
}

export async function ensureBootstrapToken(dataDir: string): Promise<string> {
  let file;
  try {
    file = await open(join(dataDir, 'bootstrap.token'), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  if (file) {
    try { await file.writeFile(`${randomBytes(32).toString('hex')}\n`); await file.sync(); }
    finally { await file.close(); }
  }
  return readBootstrapToken(dataDir);
}

export function isLocalRequest(req: IncomingMessage, origin: string): boolean {
  return req.headers.host === new URL(origin).host
    && (!req.headers.origin || req.headers.origin === origin)
    && (!req.headers['sec-fetch-site'] || ['none', 'same-origin'].includes(String(req.headers['sec-fetch-site'])));
}

export function createAuth(bootstrapToken: string) {
  const sessions = new Map<string, number>();
  const cookieName = 'worklog_session';
  function hasToken(req: IncomingMessage) {
    const value = req.headers.authorization;
    if (!value || !/^Bearer [a-f0-9]{64}$/.test(value)) return false;
    return timingSafeEqual(Buffer.from(value.slice(7)), Buffer.from(bootstrapToken));
  }
  function sessionId(req: IncomingMessage) {
    return req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? '';
  }
  return {
    hasToken,
    authorized(req: IncomingMessage) { return hasToken(req) || (sessions.get(sessionId(req)) ?? 0) > Date.now(); },
    newSession() {
      for (const [key, expiresAt] of sessions) if (expiresAt <= Date.now()) sessions.delete(key);
      if (sessions.size >= 32) sessions.delete(sessions.keys().next().value!);
      const id = randomBytes(32).toString('hex');
      sessions.set(id, Date.now() + 8 * 60 * 60 * 1000);
      return `${cookieName}=${id}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=28800`;
    },
    logout(req: IncomingMessage) {
      sessions.delete(sessionId(req));
      return `${cookieName}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0`;
    },
  };
}
