import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation } from 'wouter';
import { useCapture, useInbox, useProjects, useRevert, useSearch, useTriage, type TriageTarget } from '../../api/hooks';
import { undoStack } from '../../api/live';
import { paths } from '../../app/routes';
import { useShortcut } from '../../app/shortcuts';
import { fmtActorAt } from '../../lib/format';
import { Button, Field, Swatch, Undo } from '../../ui';
import './inbox.css';

type OpenMenu = { id: string; kind: 'task' | 'todo' } | null;

/** Inline popover: a menu of `menuitem` buttons, optionally with a search field on top. */
function Popover({
  label,
  onClose,
  search,
  children,
}: {
  label: string;
  onClose: () => void;
  search?: { value: string; onChange: (v: string) => void; label: string };
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const first = box.current?.querySelector<HTMLElement>(search ? 'input' : '[role="menuitem"]');
    first?.focus();
    const down = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    const items = [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[i < 0 ? 0 : (i + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (i <= 0 && search) box.current?.querySelector<HTMLElement>('input')?.focus();
      else items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') onClose();
  };

  return (
    <div ref={box} className="gp-inbox__menu" role="menu" aria-label={label} onKeyDown={onKeyDown}>
      {search && <Field value={search.value} onChange={search.onChange} label={search.label} placeholder="Search tasks" />}
      {children}
    </div>
  );
}

function MilestoneMenu({ onPick, onClose }: { onPick: (slug: string, milestoneId: string) => void; onClose: () => void }) {
  const { data = [] } = useProjects('active');
  const groups = data.filter((p) => p.milestones.some((m) => m.status !== 'done'));
  return (
    <Popover label="Make task in" onClose={onClose}>
      {groups.length === 0 && <div className="gp-inbox__none">No open milestones</div>}
      {groups.map((p) => (
        <div key={p.slug} role="group" aria-label={p.name}>
          <div className="gp-inbox__group" dir="auto">
            <Swatch color={p.color} />
            {p.name}
          </div>
          {p.milestones
            .filter((m) => m.status !== 'done')
            .map((m) => (
              <button key={m.id} type="button" role="menuitem" tabIndex={-1} className="gp-menu__item" onClick={() => onPick(p.slug, m.id)}>
                <span dir="auto">{m.name}</span>
              </button>
            ))}
        </div>
      ))}
    </Popover>
  );
}

function TaskMenu({ onPick, onClose }: { onPick: (taskId: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const { data = [] } = useSearch(q);
  const hits = data.filter((h) => h.type === 'task');
  return (
    <Popover label="Add as to-do to" onClose={onClose} search={{ value: q, onChange: setQ, label: 'Find a task' }}>
      {q.trim() !== '' && hits.length === 0 && <div className="gp-inbox__none">No matching tasks</div>}
      {hits.map((h) => (
        <button key={h.id} type="button" role="menuitem" tabIndex={-1} className="gp-menu__item gp-inbox__hit" title={h.path} onClick={() => onPick(h.id)}>
          <span dir="auto">{h.title}</span>
          <span className="gp-inbox__path" dir="auto">
            {h.path.split(' › ').slice(0, -1).join(' › ')}
          </span>
        </button>
      ))}
    </Popover>
  );
}

export function Inbox() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const inbox = useInbox();
  const capture = useCapture();
  const triage = useTriage();
  const revert = useRevert();
  const [text, setText] = useState('');
  const [open, setOpen] = useState<OpenMenu>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [undo, setUndo] = useState<{ message: string; id: string } | null>(null);

  const items = useMemo(() => (inbox.data?.items ?? []).filter((i) => !gone.has(i.id)), [inbox.data, gone]);
  const now = new Date();

  const refresh = () => void qc.invalidateQueries({ queryKey: ['inbox'] });

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    capture.mutate(t, {
      onSuccess: () => {
        setText('');
        refresh();
      },
    });
  };

  const doTriage = (id: string, to: TriageTarget, message: string) => {
    setOpen(null);
    triage.mutate(
      { id, to },
      {
        onSuccess: () => {
          setGone((g) => new Set(g).add(id));
          setUndo({ message, id });
          refresh();
        },
      },
    );
  };

  const makeTask = (id: string, slug: string, milestoneId: string, title: string) => {
    setOpen(null);
    navigate(paths.newTask(slug, { milestoneId, title, inboxId: id }));
  };

  const onUndo = () => {
    const id = undo?.id;
    setUndo(null);
    if (!id) return;
    void undoStack.waitFor((e) => e.kind === 'triaged' && e.entityId === id).then((eventId) => {
      if (!eventId) return;
      revert.mutate(eventId, {
        onSuccess: () => {
          setGone((g) => {
            const n = new Set(g);
            n.delete(id);
            return n;
          });
          refresh();
        },
      });
    });
  };

  const selIndex = items.findIndex((i) => i.id === selId);
  const move = (d: number) => {
    if (items.length === 0) return;
    const next = selIndex < 0 ? (d > 0 ? 0 : items.length - 1) : Math.min(items.length - 1, Math.max(0, selIndex + d));
    setSelId(items[next]!.id);
  };
  const idle = () => open === null;
  useShortcut('arrowdown', () => move(1), { when: idle });
  useShortcut('arrowup', () => move(-1), { when: idle });
  useShortcut('t', () => selId && selIndex >= 0 && setOpen({ id: selId, kind: 'task' }), { when: () => idle() && selIndex >= 0 });
  useShortcut('d', () => selId && doTriage(selId, { as: 'dismiss' }, 'Dismissed'), { when: () => idle() && selIndex >= 0 });

  // Keep the selection on a real row after a row leaves.
  useEffect(() => {
    if (selId && selIndex < 0) setSelId(null);
  }, [selId, selIndex]);

  return (
    <section className="gp-inbox" aria-label="Inbox">
      <h1 className="gp-inbox__title">Inbox</h1>
      <Field value={text} onChange={setText} onEnter={submit} label="Capture" placeholder="Capture…" />
      {undo && (
        <div className="gp-inbox__undo">
          <Undo key={undo.id} message={undo.message} onUndo={onUndo} onExpire={() => setUndo(null)} />
        </div>
      )}
      {items.length === 0 && !inbox.isPending ? (
        <p className="gp-inbox__empty">Inbox is empty</p>
      ) : (
        <ul className="gp-inbox__list">
          {items.map((it) => (
            <li key={it.id} className={`gp-inbox__row${it.id === selId ? ' is-selected' : ''}${open?.id === it.id ? ' is-open' : ''}`} aria-current={it.id === selId || undefined}>
              <div className="gp-inbox__text">
                <span className="gp-inbox__body" dir="auto">
                  {it.text}
                </span>
                <span className="gp-inbox__meta">{fmtActorAt(it.by, it.at, now)}</span>
              </div>
              <div className="gp-inbox__actions">
                <div className="gp-inbox__anchor">
                  <Button variant="quiet" label="Make task" onClick={() => setOpen(open?.id === it.id && open.kind === 'task' ? null : { id: it.id, kind: 'task' })} />
                  {open?.id === it.id && open.kind === 'task' && (
                    <MilestoneMenu onPick={(slug, mid) => makeTask(it.id, slug, mid, it.text)} onClose={() => setOpen(null)} />
                  )}
                </div>
                <div className="gp-inbox__anchor">
                  <Button variant="quiet" label="Add as to-do" onClick={() => setOpen(open?.id === it.id && open.kind === 'todo' ? null : { id: it.id, kind: 'todo' })} />
                  {open?.id === it.id && open.kind === 'todo' && (
                    <TaskMenu onPick={(taskId) => doTriage(it.id, { as: 'todo', taskId }, 'Added as to-do')} onClose={() => setOpen(null)} />
                  )}
                </div>
                <Button variant="quiet" label="Dismiss" onClick={() => doTriage(it.id, { as: 'dismiss' }, 'Dismissed')} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
