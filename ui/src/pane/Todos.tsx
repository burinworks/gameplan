import { useEffect, useState } from 'react';
import { useAddTodos, usePatchTodo, useReorder } from '../api/hooks';
import type { TreeTodo } from '../api/types';
import { Checkbox, Field } from '../ui';

export function Todos({ taskId, todos, tone = 'ok' }: { taskId: string; todos: TreeTodo[]; tone?: 'ok' | 'review' }) {
  const patch = usePatchTodo();
  const add = useAddTodos();
  const reorder = useReorder();
  const key = todos.map((t) => t.id).join(',');
  const [order, setOrder] = useState<string[]>(() => todos.map((t) => t.id));
  const [drag, setDrag] = useState<string | null>(null);
  const [text, setText] = useState('');
  useEffect(() => setOrder(todos.map((t) => t.id)), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = new Map(todos.map((t) => [t.id, t]));
  const rows = order.map((id) => byId.get(id)).filter((t): t is TreeTodo => !!t);

  const addOne = () => {
    const title = text.trim();
    if (!title) return;
    add.mutate({ taskId, todos: [{ title }] }, { onSuccess: () => setText('') });
  };
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
    <div className="gp-todos">
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
      </ul>
      <Field label="Add to-do" placeholder="Add to-do…" value={text} onChange={setText} onEnter={addOne} />
    </div>
  );
}
