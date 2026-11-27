import { useCallback, useMemo, useState } from 'react';
import { useAddDependency, useProject, useReschedule, useSettings } from '../../api/hooks';
import type { TreeTask } from '../../api/types';
import { today as todayStr } from '../../app/today';
import { fmtDate } from '../../lib/format';
import { usePaneNav } from '../../pane/Pane';
import { useDraftBar } from '../../pane/draftBar';
import { Timeline, type TLBar, type TLGroup, type TLLink, type TLRow } from '../../timeline/Timeline';

export type GroupBy = 'milestone' | 'area';

const DAY_MS = 86_400_000;
const NO_AREA = 'no-area';

function addDays(d: string, n: number): string {
  const [y = 0, m = 1, day = 1] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day) + n * DAY_MS).toISOString().slice(0, 10);
}
const minDate = (a: string, b: string): string => (a < b ? a : b);
const maxDate = (a: string, b: string): string => (a > b ? a : b);

const storeKey = (slug: string): string => `gameplan.timeline.collapsed.${slug}`;
function loadCollapsed(slug: string): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(storeKey(slug)) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function saveCollapsed(slug: string, ids: string[]): void {
  try {
    localStorage.setItem(storeKey(slug), JSON.stringify(ids));
  } catch {
    /* storage unavailable: collapse state lasts for this session only */
  }
}

const atRisk = (t: TreeTask): boolean => t.health === 'late' || t.health === 'conflict';

export function TimelineTab({ slug, zoom = 'week', groupBy = 'milestone' }: { slug: string; zoom?: 'week' | 'month'; groupBy?: GroupBy }) {
  const project = useProject(slug);
  const settings = useSettings();
  const reschedule = useReschedule();
  const addDependency = useAddDependency();
  const { openTask } = usePaneNav();
  const draft = useDraftBar();
  const [collapsed, setCollapsed] = useState<string[]>(() => loadCollapsed(slug));
  const now = todayStr();

  const toggle = useCallback(
    (id: string) =>
      setCollapsed((cur) => {
        const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
        saveCollapsed(slug, next);
        return next;
      }),
    [slug],
  );

  const built = useMemo(() => {
    const tree = project.data;
    if (!tree) return null;
    const projectColor = tree.project.color ?? 'var(--gp-accent)';
    const taskIds = new Set<string>();
    const milestoneIds = new Set<string>();

    const taskRow = (t: TreeTask, group: string): TLRow => {
      taskIds.add(t.id);
      const s = t.start ?? t.end;
      const e = t.end ?? t.start;
      const bars: TLBar[] =
        s && e
          ? [{ id: t.id, kind: 'task', label: t.title, start: s, end: e, color: t.area?.color ?? projectColor, progress: t.progress.pct, risk: atRisk(t), draggable: true }]
          : [];
      return { id: t.id, label: t.title, meta: t.end ? fmtDate(t.end, now) : undefined, dot: atRisk(t) ? 'risk' : undefined, bars, group };
    };

    const groups: TLGroup[] = [];
    const rows: TLRow[] = [];
    const draftGroup = draft?.milestoneId && groupBy === 'milestone' && tree.milestones.some((m) => m.id === draft.milestoneId) ? draft.milestoneId : undefined;

    if (groupBy === 'milestone') {
      for (const m of tree.milestones) {
        groups.push({ id: m.id, label: m.name, collapsed: collapsed.includes(m.id) });
        milestoneIds.add(m.id);
        const end = m.span.end ?? m.due;
        const start = m.span.start ?? end;
        rows.push({
          id: `milestone:${m.id}`,
          label: 'Milestone',
          meta: m.due ? fmtDate(m.due, now) : undefined,
          dot: m.health === 'late' || m.health === 'conflict' ? 'risk' : undefined,
          bars:
            start && end
              ? [{ id: m.id, kind: 'milestone', label: m.name, start, end, color: projectColor, progress: m.progress.pct, risk: m.health === 'late' || m.health === 'conflict', diamond: true, draggable: false }]
              : [],
          group: m.id,
        });
        for (const t of m.tasks) rows.push(taskRow(t, m.id));
      }
    } else {
      const all = tree.milestones.flatMap((m) => m.tasks);
      const buckets = [...tree.project.areas.map((a) => ({ id: a.id, label: a.name })), { id: NO_AREA, label: 'No area' }];
      for (const b of buckets) {
        const ts = all.filter((t) => (t.area?.id ?? NO_AREA) === b.id);
        if (!ts.length) continue;
        groups.push({ id: b.id, label: b.label, collapsed: collapsed.includes(b.id) });
        for (const t of ts) rows.push(taskRow(t, b.id));
      }
    }

    if (draft) {
      const g = draftGroup ?? groups[0]?.id;
      const row: TLRow = {
        id: 'draft',
        label: 'Untitled task',
        bars: [{ id: 'draft', kind: 'draft', label: 'Untitled task', start: draft.start, end: draft.end, color: projectColor, progress: 0, risk: false, draggable: false }],
        group: g,
      };
      // Rows of one group must stay contiguous: insert after the last row of that group.
      let at = -1;
      rows.forEach((r, i) => {
        if (r.group === g) at = i;
      });
      if (at < 0) rows.push(row);
      else rows.splice(at + 1, 0, row);
    }

    const links: TLLink[] = [];
    for (const m of tree.milestones)
      for (const t of m.tasks) for (const d of t.dependsOn) links.push({ fromId: d.id, toId: t.id, bad: d.bad });

    const dated = rows.flatMap((r) => r.bars);
    const taskBars = dated.filter((b) => b.kind !== 'milestone');
    const starts = taskBars.map((b) => b.start);
    const ends = taskBars.map((b) => b.end);
    const from = addDays(starts.length ? starts.reduce(minDate) : now, -7);
    const to = maxDate(addDays(ends.length ? ends.reduce(maxDate) : now, 14), addDays(now, 45));
    return { rows, groups, links, from: minDate(from, addDays(now, -7)), to, taskIds, milestoneIds };
  }, [project.data, groupBy, collapsed, draft, now]);

  if (!built) {
    return <section aria-label="Timeline" className="pj-body" />;
  }
  if (!built.rows.length) {
    return (
      <section aria-label="Timeline" className="pj-body">
        <p className="pj-empty">No tasks yet</p>
      </section>
    );
  }

  return (
    <section aria-label="Timeline" className="pj-body">
      <Timeline
        key={`${slug}:${groupBy}`}
        rows={built.rows}
        links={built.links}
        groups={built.groups}
        from={built.from}
        to={built.to}
        today={now}
        zoom={zoom}
        weekStart={settings.data?.week_start === 'sun' ? 'sun' : 'mon'}
        showWeekends={settings.data?.show_weekends ?? true}
        initialScrollToToday
        onToggleGroup={toggle}
        onOpen={(id) => {
          if (built.taskIds.has(id)) openTask(slug, id);
        }}
        onReschedule={(id, dates) => {
          if (!built.taskIds.has(id)) return;
          return reschedule.mutateAsync({ id, start: dates.start, end: dates.end });
        }}
        onLink={(fromId, toId) => {
          // Dragging A's end onto B makes B depend on A. Milestones cannot depend on anything.
          if (!built.taskIds.has(toId)) return;
          if (built.taskIds.has(fromId)) addDependency.mutate({ fromTaskId: toId, taskId: fromId });
          else if (built.milestoneIds.has(fromId)) addDependency.mutate({ fromTaskId: toId, milestoneId: fromId });
        }}
      />
    </section>
  );
}
