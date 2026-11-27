import { useState, type ChangeEvent, type MouseEvent } from 'react';
import { useAddDependency, useArchive, useAttach, useDetach, useProject, useRemoveDependency, useReschedule, useRestore, useTask, useUpdateTask } from '../api/hooks';
import type { Executor, Priority, TaskDetail } from '../api/types';
import { useDraft } from '../lib/draft';
import { executorLabel, fmtLate, fmtTodos, statusLabel } from '../lib/format';
import { Button, Chip, Field, Icon, Segmented, Undo } from '../ui';
import { addDays, isDate, lengthDays } from './dates';
import { Links } from './Links';
import { useCloseTask } from './Pane';
import { ResumeBox } from './ResumeBox';
import { ReviewBar } from './ReviewBar';
import { Todos } from './Todos';
import './task-pane.css';

const EXECUTORS: { value: Executor; label: string }[] = [
  { value: 'manual', label: executorLabel('manual') },
  { value: 'ai', label: executorLabel('ai') },
  { value: 'together', label: executorLabel('together') },
];

/** Date text field: saves valid `YYYY-MM-DD` on blur/Enter; invalid shows the risk ring and sends nothing. */
function DateField({ label, value, onSave }: { label: string; value: string | null; onSave: (v: string) => boolean }) {
  const [rejected, setRejected] = useState(false);
  const d = useDraft(value ?? '', (v) => setRejected(!onSave(v.trim())));
  const bad = rejected || (d.value !== '' && !isDate(d.value.trim()) && d.value !== (value ?? ''));
  return (
    <input
      className={`gp-pane__input gp-pane__date num${bad ? ' is-invalid' : ''}`}
      aria-label={label}
      aria-invalid={bad || undefined}
      placeholder="YYYY-MM-DD"
      inputMode="numeric"
      value={d.value}
      onChange={(e) => {
        setRejected(false);
        d.set(e.target.value);
      }}
      {...d.bind}
    />
  );
}

function Stepper({ label, onStep, children }: { label: string; onStep: (dir: 1 | -1, e: MouseEvent) => void; children: React.ReactNode }) {
  return (
    <div className="gp-tp__row">
      <span className="gp-tp__key">{label}</span>
      <span className="gp-tp__val gp-tp__stepper">
        <Button variant="icon" icon="minus" label={`${label} -1 day`} onClick={(e) => onStep(-1, e)} />
        {children}
        <Button variant="icon" icon="plus" label={`${label} +1 day`} onClick={(e) => onStep(1, e)} />
      </span>
    </div>
  );
}

function reviewInfo(t: TaskDetail): { by: string; at: string } {
  const e = t.events.find((x) => x.kind === 'status_changed' && (x.after as { status?: string } | null)?.status === 'review');
  return { by: e?.actor ?? 'Agent', at: e?.at ?? t.updatedAt };
}

