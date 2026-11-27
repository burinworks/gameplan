import { useMemo, useState } from 'react';
import { useProject } from '../../api/hooks';
import type { TreeTask } from '../../api/types';
import { today as todayStr } from '../../app/today';
import { fmtDate, fmtDue, fmtTodos, statusLabel } from '../../lib/format';
import { usePaneNav } from '../../pane/Pane';
import { Chip, Icon } from '../../ui';

type SortKey = 'start' | 'end';
type Tone = 'neutral' | 'ok' | 'risk' | 'review' | 'accent';

const PRIORITY: Record<string, string> = { p1: 'P1', p2: 'P2', p3: 'P3' };

function pill(t: TreeTask): { label: string; tone: Tone } {
  if (t.health === 'conflict') return { label: statusLabel('conflict'), tone: 'risk' };
  const tone: Tone = t.status === 'done' ? 'ok' : t.status === 'review' ? 'review' : t.status === 'doing' ? 'accent' : 'neutral';
  return { label: statusLabel(t.status), tone };
}

function sorted(tasks: TreeTask[], sort: { key: SortKey; dir: 'asc' | 'desc' } | null): TreeTask[] {
  if (!sort) return tasks;
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...tasks].sort((a, b) => {
    const x = a[sort.key];
    const y = b[sort.key];
    if (x === y) return 0;
    if (x === null) return 1; // undated tasks stay last in both directions
    if (y === null) return -1;
    return x < y ? -sign : sign;
  });
}

export function ListTab({ slug }: { slug: string }) {
  const project = useProject(slug);
  const { openTask } = usePaneNav();
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  const now = todayStr();

  const milestones = project.data?.milestones;
  const groups = useMemo(() => (milestones ?? []).map((m) => ({ m, tasks: sorted(m.tasks, sort) })), [milestones, sort]);

  if (!milestones) return <section aria-label="List" className="pj-body" />;
  if (!milestones.some((m) => m.tasks.length)) {
    return (
      <section aria-label="List" className="pj-body">
        <p className="pj-empty">No tasks yet</p>
      </section>
    );
  }

  const toggle = (key: SortKey) => setSort((cur) => (cur?.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const sortHead = (key: SortKey, label: string) => (
    <th scope="col" className="pl-col-date" aria-sort={sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="pl-sort" onClick={() => toggle(key)}>
        {label}
        {sort?.key === key && <span aria-hidden="true">{sort.dir === 'asc' ? ' ↑' : ' ↓'}</span>}
      </button>
    </th>
  );

  return (
    <section aria-label="List" className="pj-body">
      <table className="pl">
        <thead>
          <tr>
            <th scope="col">Task</th>
            <th scope="col">Area</th>
            {sortHead('start', 'Start')}
            {sortHead('end', 'End')}
            <th scope="col">To-dos</th>
            <th scope="col">Status</th>
            <th scope="col">Priority</th>
            <th scope="col" className="pl-col-num">
              Deliverables
            </th>
          </tr>
        </thead>
        {groups.map(({ m, tasks }) => (
          <tbody key={m.id}>
            <tr className="pl-group">
              <th scope="colgroup" colSpan={8}>
                <span dir="auto">{m.name}</span>
                <span className="pl-group__meta">
                  {m.due ? ` · ${fmtDue(m.due, now)}` : ''} · {fmtTodos(m.progress.done, m.progress.total)}
                </span>
              </th>
            </tr>
            {tasks.map((t) => {
              const s = pill(t);
              const pct = t.progress.pct;
              return (
                <tr key={t.id} className="pl-row" onClick={() => openTask(slug, t.id)}>
                  <td>
                    <div className="pl-col-task">
                      <button type="button" className="pl-title" dir="auto" title={t.title}>
                        {t.title}
                      </button>
                      {t.executor === 'ai' && <Chip>AI</Chip>}
                      {t.executor === 'together' && <Chip>Together</Chip>}
                      {t.important && (
                        <span className="pl-star" role="img" aria-label="Important">
                          <Icon name="star" size={11} />
                        </span>
                      )}
                    </div>
                  </td>
                  <td>{t.area?.name ?? '—'}</td>
                  <td className="pl-col-date">{t.start ? fmtDate(t.start, now) : '—'}</td>
                  <td className="pl-col-date">{t.end ? fmtDate(t.end, now) : '—'}</td>
                  <td>
                    {t.todos.length ? (
                      <span className="pl-todos">
                        <span className="pl-bar" aria-hidden="true">
                          <span style={{ width: `${pct}%` }} />
                        </span>
                        {t.progress.done}/{t.progress.total}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <Chip tone={s.tone}>{s.label}</Chip>
                  </td>
                  <td>{PRIORITY[t.priority] ?? t.priority}</td>
                  <td className="pl-col-num">{t.deliverableCount || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </section>
  );
}
