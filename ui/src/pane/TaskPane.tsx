import { useState } from 'react';
import { useAddDependency, useArchive, useAttach, useDetach, useProject, useRemoveDependency, useReschedule, useRestore, useSettings, useTask, useUpdateTask } from '../api/hooks';
import type { Executor, Priority, TaskDetail } from '../api/types';
import { useDraft } from '../lib/draft';
import { executorLabel, fmtLate, statusLabel } from '../lib/format';
import { Button, Chip, DateField, Icon, Menu, Select, Undo } from '../ui';
import { addDays, lengthDays } from './dates';
import { AfterRow, areaOptions, Row } from './Details';
import { AddLink, Links } from './Links';
import { useCloseTask } from './Pane';
import { ResumeBox } from './ResumeBox';
import { ReviewBar } from './ReviewBar';
import { RichText } from './RichText';
import { Todos } from './Todos';
import './task-pane.css';

const PRIORITIES: Priority[] = ['p1', 'p2', 'p3'];
const EXECUTORS: { value: Executor; label: string }[] = [
  { value: 'manual', label: executorLabel('manual') },
  { value: 'ai', label: executorLabel('ai') },
  { value: 'together', label: executorLabel('together') },
];

function reviewInfo(t: TaskDetail): { by: string; at: string } {
  // Newest first: the event that put the task into review (a status change, or the task created in review).
  const e = t.events.find((x) => (x.after as { status?: string } | null)?.status === 'review');
  return { by: e?.actor ?? 'Agent', at: e?.at ?? t.updatedAt };
}

