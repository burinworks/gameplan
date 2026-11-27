import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useRevert, useUpdates } from '../../api/hooks';
import type { UpdateRow } from '../../api/types';
import { today as todayStr } from '../../app/today';
import { errorLine, fmtActor, fmtAgo, fmtDate, fmtRange, statusLabel } from '../../lib/format';
import { Segmented } from '../../ui';
import './updates.css';

type Actor = 'all' | 'agents' | 'you';

const NOT_REVERTIBLE = new Set(['reverted', 'settings_changed', 'captured', 'triaged', 'day_planned']);

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const status = (v: unknown): string => {
  const s = str(v) ?? '—';
  const label = statusLabel(s as Parameters<typeof statusLabel>[0]);
  return label.charAt(0).toUpperCase() + label.slice(1);
};
const host = (url: string | null): string | null => {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** One sentence per event kind, plus optional detail lines. */
export function describe(e: UpdateRow, now: string): { text: string; note?: string; conflicts: string[] } {
  const label = e.label ?? '';
  const before = e.before ?? {};
  const after = e.after ?? {};
  const none: string[] = [];
  switch (e.kind) {
    case 'created':
      return { text: `Created ${label}`, conflicts: none };
    case 'updated':
      return { text: `Edited ${label}`, conflicts: none };
    case 'dates_changed': {
      const bs = str(before.start);
      const be = str(before.end);
      const as = str(after.start);
      const ae = str(after.end);
      let move: string;
      if (bs === as && be !== ae) move = `${be ? fmtDate(be, now) : '—'} → ${ae ? fmtDate(ae, now) : '—'}`;
      else if (be === ae && bs !== as) move = `${bs ? fmtDate(bs, now) : '—'} → ${as ? fmtDate(as, now) : '—'}`;
      else move = `${fmtRange(bs, be, now)} → ${fmtRange(as, ae, now)}`;
      const conflicts = Array.isArray(after.conflicts) ? after.conflicts.filter((c): c is string => typeof c === 'string') : none;
      return { text: `Moved ${label} ${move}`, note: e.reason ?? undefined, conflicts };
    }
    case 'status_changed':
      return { text: `${label}: ${status(before.status)} → ${status(after.status)}`, conflicts: none };
    case 'todo_done':
      return { text: `Ticked ${label}`, conflicts: none };
    case 'todo_undone':
      return { text: `Unticked ${label}`, conflicts: none };
    case 'attached': {
      const ref = str(after.ref);
      if (after.kind === 'commit') return { text: `Linked commit ${(ref ?? label).slice(0, 7)}`, conflicts: none };
      if (after.kind === 'pr') return { text: `Linked PR #${(ref ?? label).replace(/^#/, '')}`, conflicts: none };
      return { text: `Attached ${str(after.title) ?? host(str(after.url)) ?? label}`, conflicts: none };
    }
    case 'detached':
      return { text: `Removed ${label}`, conflicts: none };
    case 'planned':
      return { text: `Planned ${label} · ${num(after.tasks)} tasks · ${num(after.todos)} to-dos · ${num(after.dependencies)} dependencies`, conflicts: none };
    case 'review_accepted':
      return { text: `Approved ${label}`, conflicts: none };
    case 'review_sent_back':
      return { text: `Sent back ${label}`, note: e.reason ?? undefined, conflicts: none };
    case 'resume_noted': {
      const n = str(after.note);
      return { text: `Left off at ${label}`, note: n ? `↳ ${n}` : undefined, conflicts: none };
    }
    case 'captured':
      return { text: `Captured "${str(after.text) ?? label}"`, conflicts: none };
    case 'triaged':
      return { text: `Triaged "${label}"`, conflicts: none };
    case 'archived':
      return { text: `Archived ${label}`, conflicts: none };
    case 'restored':
      return { text: `Restored ${label}`, conflicts: none };
    case 'dependency_added':
      return { text: `Linked ${label}`, conflicts: none };
    case 'dependency_removed':
      return { text: `Unlinked ${label}`, conflicts: none };
    case 'reordered':
      return { text: 'Reordered', conflicts: none };
    case 'reverted':
      return { text: 'Reverted a change', conflicts: none };
    case 'settings_changed':
      return { text: 'Changed settings', conflicts: none };
    case 'day_planned':
      return { text: 'Planned the day', conflicts: none };
    default:
      return { text: label, conflicts: none };
  }
}

function dayHeading(day: string, now: string): string {
  if (day === now) return 'Today';
  const [y = 0, m = 1, d = 1] = now.split('-').map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  return day === yesterday ? 'Yesterday' : fmtDate(day, now);
}

function UpdateItem({ e, now, at }: { e: UpdateRow; now: string; at: Date }) {
  const revert = useRevert();
  const [err, setErr] = useState<string | null>(null);
  const { text, note, conflicts } = describe(e, now);
  const revertible = !NOT_REVERTIBLE.has(e.kind);
  return (
    <li className="up-row">
      <div className="up-main">
        <span className="up-line">
          <span className="up-actor">{fmtActor(e.actor)}</span>
          <span className="up-text" dir="auto">
            {text}
          </span>
        </span>
        {note && (
          <span className="up-note" dir="auto">
            {note}
          </span>
        )}
        {conflicts.map((c) => (
          <span key={c} className="up-risk" dir="auto">
            {c}
          </span>
        ))}
        {err && (
          <span className="up-risk" role="alert">
            {err}
          </span>
        )}
      </div>
      <span className="up-trail">
        {revertible && (
          <button
            type="button"
            className="gp-btn gp-btn--quiet up-revert"
            disabled={revert.isPending}
            onClick={() => {
              setErr(null);
              revert.mutate(e.id, {
                onError: (error) => setErr(errorLine(error instanceof ApiError ? error : { code: 'internal', message: error.message })),
              });
            }}
          >
            Revert
          </button>
        )}
        <time className="up-time" dateTime={e.at}>
          {fmtAgo(e.at, at)}
        </time>
      </span>
    </li>
  );
}

export function UpdatesTab({ slug }: { slug: string }) {
  const [actor, setActor] = useState<Actor>('all');
  const updates = useUpdates({ project: slug, actor });
  const now = todayStr();
  const at = new Date();

  const days: { day: string; rows: UpdateRow[] }[] = [];
  for (const r of updates.data ?? []) {
    const last = days[days.length - 1];
    if (last && last.day === r.day) last.rows.push(r);
    else days.push({ day: r.day, rows: [r] });
  }

  return (
    <section aria-label="Updates" className="pj-body">
      <div className="up-filter">
        <Segmented
          label="Filter updates"
          options={[
            { value: 'all', label: 'All' },
            { value: 'agents', label: 'Agents' },
            { value: 'you', label: 'You' },
          ]}
          value={actor}
          onChange={setActor}
        />
      </div>
      {updates.data && !days.length && <p className="pj-empty">No updates yet</p>}
      {days.map((g) => (
        <div key={g.day} className="up-day">
          <h2 className="up-day__title">{dayHeading(g.day, now)}</h2>
          <ul className="up-list">
            {g.rows.map((r) => (
              <UpdateItem key={r.id} e={r} now={now} at={at} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
