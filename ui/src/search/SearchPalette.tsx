import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { useSearch } from '../api/hooks';
import type { SearchHit } from '../api/types';
import { paths } from '../app/routes';
import { usePaneNav } from '../pane/Pane';
import { Field } from '../ui';
import '../ui/primitives.css';
import './search.css';

const GROUPS: { type: SearchHit['type']; label: string }[] = [
  { type: 'project', label: 'Projects' },
  { type: 'milestone', label: 'Milestones' },
  { type: 'task', label: 'Tasks' },
  { type: 'todo', label: 'To-dos' },
  { type: 'attachment', label: 'Links' },
  { type: 'inbox', label: 'Inbox' },
];
const DEBOUNCE_MS = 120;

export function SearchPalette({ onClose }: { onClose(): void }) {
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [active, setActive] = useState(0);
  const [, navigate] = useLocation();
  const { openTask } = usePaneNav();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const result = useSearch(dq);
  const settled = dq !== '' && dq === q.trim() && result.data !== undefined;
  const groups = useMemo(
    () => (settled ? GROUPS.map((g) => ({ ...g, hits: result.data!.filter((h) => h.type === g.type) })).filter((g) => g.hits.length > 0) : []),
    [settled, result.data],
  );
  const flat = useMemo(() => groups.flatMap((g) => g.hits), [groups]);

  useEffect(() => setActive(0), [dq]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [active, flat]);

  const open = (hit: SearchHit) => {
    onClose();
    if (hit.type === 'inbox') navigate(paths.inbox);
    else if (hit.type === 'task') openTask(hit.project, hit.id);
    // The engine gives no task id for to-dos and links, and no way to scroll to a milestone: open the project.
    else navigate(paths.project(hit.project, 'list'));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length);
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      const hit = flat[active];
      if (hit) {
        e.preventDefault();
        open(hit);
      }
    }
  };

  let index = -1;
  return createPortal(
    <div className="gp-scrim gp-search__scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gp-search" role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKeyDown}>
        <Field label="Search" value={q} onChange={setQ} placeholder="Search…" autoFocus />
        {settled && (
          <div className="gp-search__list" ref={listRef} role="listbox" aria-label="Results">
            {groups.length === 0 && (
              <p className="gp-search__empty" dir="auto">
                {`No matches for "${dq}"`}
              </p>
            )}
            {groups.map((g) => (
              <div key={g.type} role="group" aria-label={g.label}>
                <h2 className="gp-search__group">{g.label}</h2>
                {g.hits.map((h) => {
                  const i = ++index;
                  return (
                    <div
                      key={`${h.type}:${h.id}`}
                      role="option"
                      aria-selected={i === active}
                      className={`gp-search__hit${i === active ? ' is-active' : ''}`}
                      onMouseMove={() => i !== active && setActive(i)}
                      onClick={() => open(h)}
                    >
                      <span className="gp-search__title" dir="auto" title={h.title}>
                        {h.title}
                      </span>
                      <span className="gp-search__meta" dir="auto" title={h.path}>
                        {h.path}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
