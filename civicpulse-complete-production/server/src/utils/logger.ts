/**
 * Minimal structured logger. Swap for pino/winston later without touching
 * call sites - only this file knows the implementation.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

function log(level: Level, message: string, meta?: unknown): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, message, ...(meta ? { meta } : {}) });
  // eslint-disable-next-line no-console
  (level === 'error' ? console.error : console.log)(line);
}

export const logger = {
  debug: (m: string, meta?: unknown) => log('debug', m, meta),
  info: (m: string, meta?: unknown) => log('info', m, meta),
  warn: (m: string, meta?: unknown) => log('warn', m, meta),
  error: (m: string, meta?: unknown) => log('error', m, meta),
};
