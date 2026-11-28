import { useEffect, useRef, useState } from 'react';
import { useAddTodos, usePatchTodo, useReorder } from '../api/hooks';
import type { TreeTodo } from '../api/types';
import { Checkbox } from '../ui';

/** The last row of both lists: a dashed box and a borderless input. Enter adds and keeps the focus here. */
function AddRow({ onAdd, inputRef }: { onAdd: (title: string) => void; inputRef?: React.Ref<HTMLInputElement> }) {
  const [text, setText] = useState('');
  return (
    <li className="gp-todo gp-todo--add">
      <span className="gp-todo__box is-dashed" aria-hidden="true" />
      <input
        ref={inputRef}
        className="gp-todo__input"
        dir="auto"
        aria-label="Add a to-do"
        placeholder="Add a to-do"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
          const title = text.trim();
          if (!title) return;
          e.preventDefault();
          e.stopPropagation(); // not a "create" shortcut
          setText('');
          onAdd(title);
        }}
      />
    </li>
  );
}

export function Todos({ taskId, todos, tone = 'ok' }: { taskId: string; todos: TreeTodo[]; tone?: 'ok' | 'review' }) {
  const patch = usePatchTodo();
  const add = useAddTodos();
  const reorder = useReorder();
  const key = todos.map((t) => t.id).join(',');
  const [order, setOrder] = useState<string[]>(() => todos.map((t) => t.id));
  const [drag, setDrag] = useState<string | null>(null);
  useEffect(() => setOrder(todos.map((t) => t.id)), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = new Map(todos.map((t) => [t.id, t]));
  const rows = order.map((id) => byId.get(id)).filter((t): t is TreeTodo => !!t);

  const over = (id: string) => {
    if (!drag || drag === id) return;
    const next = order.filter((x) => x !== drag);
    next.splice(next.indexOf(id), 0, drag);
    setOrder(next);
  };
  const drop = () => {
    if (drag && order.join(',') !== key) reorder.mutate({ entity: 'todo', ids: order });
    setDrag(null);
  };

  return (
    <ul className="gp-todos__list">
      {rows.map((t) => (
        <li
          key={t.id}
          className={`gp-todo is-${t.state}${drag === t.id ? ' is-dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            over(t.id);
          }}
          onDrop={drop}
        >
          <span className="gp-todo__grip" role="img" aria-label={`Reorder ${t.title}`} draggable onDragStart={() => setDrag(t.id)} onDragEnd={drop}>
            ⋮⋮
          </span>
          <Checkbox label={t.title} checked={t.done} state={t.state} tone={tone} onChange={(v) => patch.mutate({ id: t.id, patch: { done: v } })} />
          <span className="gp-todo__title" dir="auto">
            {t.title}
          </span>
        </li>
      ))}
      <AddRow onAdd={(title) => add.mutate({ taskId, todos: [{ title }] })} />
    </ul>
  );
}

/** To-dos of a task that doesn't exist yet: one-line inputs. Enter adds a row, Backspace on an empty row removes it. */
export function DraftTodos({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  const list = useRef<HTMLUListElement>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const focusRow = (i: number) => {
    const rows = list.current?.querySelectorAll<HTMLInputElement>('input.gp-todo__input[data-row]');
    (rows?.[i] ?? addInput.current)?.focus();
  };
  return (
    <ul className="gp-todos__list" ref={list}>
      {items.map((t, i) => (
        <li key={i} className="gp-todo">
          <span className="gp-todo__box" aria-hidden="true" />
          <input
            className="gp-todo__input"
            data-row={i}
            dir="auto"
            aria-label={`To-do ${i + 1}`}
            value={t}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.stopPropagation();
                addInput.current?.focus();
              } else if (e.key === 'Backspace' && t === '') {
                e.preventDefault();
                onChange(items.filter((_, j) => j !== i));
                setTimeout(() => focusRow(i - 1), 0);
              }
            }}
          />
        </li>
      ))}
      <AddRow inputRef={addInput} onAdd={(title) => onChange([...items, title])} />
    </ul>
  );
}
