import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useRevert, useUpdates } from '../../api/hooks';
import type { UpdateRow } from '../../api/types';
import { today as todayStr } from '../../app/today';
import { errorLine, fmtActor, fmtAgo, fmtDate, fmtHeaderDate, fmtRange, statusLabel } from '../../lib/format';
import { EmptyState } from '../../ui';
import { Glyph, type GlyphName } from './glyphs';
import './updates.css';

export type Actor = 'all' | 'agents' | 'you';

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

interface Described {
  /** Lowercase verb phrase after the actor ("moved", "added a commit to"). */
  verb: string;
  /** What the event is about; shown in medium weight. */
  target: string;
  /** Second line: an icon plus text (dates, commit, plan counts). */
  detail?: { text: string; icon?: GlyphName; mono?: boolean };
  /** A reason or note, shown with a left rule. */
  note?: string;
  conflicts: string[];
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** One sentence per event kind (actor + verb + target), plus an optional detail line and note. */
export function describe(e: UpdateRow, now: string): Described {
  const label = e.label ?? '';
  const before = e.before ?? {};
  const after = e.after ?? {};
  const none: string[] = [];
  switch (e.kind) {
    case 'created': {
      const due = str(after.due);
      return { verb: 'created', target: label, detail: due ? { text: `Due ${fmtDate(due, now)}`, icon: 'cal' } : undefined, conflicts: none };
    }
    case 'updated':
      return { verb: 'edited', target: label, conflicts: none };
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
      return { verb: 'moved', target: label, detail: { text: move, icon: 'cal' }, note: e.reason ?? undefined, conflicts };
    }
    case 'status_changed':
      return { verb: 'changed the status of', target: label, detail: { text: `${status(before.status)} → ${status(after.status)}` }, conflicts: none };
    case 'todo_done':
      return { verb: 'ticked', target: label, conflicts: none };
    case 'todo_undone':
      return { verb: 'unticked', target: label, conflicts: none };
    case 'attached': {
      const ref = str(after.ref);
      const task = str(after.task) ?? label;
      if (after.kind === 'commit') return { verb: 'added a commit to', target: task, detail: { text: `${(ref ?? label).slice(0, 7)}  ${str(after.title) ?? ''}`.trim(), icon: 'commit', mono: true }, conflicts: none };
      if (after.kind === 'pr') return { verb: 'linked a pull request to', target: task, detail: { text: `#${(ref ?? label).replace(/^#/, '')}  ${str(after.title) ?? ''}`.trim(), icon: 'pr' }, conflicts: none };
      return { verb: 'attached', target: str(after.title) ?? host(str(after.url)) ?? label, conflicts: none };
    }
    case 'detached':
      return { verb: 'removed', target: label, conflicts: none };
    case 'planned':
      return {
        verb: 'planned',
        target: label,
        detail: { text: `${plural(num(after.tasks), 'task', 'tasks')} · ${plural(num(after.todos), 'to-do', 'to-dos')} · ${plural(num(after.dependencies), 'dependency', 'dependencies')}`, icon: 'plan' },
        conflicts: none,
      };
    case 'review_accepted':
      return { verb: 'accepted', target: label, conflicts: none };
    case 'review_sent_back':
      return { verb: 'sent back', target: label, note: e.reason ?? undefined, conflicts: none };
    case 'resume_noted':
      return { verb: 'left off at', target: label, note: str(after.note) ?? undefined, conflicts: none };
    case 'captured':
      return { verb: 'captured', target: `"${str(after.text) ?? label}"`, conflicts: none };
    case 'triaged':
      return { verb: 'triaged', target: `"${label}"`, conflicts: none };
    case 'archived':
      return { verb: 'archived', target: label, conflicts: none };
    case 'restored':
      return { verb: 'restored', target: label, conflicts: none };
    case 'dependency_added':
      return { verb: 'linked', target: label, conflicts: none };
    case 'dependency_removed':
      return { verb: 'unlinked', target: label, conflicts: none };
    case 'reordered':
      return { verb: 'reordered', target: label, conflicts: none };
    case 'reverted':
      return { verb: 'reverted a change', target: '', conflicts: none };
    case 'settings_changed':
      return { verb: 'changed settings', target: '', conflicts: none };
    case 'day_planned':
      return { verb: 'planned the day', target: '', conflicts: none };
    default:
      return { verb: '', target: label, conflicts: none };
  }
}

function dayHeading(day: string, now: string): string {
  if (day === now) return 'Today';
  const [y = 0, m = 1, d = 1] = now.split('-').map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  return day === yesterday ? 'Yesterday' : fmtHeaderDate(day);
}

function UpdateItem({ e, now, at }: { e: UpdateRow; now: string; at: Date }) {
  const revert = useRevert({ inlineError: true });
  const [err, setErr] = useState<string | null>(null);
  const { verb, target, detail, note, conflicts } = describe(e, now);
  const revertible = !NOT_REVERTIBLE.has(e.kind);
  const actor = fmtActor(e.actor);
  const isYou = e.actor === 'you';
  return (
    <li className="up-row">
      <span className={`up-avatar${isYou ? ' is-you' : ''}`} aria-hidden="true">
        {actor.charAt(0).toUpperCase()}
      </span>
      <div className="up-main">
        <div className="up-line" dir="auto">
          <span className="up-actor">{actor}</span>
          {verb && <span className="up-verb"> {verb}</span>}
          {target && <span className="up-target"> {target}</span>}
        </div>
        {detail && (
          <div className={`up-detail${detail.mono ? ' is-mono' : ''}`}>
            {detail.icon && <Glyph name={detail.icon} size={13} />}
            <span dir="auto">{detail.text}</span>
          </div>
        )}
        {note && (
          <div className="up-note" dir="auto">
            {note}
          </div>
        )}
        {conflicts.map((c) => (
          <div key={c} className="up-detail up-risk" dir="auto">
            <Glyph name="cal" size={13} />
            <span>{c}</span>
          </div>
        ))}
        {err && (
          <div className="up-detail up-risk" role="alert">
            {err}
          </div>
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

export function UpdatesTab({ slug, actor }: { slug: string; actor: Actor }) {
  const updates = useUpdates({ project: slug, actor });
  const now = todayStr();
  const at = new Date();

  const days: { day: string; rows: UpdateRow[] }[] = [];
  for (const r of updates.data ?? []) {
    const last = days[days.length - 1];
    if (last && last.day === r.day) last.rows.push(r);
    else days.push({ day: r.day, rows: [r] });
  }

  if (updates.data && !days.length) {
    return (
      <section aria-label="Updates" className="pj-body">
        <EmptyState icon="commit" title="No activity yet" hint="Changes by you and agents show up here." />
      </section>
    );
  }

  return (
    <section aria-label="Updates" className="pj-body up">
      <div className="up-feed">
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
      </div>
    </section>
  );
}
