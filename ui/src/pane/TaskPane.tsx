import { useState, type KeyboardEvent } from 'react';
import { useAddDependency, useArchive, useAttach, useDetach, useProject, useRemoveDependency, useReschedule, useRestore, useSettings, useTask, useUpdateTask } from '../api/hooks';
import type { TaskDetail } from '../api/types';
import { useDraft } from '../lib/draft';
import { fmtLate, statusLabel } from '../lib/format';
import { Button, Chip, DateField, Icon, Segmented, Select, Undo } from '../ui';
import { addDays, lengthDays } from './dates';
import { areaOptions, depItems, depTargets, DepChips, EXECUTORS, milestoneOptions, PRIORITIES, Row, TitleField, useAddNew } from './Details';
import { ExecutionLog } from './ExecutionLog';
import { AddLink, Links } from './Links';
import { useCloseTask } from './Pane';
import { ReviewBar } from './ReviewBar';
import { RichText } from './RichText';
import { Todos } from './Todos';
import './task-pane.css';

type Tab = 'details' | 'todos' | 'log';

function reviewInfo(t: TaskDetail): { by: string; at: string } {
  // Newest first: the event that put the task into review (a status change, or the task created in review).
  const e = t.events.find((x) => (x.after as { status?: string } | null)?.status === 'review');
  return { by: e?.actor ?? 'Agent', at: e?.at ?? t.updatedAt };
}

