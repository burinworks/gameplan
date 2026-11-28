import { useEffect, useRef, useState } from 'react';
import { useAddLog, useDeleteLog, useEditLog } from '../api/hooks';
import type { TreeLogEntry } from '../api/types';
import { fmtActorAt } from '../lib/format';
import { Menu, Undo } from '../ui';
import { Icon } from '../ui/Icon';

export const LOG_MAX = 2000;
/** "You · 7m" reads as "You · 7m ago". */
const withAgo = (s: string) => (/\d+[mhd]$/.test(s) ? `${s} ago` : s);
export const LOG_PLACEHOLDER = 'What did you do / where did you stop…';

/** Grows a textarea to its content. */
const fit = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

/** A multi-line text box: Enter submits, Shift+Enter breaks the line. With onCancel (editing): Escape cancels, leaving saves. */
function LogInput({ initial = '', label, placeholder, onSubmit, onCancel, autoFocus }: { initial?: string; label: string; placeholder?: string; onSubmit: (text: string) => void; onCancel?: () => void; autoFocus?: boolean }) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  useEffect(() => {
    fit(ref.current);
  }, [text]);
  useEffect(() => {
    if (!autoFocus) return;
    const el = ref.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [autoFocus]);
  return (
    <textarea
      ref={ref}
      className="gp-pane__input gp-log__input"
      dir="auto"
      rows={1}
      aria-label={label}
      placeholder={placeholder}
      maxLength={LOG_MAX}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (!onCancel || done.current) return;
        done.current = true;
        const t = text.trim();
        if (t) onSubmit(t);
        else onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          e.stopPropagation();
          const t = text.trim();
          if (!t || done.current) return;
          if (onCancel) done.current = true;
          onSubmit(t);
          if (!onCancel) setText('');
        } else if (e.key === 'Escape' && onCancel) {
          e.preventDefault();
          e.stopPropagation();
          done.current = true;
          onCancel();
        }
      }}
    />
  );
}

/**
 * The execution log tab: an input on top (Enter adds an entry), then the entries newest first. Each entry has a
 * "…" menu: Edit (inline, Enter saves) and Delete (an Undo line for a few seconds; the entry is deleted when it expires).
 */
export function ExecutionLog({ taskId, log }: { taskId: string; log: TreeLogEntry[] }) {
  const add = useAddLog();
  const edit = useEditLog();
  const del = useDeleteLog();
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const pendingRef = useRef<string[]>([]);
  pendingRef.current = pending;
  const delRef = useRef(del.mutate);
  delRef.current = del.mutate;
  // Closing the pane while an Undo is showing still deletes.
  useEffect(() => () => pendingRef.current.forEach((id) => delRef.current(id)), []);

  const now = new Date();
  return (
    <div className="gp-log">
      <LogInput label="Add to the execution log" placeholder={LOG_PLACEHOLDER} onSubmit={(text) => add.mutate({ taskId, text })} />
      {log.length === 0 ? (
        <p className="gp-tp__empty gp-log__empty">Nothing logged yet. Note what you did and where you stopped, so you (or an agent) can pick it up later.</p>
      ) : (
        <ol className="gp-log__list">
          {log.map((e, i) =>
            pending.includes(e.id) ? (
              <li key={e.id} className="gp-log__entry is-undo">
                <Undo
                  message="Entry deleted"
                  onUndo={() => setPending((p) => p.filter((x) => x !== e.id))}
                  onExpire={() => {
                    setPending((p) => p.filter((x) => x !== e.id));
                    del.mutate(e.id);
                  }}
                />
              </li>
            ) : (
              <li key={e.id} className={`gp-log__entry${i === 0 ? ' is-latest' : ''}`}>
                <span className="gp-log__dot" aria-hidden="true" />
                <div className="gp-log__body">
                  {editing === e.id ? (
                    <LogInput
                      initial={e.text}
                      label="Edit entry"
                      autoFocus
                      onSubmit={(text) => {
                        setEditing(null);
                        if (text !== e.text) edit.mutate({ id: e.id, text });
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <p className="gp-log__text" dir="auto">
                      {e.text}
                    </p>
                  )}
                  <span className="gp-log__meta">
                    {withAgo(fmtActorAt(e.by, e.at, now))}
                    {e.editedAt ? ' · edited' : ''}
                  </span>
                </div>
                <span className="gp-log__more">
                  <Menu
                    label="Entry actions"
                    triggerClassName="gp-log__menu"
                    trigger={<Icon name="more" size={14} />}
                    items={[
                      { label: 'Edit', onSelect: () => setEditing(e.id) },
                      { label: 'Delete', danger: true, onSelect: () => setPending((p) => [...p, e.id]) },
                    ]}
                  />
                </span>
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}