function TaskBody({ task, slug, onArchived }: { task: TaskDetail; slug: string; onArchived: () => void }) {
  const close = useCloseTask();
  const tree = useProject(slug).data;
  const settings = useSettings();
  const update = useUpdateTask();
  const resched = useReschedule();
  const attach = useAttach();
  const detach = useDetach();
  const addDep = useAddDependency();
  const rmDep = useRemoveDependency();
  const archive = useArchive();

  const title = useDraft(task.title, (v) => (v.trim() ? update.mutateAsync({ id: task.id, patch: { title: v.trim() } }) : undefined));
  const desc = useDraft(task.description ?? '', (v) => update.mutateAsync({ id: task.id, patch: { description: v.trim() ? v : null } }));

  const { start, end } = task;
  // Moving the start moves the whole task (the length is kept); the end only changes the length.
  const setStart = (v: string) => {
    if (v === start) return;
    const e = start && end ? addDays(v, lengthDays(start, end) - 1) : (end ?? v);
    resched.mutate({ id: task.id, start: v, end: e });
  };
  const setEnd = (v: string) => {
    const s = start ?? v;
    if (v < s || v === end) return;
    resched.mutate({ id: task.id, start: s, end: v });
  };

  const allTasks = tree?.milestones.flatMap((m) => m.tasks) ?? [];
  const taken = new Set(task.dependsOn.map((d) => d.id));
  const candidates = allTasks.filter((t) => t.id !== task.id && !taken.has(t.id));
  const todos = task.todos;
  const doneCount = todos.filter((t) => t.done).length;
  const pct = todos.length ? Math.round((doneCount / todos.length) * 100) : 0;
  const inReview = task.status === 'review';
  const review = inReview ? reviewInfo(task) : null;
  const weekStart = settings.data?.week_start === 'sun' ? 'sun' : 'mon';
  const days = start && end ? lengthDays(start, end) : 0;

  return (
    <>
      <header className="gp-tp__top">
        <span className="gp-tp__milestone" dir="auto" title={task.milestone.name}>
          {task.milestone.name}
        </span>
        <Button variant="icon" icon="close" label="Close" onClick={close} />
      </header>
      <textarea
        className="gp-tp__title"
        dir="auto"
        aria-label="Title"
        rows={1}
        value={title.value}
        ref={(el) => {
          if (el) {
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
          }
        }}
        onChange={(e) => title.set(e.target.value.replace(/[\r\n]+/g, ' '))}
        onFocus={title.bind.onFocus}
        onBlur={title.bind.onBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (!e.shiftKey) {
              title.bind.onKeyDown(e);
              (e.target as HTMLTextAreaElement).blur();
            }
          } else if (e.key === 'Escape') title.bind.onKeyDown(e);
        }}
      />

      <div className="gp-tp__chips">
        <Chip tone={inReview ? 'review' : task.health === 'late' || task.health === 'conflict' ? 'risk' : task.health === 'done' ? 'ok' : 'neutral'}>{statusLabel(task.status)}</Chip>
        {task.health === 'late' && task.daysLate ? <Chip tone="risk">{fmtLate(task.daysLate)}</Chip> : null}
        <Menu
          label={`Priority: ${task.priority.toUpperCase()}`}
          align="start"
          triggerClassName="gp-tp__chip"
          trigger={task.priority.toUpperCase()}
          items={PRIORITIES.map((p) => ({ label: p.toUpperCase(), checked: p === task.priority, onSelect: () => update.mutate({ id: task.id, patch: { priority: p } }) }))}
        />
        <Menu
          label={`Done by: ${executorLabel(task.executor)}`}
          align="start"
          triggerClassName="gp-tp__chip"
          trigger={executorLabel(task.executor)}
          items={EXECUTORS.map((x) => ({ label: x.label, checked: x.value === task.executor, onSelect: () => update.mutate({ id: task.id, patch: { executor: x.value } }) }))}
        />
        <button
          type="button"
          className={`gp-tp__chip gp-tp__chip--star${task.important ? ' is-on' : ''}`}
          aria-label="Important"
          aria-pressed={task.important}
          onClick={() => update.mutate({ id: task.id, patch: { important: !task.important } })}
        >
          <Icon name="star" size={11} />
          Important
        </button>
      </div>

      {review && <ReviewBar taskId={task.id} by={review.by} at={review.at} />}
      <ResumeBox taskId={task.id} resume={task.resume} />

      <section className="gp-tp__grid" aria-label="Dates">
        <Row label="Start">
          <DateField label="Start" value={start ?? ''} onChange={setStart} weekStart={weekStart} />
        </Row>
        <Row label="End">
          <DateField label="End" value={end ?? ''} onChange={setEnd} min={start ?? undefined} weekStart={weekStart} />
        </Row>
        <Row label="Length">
          <span className="num">{days ? `${days} ${days === 1 ? 'day' : 'days'}` : '—'}</span>
        </Row>
        <Row label="Area">
          <Select label="Area" value={task.area?.name ?? ''} onChange={(v) => update.mutate({ id: task.id, patch: { area: v || null } })} options={areaOptions(tree?.project.areas ?? [])} />
        </Row>
        <Row label="After" top>
          <AfterRow
            deps={task.dependsOn.map((d) => ({ key: d.depId, title: d.title, bad: d.bad }))}
            onRemove={(k) => rmDep.mutate(k)}
            candidates={candidates}
            onAdd={(id) => addDep.mutate({ fromTaskId: task.id, taskId: id })}
          />
        </Row>
        {task.blocks.length > 0 && (
          <Row label="Blocks" top>
            <div className="gp-tp__deps gp-tp__deps--col">
              {task.blocks.map((b) => (
                <span key={b.depId} className="gp-tp__dep-title" dir="auto">
                  {b.title}
                </span>
              ))}
            </div>
          </Row>
        )}
      </section>

      <section className="gp-tp__sec" aria-label="Context">
        <h3 className="gp-tp__h">Context</h3>
        <RichText label="Description" placeholder="What is this about? Links, notes, constraints…" value={desc.value} onChange={desc.set} onFocus={desc.bind.onFocus} onBlur={desc.bind.onBlur} onKeyDown={(e) => e.key === 'Escape' && desc.bind.onKeyDown(e)} />
        <div className="gp-tp__links">
          <Links items={task.context} onRemove={(id) => detach.mutate(id)} variant="chips" />
          <AddLink onAdd={(url) => attach.mutate({ taskId: task.id, role: 'context', url })} />
        </div>
      </section>

      <section className="gp-tp__sec" aria-label="To-do">
        <div className="gp-tp__hrow">
          <h3 className="gp-tp__h">To-do</h3>
          <span className="gp-tp__count num">{todos.length ? `${doneCount} / ${todos.length}` : ''}</span>
        </div>
        <div className="gp-tp__bar" role="progressbar" aria-label="To-do progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="gp-tp__bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <Todos taskId={task.id} todos={todos} tone={inReview ? 'review' : 'ok'} />
      </section>

      <section className="gp-tp__sec" aria-label="Deliverables">
        <div className="gp-tp__hrow">
          <h3 className="gp-tp__h">Deliverables</h3>
          <span className="gp-tp__count num">{task.deliverables.length || ''}</span>
        </div>
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