function Tabs({ tab, onTab, todos, log }: { tab: Tab; onTab: (t: Tab) => void; todos: string; log: number }) {
  const tabs: { id: Tab; label: string; count?: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'todos', label: 'To-dos', count: todos },
    { id: 'log', label: 'Execution log', count: log ? String(log) : '' },
  ];
  const move = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = tabs[(i + d + tabs.length) % tabs.length]!;
    onTab(next.id);
    document.getElementById(`gp-tp-tab-${next.id}`)?.focus();
  };
  return (
    <div className="gp-tp__tabs" role="tablist" aria-label="Task sections">
      {tabs.map((t, i) => (
        <button
          key={t.id}
          id={`gp-tp-tab-${t.id}`}
          type="button"
          role="tab"
          className="gp-tp__tab"
          aria-selected={tab === t.id}
          aria-controls={`gp-tp-panel-${t.id}`}
          tabIndex={tab === t.id ? 0 : -1}
          onClick={() => onTab(t.id)}
          onKeyDown={(e) => move(e, i)}
        >
          {t.label}
          {t.count ? <span className="gp-tp__tab-count num">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
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
  const addNew = useAddNew(slug, tree);
  const [tab, setTab] = useState<Tab>('details');

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

  // Depends on: other tasks of the project and milestones being done (never this task's own milestone: a loop).
  const taken = new Set(task.dependsOn.map((d) => d.id));
  const blockedBy = new Set(task.blocks.map((b) => b.id));
  const targets = depTargets(tree, { taskId: task.id, milestoneId: task.milestone.id }, taken).filter((t) => !blockedBy.has(t.id));
  const depends = task.dependsOn.map((d) => ({ key: d.depId, kind: d.kind, id: d.id, title: d.title, bad: d.bad, color: tree?.milestones.find((m) => m.id === d.id || m.tasks.some((t) => t.id === d.id))?.color }));
  // Blocks: tasks that wait for this one. Editable here too: removing deletes their dependency, "+" adds one.
  const blockTargets = depTargets(tree, { taskId: task.id, milestoneId: task.milestone.id }, blockedBy).filter((t) => t.kind === 'task' && !taken.has(t.id));
  const blocks = task.blocks.map((b) => ({ key: b.depId, kind: b.kind, id: b.id, title: b.title, bad: b.bad, color: tree?.milestones.find((m) => m.id === b.id || m.tasks.some((t) => t.id === b.id))?.color }));
  const showDeps = depends.length > 0 || targets.length > 0;
  const showBlocks = blocks.length > 0; // empty: added from the other task's Depends on

  const todos = task.todos;
  const doneCount = todos.filter((t) => t.done).length;
  const pct = todos.length ? Math.round((doneCount / todos.length) * 100) : 0;
  const inReview = task.status === 'review';
  const review = inReview ? reviewInfo(task) : null;
  const weekStart = settings.data?.week_start === 'sun' ? 'sun' : 'mon';
  const tone = inReview ? 'review' : task.health === 'late' || task.health === 'conflict' ? 'risk' : task.health === 'done' ? 'ok' : 'neutral';

  return (
    <>
      <header className="gp-tp__top">
        <div className="gp-tp__status">
          <Chip tone={tone} dot>
            {statusLabel(task.status)}
          </Chip>
          {task.health === 'late' && task.daysLate ? <Chip tone="risk">{fmtLate(task.daysLate)}</Chip> : null}
        </div>
        <div className="gp-tp__top-actions">
          <button
            type="button"
            className={`gp-tp__star${task.important ? ' is-on' : ''}`}
            aria-label="Important"
            title={task.important ? 'Important' : 'Mark as important'}
            aria-pressed={task.important}
            onClick={() => update.mutate({ id: task.id, patch: { important: !task.important } })}
          >
            <Icon name="star" size={16} />
          </button>
          <Button variant="icon" icon="close" label="Close" onClick={close} />
        </div>
      </header>
      <TitleField
        value={title.value}
        onChange={title.set}
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

      {review && <ReviewBar taskId={task.id} by={review.by} at={review.at} />}

      <Tabs tab={tab} onTab={setTab} todos={todos.length ? `${doneCount}/${todos.length}` : ''} log={task.log.length} />

      {tab === 'details' && (
        <div className="gp-tp__panel" role="tabpanel" id="gp-tp-panel-details" aria-labelledby="gp-tp-tab-details">
          <section className="gp-tp__grid" aria-label="Attributes">
            <Row label="Milestone">
              <Select
                label="Milestone"
                value={task.milestone.id}
                onChange={(v) => v !== task.milestone.id && update.mutate({ id: task.id, patch: { milestoneId: v } })}
                options={milestoneOptions(tree)}
                onAdd={addNew.milestone}
                addPlaceholder="New milestone name"
              />
            </Row>
            <Row label="Area">
              <Select
                label="Area"
                value={task.area?.name ?? ''}
                onChange={(v) => v !== (task.area?.name ?? '') && update.mutate({ id: task.id, patch: { area: v || null } })}
                options={areaOptions(tree?.project.areas ?? [])}
                onAdd={addNew.area}
                addPlaceholder="New area name"
              />
            </Row>
            <Row label="Start">
              <DateField label="Start" value={start ?? ''} onChange={setStart} weekStart={weekStart} />
            </Row>
            <Row label="End">
              <DateField label="End" value={end ?? ''} onChange={setEnd} min={start ?? undefined} weekStart={weekStart} />
            </Row>
            <Row label="Priority">
              <Segmented label="Priority" options={PRIORITIES} value={task.priority} onChange={(p) => update.mutate({ id: task.id, patch: { priority: p } })} />
            </Row>
            <Row label="Done by">
              <Segmented label="Done by" options={EXECUTORS} value={task.executor} onChange={(x) => update.mutate({ id: task.id, patch: { executor: x } })} />
            </Row>
            {showDeps && (
              <Row label="Depends on" top>
                <DepChips
                  deps={depends}
                  onRemove={(k) => rmDep.mutate(k)}
                  addLabel="Add dependency"
                  items={depItems(targets, (t) => addDep.mutate(t.kind === 'task' ? { fromTaskId: task.id, taskId: t.id } : { fromTaskId: task.id, milestoneId: t.id }))}
                />
              </Row>
            )}
            {showBlocks && (
              <Row label="Blocks" top>
                <DepChips
                  deps={blocks}
                  onRemove={(k) => rmDep.mutate(k)}
                  addLabel="Add a task this blocks"
                  items={depItems(blockTargets, (t) => addDep.mutate({ fromTaskId: t.id, taskId: task.id }))}
                />
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

          <section className="gp-tp__sec" aria-label="Deliverables">
            <div className="gp-tp__hrow">
              <h3 className="gp-tp__h">Deliverables</h3>
              <span className="gp-tp__count num">{task.deliverables.length || ''}</span>
            </div>
            {task.deliverables.length ? <Links items={task.deliverables} /> : <p className="gp-tp__empty">Commits, pull requests and files land here when the work ships.</p>}
          </section>

          <footer className="gp-tp__foot">
            <Button variant="quiet" icon="archive" label="Archive task" onClick={() => archive.mutate({ entity: 'task', id: task.id }, { onSuccess: onArchived })} />
          </footer>
        </div>
      )}

      {tab === 'todos' && (
        <div className="gp-tp__panel" role="tabpanel" id="gp-tp-panel-todos" aria-labelledby="gp-tp-tab-todos">
          <section className="gp-tp__sec" aria-label="To-do">
            {todos.length > 0 && (
              <div className="gp-tp__progress">
                <div className="gp-tp__bar" role="progressbar" aria-label="To-do progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                  <div className={`gp-tp__bar-fill${inReview ? ' is-review' : ''}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="gp-tp__count num">{`${doneCount} / ${todos.length}`}</span>
              </div>
            )}
            <Todos taskId={task.id} todos={todos} tone={inReview ? 'review' : 'ok'} />
          </section>
        </div>
      )}

      {tab === 'log' && (
        <div className="gp-tp__panel" role="tabpanel" id="gp-tp-panel-log" aria-labelledby="gp-tp-tab-log">
          <ExecutionLog taskId={task.id} log={task.log} />
        </div>
      )}
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
