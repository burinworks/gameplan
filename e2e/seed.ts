import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export interface Seeded {
  baseURL: string;
  stop(): Promise<void>;
  /** Ids the flows need. */
  ids: { reviewTask: string; dragTask: string; lateTask: string; planTasks: string[]; projectSlug: string };
}

const root = resolve(import.meta.dirname, '..');

function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const s = createServer();
    s.once('error', fail);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => ok(port));
    });
  });
}

const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const dayOffset = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

async function waitUp(base: string, child: ChildProcess, log: () => string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`engine exited early: ${log()}`);
    try {
      if ((await fetch(`${base}/api/home`)).ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`engine did not start: ${log()}`);
}

/** Starts the built engine on a free port with a temp DB, seeds it through the HTTP API. */
export async function startSeeded(): Promise<Seeded> {
  const dir = mkdtempSync(join(tmpdir(), 'gameplan-e2e-'));
  const port = await freePort();
  const baseURL = `http://127.0.0.1:${port}`;
  let out = '';
  const child = spawn(process.execPath, ['dist/src/server/main.js'], {
    cwd: root,
    env: { ...process.env, GAMEPLAN_PORT: String(port), GAMEPLAN_DB: join(dir, 'gameplan.db'), GAMEPLAN_UI: join(root, 'dist', 'ui') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (b) => (out += String(b)));
  child.stderr?.on('data', (b) => (out += String(b)));
  const stop = async (): Promise<void> => {
    if (child.exitCode === null) {
      const done = new Promise((r) => child.once('exit', r));
      child.kill('SIGTERM');
      await done;
    }
    rmSync(dir, { recursive: true, force: true });
  };

  try {
    await waitUp(baseURL, child, () => out);
    const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      const r = await fetch(`${baseURL}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${await r.text()}`);
      return (await r.json()) as T;
    };
    type Ms = { id: string; name: string };
    const project = async (name: string, template: string, startDate: string, color?: string) => {
      const p = await call<{ slug: string }>('POST', '/api/projects', { name, template, startDate, ...(color ? { color } : {}) });
      const tree = await call<{ milestones: Ms[] }>('GET', `/api/projects/${p.slug}`);
      return { slug: p.slug, milestones: tree.milestones };
    };
    const task = (milestoneId: string, body: Record<string, unknown>) => call<{ id: string }>('POST', `/api/milestones/${milestoneId}/tasks`, body);

    const report = await project('Quarterly report', 'report', dayOffset(-14));
    const launch = await project('Spring launch', 'launch', dayOffset(-3));

    const draft = await task(report.milestones[1]!.id, { title: 'Draft the summary', start: dayOffset(-2), end: dayOffset(2), executor: 'manual', status: 'doing' });
    const outline = await task(report.milestones[0]!.id, { title: 'Review the outline', start: dayOffset(-5), end: dayOffset(-1), executor: 'ai', status: 'doing' });
    await call('POST', `/api/tasks/${outline.id}/todos`, [{ title: 'Check sources' }, { title: 'Check headings' }]);
    const review = await task(report.milestones[0]!.id, { title: 'Check the figures', start: dayOffset(-4), end: dayOffset(0), executor: 'ai', status: 'review' });
    const drag = await task(report.milestones[2]!.id, { title: 'Interview notes', start: dayOffset(4), end: dayOffset(8), executor: 'manual' });
    const late = await task(launch.milestones[0]!.id, { title: 'Book the venue', start: dayOffset(-9), end: dayOffset(-2), executor: 'manual', status: 'todo' });
    const second = await task(launch.milestones[1]!.id, { title: 'Write the press note', start: dayOffset(0), end: dayOffset(5), executor: 'together' });

    await call('PUT', `/api/day-plan/${dayOffset(0)}`, { items: [{ taskId: draft.id, when: 'Morning' }, { taskId: second.id }] });
    for (const t of ['Pay the invoice', 'Renew the passport', 'Email the printer', 'Order stickers']) await call('POST', '/api/inbox', { text: t });

    return {
      baseURL,
      stop,
      ids: { reviewTask: review.id, dragTask: drag.id, lateTask: late.id, planTasks: [draft.id, second.id], projectSlug: report.slug },
    };
  } catch (e) {
    await stop();
    throw e;
  }
}
