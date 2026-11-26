import { fixedClock, type Clock } from '../src/clock.js';
import { openDb } from '../src/db/open.js';
import { Store } from '../src/domain/store.js';
import type { Ctx } from '../src/domain/types.js';

export const YOU: Ctx = { actor: 'you' };

export function setup(now = '2026-11-26T09:00:00Z'): { store: Store; clock: Clock; db: ReturnType<typeof openDb> } {
  const db = openDb(':memory:');
  const clock = fixedClock(now);
  return { db, clock, store: new Store(db, clock) };
}

export function events(store: Store): Array<{ kind: string; entity: string; batch_id: string; actor: string; reason: string | null; label: string | null }> {
  return store.db.prepare('SELECT kind, entity, batch_id, actor, reason, label FROM events ORDER BY rowid').all() as never;
}

export function expectCode(fn: () => unknown, code: string, msg?: RegExp | string): void {
  try {
    fn();
  } catch (e) {
    const err = e as { code?: string; message: string };
    if (err.code !== code) throw new Error(`expected ${code}, got ${err.code ?? 'no code'}: ${err.message}`);
    if (msg && !(typeof msg === 'string' ? err.message.includes(msg) : msg.test(err.message)))
      throw new Error(`message "${err.message}" does not match ${msg}`);
    return;
  }
  throw new Error(`expected ${code}, nothing thrown`);
}
