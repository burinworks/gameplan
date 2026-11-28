import { useMemo, useState } from 'react';
import { useProject } from '../../api/hooks';
import type { TreeMilestone, TreeTask } from '../../api/types';
import { today as todayStr } from '../../app/today';
import { fmtDate, statusLabel } from '../../lib/format';
import { usePaneNav } from '../../pane/Pane';
import { Chip, EmptyState, Icon } from '../../ui';
import { Glyph } from './glyphs';

type Dir = 'asc' | 'desc';
type Tone = 'neutral' | 'ok' | 'risk' | 'review' | 'accent';

const PRIORITY: Record<string, string> = { p1: 'P1', p2: 'P2', p3: 'P3' };

function pill(t: TreeTask): { label: string; tone: Tone } {
  if (t.health === 'conflict') return { label: statusLabel('conflict'), tone: 'risk' };
  const tone: Tone = t.status === 'done' ? 'ok' : t.status === 'review' ? 'review' : t.status === 'doing' ? 'accent' : 'neutral';
  return { label: statusLabel(t.status), tone };
}

/** Sorted by start date, then end date; undated tasks stay last in both directions. */
function sorted(tasks: TreeTask[], dir: Dir): TreeTask[] {
  const sign = dir === 'asc' ? 1 : -1;
  const cmp = (x: string | null, y: string | null): number => (x === y ? 0 : x === null ? 2 : y === null ? -2 : x < y ? -sign : sign);
  return [...tasks].sort((a, b) => cmp(a.start, b.start) || cmp(a.end, b.end));
}

function dates(t: TreeTask, now: string): string {
  if (t.start && t.end) return `${fmtDate(t.start, now)} – ${fmtDate(t.end, now)}`;
  const one = t.start ?? t.end;
  return one ? fmtDate(one, now) : '—';
}

function groupMeta(m: TreeMilestone, open: boolean, now: string): string {
  const parts: string[] = [];
  if (m.due) parts.push(fmtDate(m.due, now));
  if (m.status === 'done') parts.push('done');
  else if (open) parts.push(`${m.progress.done} / ${m.progress.total}`);
  else parts.push(`${m.tasks.length} ${m.tasks.length === 1 ? 'task' : 'tasks'}`);
  return parts.join(' · ');
}

export function ListTab({ slug }: { slug: string }) {
  const project = useProject(slug);
  const { openTask, openNewTask } = usePaneNav();
  const [dir, setDir] = useState<Dir>('asc');
  // Milestones the user opened or closed by hand; the rest follow the default (done ones start closed).
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const now = todayStr();

  const milestones = project.data?.milestones;
  const groups = useMemo(() => (milestones ?? []).map((m) => ({ m, tasks: sorted(m.tasks, dir) })), [milestones, dir]);

  if (!milestones) return <section aria-label="List" className="pj-body" />;
  if (!milestones.some((m) => m.tasks.length)) {
    const firstOpen = milestones.find((m) => m.status !== 'done');
    return (
      <section aria-label="List" className="pj-body">
        <EmptyState
          icon="plus"
          title="No tasks yet"
          hint="Tasks you add show up here, grouped by milestone."
          action={{ label: 'New task', onClick: () => openNewTask(slug, { milestoneId: firstOpen?.id }) }}
        />
      </section>
    );
  }

  const isOpen = (m: TreeMilestone) => toggled[m.id] ?? m.status !== 'done';
  // An area without its own colour takes the palette slot of its position, as in settings and the task pane.
  const areaSlot = new Map((project.data?.project.areas ?? []).map((a, i) => [a.id, i]));
  const areaColour = (a: { id: string; color: string | null }) => a.color ?? `var(--gp-p${((areaSlot.get(a.id) ?? 0) % 8) + 1})`;

  return (
    <section aria-label="List" className="pj-body">
      <table className="pl" role="table" aria-label="Tasks">
        <thead role="rowgroup">
          <tr role="row" className="pl-head">
            <th role="columnheader" scope="col">
              Task
            </th>
            <th role="columnheader" scope="col">
              Area
            </th>
            <th role="columnheader" scope="col" aria-sort={dir === 'asc' ? 'ascending' : 'descending'} className="pl-col-dates">
              <button type="button" className="pl-sort" onClick={() => setDir(dir === 'asc' ? 'desc' : 'asc')}>
                Dates
                <span className={`pl-sort__arrow${dir === 'desc' ? ' is-desc' : ''}`}>
                  <Glyph name="up" size={10} />
                </span>
              </button>
            </th>
            <th role="columnheader" scope="col">
              To-do
            </th>
            <th role="columnheader" scope="col">
              Status
            </th>
            <th role="columnheader" scope="col">
              Priority
            </th>
            <th role="columnheader" scope="col" className="pl-col-num">
              Deliverables
            </th>
          </tr>
        </thead>
        {groups.map(({ m, tasks }) => {
          const open = isOpen(m);
          const done = m.status === 'done';
          return (
            <tbody key={m.id} role="rowgroup">
              <tr role="row" className={`pl-group${done ? ' is-done' : ''}`}>
                <th role="rowheader" scope="colgroup" colSpan={7}>
                  <button type="button" className="pl-group__btn" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${m.name}`} onClick={() => setToggled({ ...toggled, [m.id]: !open })}>
                    <span className={`pl-group__chev${open ? '' : ' is-closed'}`}>
                      <Icon name="chevronDown" size={12} />
                    </span>
                    <span className="pl-group__diamond" aria-hidden="true" style={done ? undefined : { background: m.color ?? undefined }} />
                    <span className="pl-group__name" dir="auto">
                      {m.name}
                    </span>
                    <span className="pl-group__meta">{groupMeta(m, open, now)}</span>
                  </button>
                </th>
              </tr>
              {open &&
                tasks.map((t) => {
                  const s = pill(t);
                  return (
                    <tr key={t.id} role="row" className="pl-row" onClick={() => openTask(slug, t.id)}>
                      <td role="cell" className="pl-col-task">
                        <button type="button" className="pl-title" dir="auto" title={t.title}>
                          {t.title}
                        </button>
                        {t.executor === 'ai' && <span className="pl-tag">AI</span>}
                        {t.executor === 'together' && <span className="pl-tag">Together</span>}
                        {t.important && (
                          <span className="pl-star" role="img" aria-label="Important">
                            <Icon name="star" size={12} />
                          </span>
                        )}
                      </td>
                      <td role="cell" className="pl-area">
                        {t.area ? (
                          <>
                            <span className="pl-area__swatch" aria-hidden="true" style={{ background: areaColour(t.area) }} />
                            <span className="pl-area__name">{t.area.name}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td role="cell" className="pl-dates">
                        {dates(t, now)}
                      </td>
                      <td role="cell" className="pl-todos">
                        {t.todos.length ? (
                          <>
                            <span className="pl-bar" aria-hidden="true">
                              <span className={t.progress.done === t.progress.total ? 'is-complete' : undefined} style={{ width: `${t.progress.pct}%` }} />
                            </span>
                            <span className="pl-todos__n">
                              {t.progress.done} / {t.progress.total}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td role="cell">
                        <Chip tone={s.tone} dot>
                          {s.label}
                        </Chip>
                      </td>
                      <td role="cell">{PRIORITY[t.priority] ?? t.priority}</td>
                      <td role="cell" className="pl-col-num">
                        {t.deliverableCount > 0 && (
                          <>
                            <Glyph name="paperclip" size={13} />
                            {t.deliverableCount}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          );
        })}
      </table>
    </section>
  );
}
