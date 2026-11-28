import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useCreateTask, useProject, useSettings, useTriage, type CreateTaskBody } from '../api/hooks';
import type { Executor, Priority } from '../api/types';
import { isTab, paths } from '../app/routes';
import { today } from '../app/today';
import { executorLabel } from '../lib/format';
import { Button, DateField, Segmented, Select } from '../ui';
import { addDays, lengthDays } from './dates';
import { AfterRow, areaOptions, Row } from './Details';
import { setDraftBar } from './draftBar';
import { AddLink, DraftLinks } from './Links';
import { useCloseTask } from './Pane';
import { RichText } from './RichText';
import { DraftTodos } from './Todos';
import './task-pane.css';

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'p1', label: 'P1' },
  { value: 'p2', label: 'P2' },
  { value: 'p3', label: 'P3' },
];
const EXECUTORS: { value: Executor; label: string }[] = [
  { value: 'manual', label: executorLabel('manual') },
  { value: 'ai', label: executorLabel('ai') },
  { value: 'together', label: executorLabel('together') },
];

export function NewTask({ slug, milestoneId, title: initialTitle, inboxId }: { slug: string; milestoneId?: string; title?: string; inboxId?: string }) {
  const tree = useProject(slug).data;
  const close = useCloseTask();
  const [loc, navigate] = useLocation();
  const create = useCreateTask();
  const busy = useRef(false); // set synchronously: mutation state lags a keypress behind
  const triage = useTriage();

  const [title, setTitle] = useState(initialTitle ?? '');
  const [milestone, setMilestone] = useState<string | null>(milestoneId ?? null);
  const [area, setArea] = useState('');
  const [start, setStart] = useState(() => addDays(today(), 1)); // never empty: tomorrow, one day long
  const [end, setEnd] = useState(() => addDays(today(), 1));
  const [priority, setPriority] = useState<Priority | null>(null);
  const [executor, setExecutor] = useState<Executor | null>(null);
  const [after, setAfter] = useState<{ id: string; title: string }[]>([]);
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
  useEffect(() => {
    setDraftBar({ start, end, milestoneId: ms || undefined });
  }, [start, end, ms]);
  useEffect(() => () => setDraftBar(null), []);

  const tasks = tree?.milestones.flatMap((m) => m.tasks) ?? [];
  const candidates = tasks.filter((t) => !after.some((a) => a.id === t.id)).map((t) => ({ id: t.id, title: t.title }));
  const weekStart = settings.data?.week_start === 'sun' ? 'sun' : 'mon';

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
    if (after.length) body.after = after.map((a) => a.id);
    if (links.length) body.links = links.map((url) => ({ url }));
    const tab = loc.split('/')[3];
    const open = (id: string) => navigate(paths.task(slug, id, isTab(tab) ? tab : 'timeline'), { replace: true });
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
      <input
        className="gp-tp__title-input"
        dir="auto"
        aria-label="Title"
        placeholder="Task title"
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
      />

      <section className="gp-tp__grid" aria-label="Details">
        <Row label="Milestone">
          <Select
            label="Milestone"
            value={ms}
            onChange={setMilestone}
            options={(tree?.milestones ?? []).map((m) => ({ value: m.id, label: m.name, diamond: tree?.project.color ?? undefined }))}
          />
        </Row>
        <Row label="Area">
          <Select label="Area" value={area} onChange={setArea} options={areaOptions(tree?.project.areas ?? [])} />
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
        <Row label="After" top>
          <AfterRow
            deps={after.map((a) => ({ key: a.id, title: a.title }))}
            onRemove={(id) => setAfter(after.filter((x) => x.id !== id))}
            candidates={candidates}
            onAdd={(id) => {
              const t = tasks.find((x) => x.id === id);
              if (t) setAfter([...after, { id: t.id, title: t.title }]);
            }}
          />
        </Row>
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
        <h3 className="gp-tp__h">To-do</h3>
        <DraftTodos items={todos} onChange={setTodos} />
      </section>

      <footer className="gp-tp__foot gp-tp__foot--form">
        <Button variant="secondary" label="Cancel" onClick={close} />
        <Button variant="primary" label="Create task" onClick={submit} disabled={!valid} />
      </footer>
    </section>
  );
}
