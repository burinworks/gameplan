import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useAddDependency, useCreateTask, useProject, useSettings, useTriage, type CreateTaskBody } from '../api/hooks';
import type { Executor, Priority, ProjectTree } from '../api/types';
import { isTab, paths } from '../app/routes';
import { today } from '../app/today';
import { Button, DateField, Segmented, Select } from '../ui';
import { addDays, lengthDays } from './dates';
import { MilestonePopover } from './MilestonePopover';
import { areaOptions, depItems, depTargets, DepChips, EXECUTORS, milestoneOptions, PRIORITIES, Row, TitleField, useAddNew, type DepTarget } from './Details';
import { setDraftBar } from './draftBar';
import { AddLink, DraftLinks } from './Links';
import { useCloseTask } from './Pane';
import { RichText } from './RichText';
import { DraftTodos } from './Todos';
import './task-pane.css';

/** Shown instead of the form when the project has no milestone yet: a task always belongs to one. */
function MilestoneFirst({ slug, tree, onCreated }: { slug: string; tree: ProjectTree | undefined; onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLDivElement>(null);
  return (
    <section className="gp-tp__first" aria-label="Create a milestone first">
      <div className="gp-tp__first-head">
        <span className="gp-tp__first-dia" aria-hidden="true" />
        <div>
          <h3 className="gp-tp__h">Create a milestone first</h3>
          <p className="gp-tp__first-text">Every task belongs to a milestone. Name the first one and pick its due date, then add the task.</p>
        </div>
      </div>
      <div className="gp-tp__first-actions" ref={btn}>
        <Button variant="primary" label="New milestone…" onClick={() => setOpen(true)} />
      </div>
      {open && btn.current && (
        <MilestonePopover
          slug={slug}
          tree={tree}
          anchor={btn.current}
          onClose={() => setOpen(false)}
          onCreated={(id) => {
            setOpen(false);
            onCreated(id);
          }}
        />
      )}
    </section>
  );
}

export function NewTask({ slug, milestoneId, title: initialTitle, inboxId }: { slug: string; milestoneId?: string; title?: string; inboxId?: string }) {
  const tree = useProject(slug).data;
  const close = useCloseTask();
  const [loc, navigate] = useLocation();
  const create = useCreateTask();
  const addDep = useAddDependency();
  const busy = useRef(false); // set synchronously: mutation state lags a keypress behind
  const triage = useTriage();
  const addNew = useAddNew(slug, tree);

  const [title, setTitle] = useState(initialTitle ?? '');
  const [milestone, setMilestone] = useState<string | null>(milestoneId ?? null);
  const [area, setArea] = useState('');
  const [start, setStart] = useState(() => addDays(today(), 1)); // never empty: tomorrow, one day long
  const [end, setEnd] = useState(() => addDays(today(), 1));
  const [priority, setPriority] = useState<Priority | null>(null);
  const [executor, setExecutor] = useState<Executor | null>(null);
  const [deps, setDeps] = useState<DepTarget[]>([]);
  const [description, setDescription] = useState('');
  const [todos, setTodos] = useState<string[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const settings = useSettings();

  const ms = milestone ?? tree?.milestones[0]?.id ?? '';
  const valid = title.trim() !== '' && ms !== '' && end >= start;
  // Moving the start moves the whole task: the length is kept.
  const moveStart = (v: string) => {
    setEnd(addDays(v, lengthDays(start, end) - 1));
    setStart(v);
  };

  // The timeline shows a draft bar for the dates being chosen.
  const noMilestone = !!tree && tree.milestones.length === 0 && !milestone;
  useEffect(() => {
    setDraftBar(noMilestone ? null : { start, end, milestoneId: ms || undefined });
  }, [start, end, ms, noMilestone]);
  useEffect(() => () => setDraftBar(null), []);

  const weekStart = settings.data?.week_start === 'sun' ? 'sun' : 'mon';
  // A milestone dependency on the task's own milestone would be a loop.
  const chosen = deps.filter((d) => !(d.kind === 'milestone' && d.id === ms));
  const targets = depTargets(tree, { milestoneId: ms }, new Set(chosen.map((d) => d.id)));
  const showDeps = chosen.length > 0 || targets.length > 0;

  const submit = () => {
    if (!valid || busy.current) return;
    busy.current = true;
    const release = { onSettled: () => void (busy.current = false) };
    const body: CreateTaskBody = { title: title.trim(), start, end };
    if (area) body.area = area;
    if (description.trim()) body.description = description;
    if (priority) body.priority = priority;
    if (executor) body.executor = executor;
    const items = todos.map((l) => l.trim()).filter(Boolean).map((t) => ({ title: t }));
    if (items.length) body.todos = items;
    const taskDeps = chosen.filter((d) => d.kind === 'task').map((d) => d.id);
    const msDeps = chosen.filter((d) => d.kind === 'milestone').map((d) => d.id);
    if (taskDeps.length) body.after = taskDeps;
    if (links.length) body.links = links.map((url) => ({ url }));
    const tab = loc.split('/')[3];
    const open = (id: string) => {
      for (const m of msDeps) addDep.mutate({ fromTaskId: id, milestoneId: m });
      navigate(paths.task(slug, id, isTab(tab) ? tab : 'timeline'), { replace: true });
    };
    if (inboxId) triage.mutate({ id: inboxId, to: { as: 'task', milestoneId: ms, task: body } }, { ...release, onSuccess: (r) => r.created && open(r.created.id) });
    else create.mutate({ milestoneId: ms, body }, { ...release, onSuccess: (t) => open(t.id) });
  };

  return (
    <section
      className="gp-tp gp-tp--form"
      aria-label="New task"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.defaultPrevented) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <header className="gp-tp__top">
        <h2 className="gp-tp__h2">New task</h2>
        <Button variant="icon" icon="close" label="Close" onClick={close} />
      </header>

      {noMilestone ? (
        <MilestoneFirst slug={slug} tree={tree} onCreated={setMilestone} />
      ) : (
        <>
          <TitleField
            value={title}
            autoFocus
            onChange={setTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
          />

          <section className="gp-tp__grid" aria-label="Details">
            <Row label="Milestone">
              <Select label="Milestone" value={ms} onChange={setMilestone} options={milestoneOptions(tree)} addPopover={({ anchor, close, select }) => <MilestonePopover slug={slug} tree={tree} anchor={anchor} onClose={close} onCreated={select} />} />
            </Row>
            <Row label="Area">
              <Select label="Area" value={area} onChange={setArea} options={areaOptions(tree?.project.areas ?? [])} onAdd={addNew.area} addPlaceholder="New area name" />
            </Row>
            <Row label="Start">
              <DateField label="Start" value={start} onChange={moveStart} required weekStart={weekStart} />
            </Row>
            <Row label="End">
              <DateField label="End" value={end} onChange={setEnd} required min={start} weekStart={weekStart} />
            </Row>
            <Row label="Priority">
              <Segmented label="Priority" options={PRIORITIES} value={priority ?? tree?.project.defaultPriority ?? 'p2'} onChange={setPriority} />
            </Row>
            <Row label="Done by">
              <Segmented label="Done by" options={EXECUTORS} value={executor ?? tree?.project.defaultExecutor ?? 'manual'} onChange={setExecutor} />
            </Row>
            {showDeps && (
              <Row label="Depends on" top>
                <DepChips
                  deps={chosen.map((d) => ({ ...d, key: d.id }))}
                  onRemove={(id) => setDeps(deps.filter((x) => x.id !== id))}
                  addLabel="Add dependency"
                  items={depItems(targets, (t) => setDeps([...deps, { kind: t.kind, id: t.id, title: t.title, color: t.color }]))}
                />
              </Row>
            )}
          </section>

          <section className="gp-tp__sec" aria-label="Context">
            <h3 className="gp-tp__h">Context</h3>
            <RichText label="Context" placeholder="What is this about? Links, notes, constraints…" value={description} onChange={setDescription} />
            <div className="gp-tp__links">
              <DraftLinks urls={links} onRemove={(i) => setLinks(links.filter((_, j) => j !== i))} />
              <AddLink onAdd={(u) => setLinks([...links, u])} />
            </div>
          </section>

          <section className="gp-tp__sec" aria-label="To-do">
            <h3 className="gp-tp__h">To-dos</h3>
            <DraftTodos items={todos} onChange={setTodos} />
          </section>
        </>
      )}

      <footer className="gp-tp__foot gp-tp__foot--form">
        <Button variant="secondary" label="Cancel" onClick={close} />
        {!noMilestone && <Button variant="primary" label="Create task" onClick={submit} disabled={!valid} />}
      </footer>
    </section>
  );
}
