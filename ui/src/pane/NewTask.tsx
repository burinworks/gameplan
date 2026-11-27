import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useCreateTask, useProject, useTriage, type CreateTaskBody } from '../api/hooks';
import type { Executor, Priority } from '../api/types';
import { isTab, paths } from '../app/routes';
import { executorLabel } from '../lib/format';
import { Button, Field, Icon, Segmented } from '../ui';
import { isDate } from './dates';
import { setDraftBar } from './draftBar';
import { useCloseTask } from './Pane';
import './task-pane.css';

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
  const triage = useTriage();

  const [title, setTitle] = useState(initialTitle ?? '');
  const [milestone, setMilestone] = useState<string | null>(milestoneId ?? null);
  const [area, setArea] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [priority, setPriority] = useState<Priority | null>(null);
  const [executor, setExecutor] = useState<Executor | null>(null);
  const [after, setAfter] = useState<{ id: string; title: string }[]>([]);
  const [todos, setTodos] = useState('');
  const [link, setLink] = useState('');

  const ms = milestone ?? tree?.milestones[0]?.id ?? '';
  const startOk = start === '' || isDate(start);
  const endOk = end === '' || isDate(end);
  const orderOk = !(isDate(start) && isDate(end)) || end >= start;
  const valid = title.trim() !== '' && ms !== '' && startOk && endOk && orderOk;

  // The timeline shows a draft bar for the dates being typed.
  useEffect(() => {
    if (isDate(start) && isDate(end) && end >= start) setDraftBar({ start, end, milestoneId: ms || undefined });
    else setDraftBar(null);
  }, [start, end, ms]);
  useEffect(() => () => setDraftBar(null), []);

  const tasks = tree?.milestones.flatMap((m) => m.tasks) ?? [];
  const candidates = tasks.filter((t) => !after.some((a) => a.id === t.id));

  const submit = () => {
    if (!valid) return;
    const body: CreateTaskBody = { title: title.trim() };
    if (area) body.area = area;
    if (isDate(start)) body.start = start;
    if (isDate(end)) body.end = end;
    if (priority) body.priority = priority;
    if (executor) body.executor = executor;
    const items = todos
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((t) => ({ title: t }));
    if (items.length) body.todos = items;
    if (after.length) body.after = after.map((a) => a.id);
    if (link.trim()) body.links = [{ url: link.trim() }];
    const tab = loc.split('/')[3];
    const open = (id: string) => navigate(paths.task(slug, id, isTab(tab) ? tab : 'timeline'), { replace: true });
    if (inboxId) triage.mutate({ id: inboxId, to: { as: 'task', milestoneId: ms, task: body } }, { onSuccess: (r) => r.created && open(r.created.id) });
    else create.mutate({ milestoneId: ms, body }, { onSuccess: (t) => open(t.id) });
  };

  return (
    <section
      className="gp-tp"
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
      <Field label="Title" placeholder="Title…" value={title} onChange={setTitle} onEnter={submit} autoFocus />

      <section className="gp-tp__sec" aria-label="Details">
        <div className="gp-tp__row">
          <span className="gp-tp__key">Milestone</span>
          <span className="gp-tp__val">
            <select className="gp-tp__select" aria-label="Milestone" value={ms} onChange={(e) => setMilestone(e.target.value)}>
              {(tree?.milestones ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </span>
        </div>
        <div className="gp-tp__row">
          <span className="gp-tp__key">Area</span>
          <span className="gp-tp__val">
            <select className="gp-tp__select" aria-label="Area" value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">None</option>
              {(tree?.project.areas ?? []).map((a) => (
                <option key={a.id} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
          </span>
        </div>
        <div className="gp-tp__row">
          <span className="gp-tp__key">Start</span>
          <span className="gp-tp__val">
            <input
              className={`gp-pane__input gp-pane__date num${startOk ? '' : ' is-invalid'}`}
              aria-label="Start date"
              aria-invalid={!startOk || undefined}
              placeholder="YYYY-MM-DD"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </span>
        </div>
        <div className="gp-tp__row">
          <span className="gp-tp__key">End</span>
          <span className="gp-tp__val">
            <input
              className={`gp-pane__input gp-pane__date num${endOk && orderOk ? '' : ' is-invalid'}`}
              aria-label="End date"
              aria-invalid={!endOk || !orderOk || undefined}
              placeholder="YYYY-MM-DD"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </span>
        </div>
        <div className="gp-tp__row">
          <span className="gp-tp__key">Priority</span>
          <span className="gp-tp__val">
            <select className="gp-tp__select" aria-label="Priority" value={priority ?? tree?.project.defaultPriority ?? 'p2'} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="p1">P1</option>
              <option value="p2">P2</option>
              <option value="p3">P3</option>
            </select>
          </span>
        </div>
        <div className="gp-tp__row">
          <span className="gp-tp__key">Done by</span>
          <span className="gp-tp__val">
            <Segmented label="Executor" options={EXECUTORS} value={executor ?? tree?.project.defaultExecutor ?? 'manual'} onChange={setExecutor} />
          </span>
        </div>
        <div className="gp-tp__row gp-tp__row--top">
          <span className="gp-tp__key">After</span>
          <span className="gp-tp__val gp-tp__deps">
            {after.map((a) => (
              <span key={a.id} className="gp-tp__dep">
                <span className="gp-tp__dep-title" dir="auto" title={a.title}>
                  {a.title}
                </span>
                <button type="button" className="gp-links__x" aria-label={`Remove ${a.title}`} onClick={() => setAfter(after.filter((x) => x.id !== a.id))}>
                  <Icon name="close" size={11} />
                </button>
              </span>
            ))}
            <select
              className="gp-tp__select"
              aria-label="Add dependency"
              value=""
              onChange={(e) => {
                const t = tasks.find((x) => x.id === e.target.value);
                if (t) setAfter([...after, { id: t.id, title: t.title }]);
              }}
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
      </section>

      <section className="gp-tp__sec">
        <h3 className="gp-tp__h">To-do</h3>
        <textarea
          className="gp-pane__input gp-tp__desc"
          dir="auto"
          aria-label="To-dos"
          placeholder="One to-do per line…"
          rows={3}
          value={todos}
          onChange={(e) => setTodos(e.target.value)}
        />
      </section>
      <section className="gp-tp__sec" aria-label="Context">
        <h3 className="gp-tp__h">Context</h3>
        <Field label="Context link" placeholder="Add link…" value={link} onChange={setLink} onEnter={submit} />
      </section>

      <footer className="gp-tp__foot">
        <Button variant="primary" label="Create task" onClick={submit} disabled={!valid} />
      </footer>
    </section>
  );
}