function TaskBody({ task, slug, onArchived }: { task: TaskDetail; slug: string; onArchived: () => void }) {
  const close = useCloseTask();
  const tree = useProject(slug).data;
  const update = useUpdateTask();
  const resched = useReschedule();
  const attach = useAttach();
  const detach = useDetach();
  const addDep = useAddDependency();
  const rmDep = useRemoveDependency();
  const archive = useArchive();
  const [link, setLink] = useState('');

  const title = useDraft(task.title, (v) => {
    if (v.trim()) update.mutate({ id: task.id, patch: { title: v.trim() } });
  });
  const desc = useDraft(task.description ?? '', (v) => update.mutate({ id: task.id, patch: { description: v.trim() ? v : null } }));

  const { start, end } = task;
  const shift = (which: 'both' | 'end', n: number) => {
    if (!start || !end) return;
    const s = which === 'end' ? start : addDays(start, n);
    const e = addDays(end, n);
    if (e < s) return;
    resched.mutate({ id: task.id, start: s, end: e });
  };
  const step = (dir: 1 | -1, e: MouseEvent) => shift(e.shiftKey ? 'end' : 'both', dir);
  const setDate = (which: 'start' | 'end') => (v: string): boolean => {
    if (!isDate(v)) return false;
    const s = which === 'start' ? v : (start ?? v);
    const e = which === 'end' ? v : (end ?? v);
    if (e < s) return false;
    resched.mutate({ id: task.id, start: s, end: e });
    return true;
  };

  const allTasks = tree?.milestones.flatMap((m) => m.tasks) ?? [];
  const taken = new Set(task.dependsOn.map((d) => d.id));
  const candidates = allTasks.filter((t) => t.id !== task.id && !taken.has(t.id));
  const todos = task.todos;
  const doneCount = todos.filter((t) => t.done).length;
  const pct = todos.length ? Math.round((doneCount / todos.length) * 100) : 0;
  const inReview = task.status === 'review';
  const review = inReview ? reviewInfo(task) : null;

  const addLink = () => {
    const url = link.trim();
    if (!url) return;
    attach.mutate({ taskId: task.id, role: 'context', url });
    setLink('');
  };

  return (
    <>
      <header className="gp-tp__top">
        <span className="gp-tp__milestone" dir="auto" title={task.milestone.name}>
          {task.milestone.name}
        </span>
        <Button variant="icon" icon="close" label="Close" onClick={close} />
      </header>
      <input className="gp-tp__title" dir="auto" aria-label="Title" value={title.value} onChange={(e) => title.set(e.target.value)} {...title.bind} />

      <div className="gp-tp__chips">
        <Chip tone={inReview ? 'review' : task.health === 'late' || task.health === 'conflict' ? 'risk' : task.health === 'done' ? 'ok' : 'neutral'}>{statusLabel(task.status)}</Chip>
        {task.health === 'late' && task.daysLate ? <Chip tone="risk">{fmtLate(task.daysLate)}</Chip> : null}
        <select
          className="gp-tp__select gp-tp__select--chip"
          aria-label="Priority"
          value={task.priority}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => update.mutate({ id: task.id, patch: { priority: e.target.value as Priority } })}
        >
          <option value="p1">P1</option>
          <option value="p2">P2</option>
          <option value="p3">P3</option>
        </select>
        <Segmented label="Executor" options={EXECUTORS} value={task.executor} onChange={(v) => update.mutate({ id: task.id, patch: { executor: v } })} />
        <button
          type="button"
          className={`gp-tp__star${task.important ? ' is-on' : ''}`}
          aria-label="Important"
          aria-pressed={task.important}
          onClick={() => update.mutate({ id: task.id, patch: { important: !task.important } })}
        >
          <Icon name="star" size={14} />
        </button>
      </div>

      {review && <ReviewBar taskId={task.id} by={review.by} at={review.at} />}
      <ResumeBox taskId={task.id} resume={task.resume} />

      <section className="gp-tp__sec" aria-label="Dates">
        <Stepper label="Start" onStep={step}>
          <DateField label="Start date" value={start} onSave={setDate('start')} />
        </Stepper>
        <Stepper label="End" onStep={(dir) => shift('end', dir)}>
          <DateField label="End date" value={end} onSave={setDate('end')} />
        </Stepper>
        <div className="gp-tp__row">
          <span className="gp-tp__key">Length</span>
          <span className="gp-tp__val num">{start && end ? `${lengthDays(start, end)} ${lengthDays(start, end) === 1 ? 'day' : 'days'}` : '—'}</span>
        </div>
        <div className="gp-tp__row">
          <span className="gp-tp__key">Area</span>
          <span className="gp-tp__val">
            <select
              className="gp-tp__select"
              aria-label="Area"
              value={task.area?.name ?? ''}
              onChange={(e) => update.mutate({ id: task.id, patch: { area: e.target.value || null } })}
            >
              <option value="">None</option>
              {(tree?.project.areas ?? []).map((a) => (
                <option key={a.id} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
          </span>
        </div>
        <div className="gp-tp__row gp-tp__row--top">
          <span className="gp-tp__key">After</span>
          <span className="gp-tp__val gp-tp__deps">
            {task.dependsOn.map((d) => (
              <span key={d.depId} className={`gp-tp__dep${d.bad ? ' is-bad' : ''}`}>
                <span className="gp-tp__dep-title" dir="auto" title={d.title}>
                  {d.title}
                </span>
                <button type="button" className="gp-links__x" aria-label={`Remove ${d.title}`} onClick={() => rmDep.mutate(d.depId)}>
                  <Icon name="close" size={11} />
                </button>
              </span>
            ))}
            <select
              className="gp-tp__select"
              aria-label="Add dependency"
              value=""
              onChange={(e) => e.target.value && addDep.mutate({ fromTaskId: task.id, taskId: e.target.value })}
            >
              <option value="">Add…</option>
              {candidates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </span>
        </div>
        {task.blocks.length > 0 && (
          <div className="gp-tp__row gp-tp__row--top">
            <span className="gp-tp__key">Blocks</span>
            <span className="gp-tp__val gp-tp__deps">
              {task.blocks.map((b) => (
                <span key={b.depId} className="gp-tp__dep-title" dir="auto">
                  {b.title}
                </span>
              ))}
            </span>
          </div>
        )}
      </section>

      <section className="gp-tp__sec" aria-label="Context">
        <h3 className="gp-tp__h">Context</h3>
        <textarea
          className="gp-pane__input gp-tp__desc"
          dir="auto"
          aria-label="Description"
          placeholder="Add a description…"
          rows={3}
          value={desc.value}
          onChange={(e) => desc.set(e.target.value)}
          onFocus={desc.bind.onFocus}
          onBlur={desc.bind.onBlur}
          onKeyDown={(e) => {
            if (e.key === 'Escape') desc.bind.onKeyDown(e);
          }}
        />
        <Links items={task.context} onRemove={(id) => detach.mutate(id)} />
        <Field label="Add link" placeholder="Add link…" value={link} onChange={setLink} onEnter={addLink} />
      </section>

      <section className="gp-tp__sec" aria-label="To-do">
        <h3 className="gp-tp__h">
          To-do <span className="gp-tp__count num">{fmtTodos(doneCount, todos.length)}</span>
        </h3>
        <div className="gp-tp__bar" role="progressbar" aria-label="To-do progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="gp-tp__bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <Todos taskId={task.id} todos={todos} tone={inReview ? 'review' : 'ok'} />
      </section>

      <section className="gp-tp__sec" aria-label="Deliverables">
        <h3 className="gp-tp__h">Deliverables</h3>
        {task.deliverables.length ? <Links items={task.deliverables} /> : <p className="gp-tp__empty">No deliverables</p>}
      </section>

      <footer className="gp-tp__foot">
        <Button variant="quiet" label="Archive" onClick={() => archive.mutate({ entity: 'task', id: task.id }, { onSuccess: onArchived })} />
      </footer>
    </>
  );
}

export function TaskPane({ taskId, slug }: { taskId: string; slug: string }) {
  const q = useTask(taskId);
  const restore = useRestore();
  const close = useCloseTask();
  const [archived, setArchived] = useState(false);

  return (
    <section className="gp-tp" aria-label="Task">
      {archived ? (
        <Undo
          message="Task archived"
          onUndo={() => restore.mutate({ entity: 'task', id: taskId }, { onSuccess: () => setArchived(false) })}
          onExpire={close}
        />
      ) : q.data ? (
        <TaskBody task={q.data} slug={slug} onArchived={() => setArchived(true)} />
      ) : q.isError ? (
        <>
          <header className="gp-tp__top">
            <span />
            <Button variant="icon" icon="close" label="Close" onClick={close} />
          </header>
          <p className="gp-tp__empty">Task not found</p>
        </>
      ) : null}
    </section>
  );
}
