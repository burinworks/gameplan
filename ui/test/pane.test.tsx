import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Router, useSearch } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { describe, expect, it, vi } from 'vitest';
import { today } from '../src/app/today';
import { addDays } from '../src/pane/dates';
import { htmlToMd, mdToHtml } from '../src/pane/markdown';
import { NewMilestone } from '../src/pane/NewMilestone';
import { NewTask } from '../src/pane/NewTask';
import { TaskPane } from '../src/pane/TaskPane';
import { mockFetch } from './setup';
import { projectTree, taskDetail, todo, treeTask } from './fixtures/pane';

function Probe() {
  return <output data-testid="search">{useSearch()}</output>;
}

function mount(ui: ReactNode, routes: Record<string, unknown>) {
  const fetchMock = mockFetch(routes as never);
  const { hook, searchHook } = memoryLocation({ path: '/p/acme/timeline', searchPath: '' });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={hook} searchHook={searchHook}>
        {ui}
        <Probe />
      </Router>
    </QueryClientProvider>,
  );
  return { fetchMock, qc };
}

const bodies = (f: ReturnType<typeof mockFetch>, method: string, path: string) =>
  f.mock.calls
    .filter(([url, init]) => new URL(String(url), 'http://x').pathname === path && (init?.method ?? 'GET') === method)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined));

const taskRoutes = (over: Parameters<typeof taskDetail>[0] = {}) => ({
  '/api/tasks/t1': taskDetail(over),
  '/api/projects/acme': projectTree(),
  'POST /api/tasks/t1/review': {},
  'PUT /api/tasks/t1/resume': {},
  'PATCH /api/tasks/t1': {},
  'PATCH /api/todos/d1': {},
  'POST /api/tasks/t1/reschedule': {},
  'POST /api/archive': { ok: true },
  'POST /api/restore': { ok: true },
});

describe('TaskPane', () => {
  it('review task: Accept posts accept', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes({ status: 'review' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/tasks/t1/review')).toEqual([{ decision: 'accept' }]));
  });

  it('review task: Send back with a note', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes({ status: 'review' }));
    expect(await screen.findByText(/finished this/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send back' }));
    const note = screen.getByPlaceholderText('What needs fixing…');
    fireEvent.change(note, { target: { value: 'tests fail' } });
    fireEvent.keyDown(note, { key: 'Enter' });
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/tasks/t1/review')).toEqual([{ decision: 'send_back', note: 'tests fail' }]));
  });

  it('review bar names the actor of the event that set review, never Agent for you', async () => {
    const events = [{ id: 'e1', kind: 'created', actor: 'you', entity: 'task', entityId: 't1', after: { status: 'review' }, before: null, at: '2026-11-26T09:00:00.000Z' }];
    mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes({ status: 'review', events: events as never }));
    const bar = await screen.findByRole('region', { name: 'Review' });
    expect(bar).toHaveTextContent('You');
    expect(bar).not.toHaveTextContent('Agent');
  });

  it('non-review task has no review bar', async () => {
    mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes());
    await screen.findByLabelText('Title');
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });

  const logEntry = (id: string, text: string, by = 'you') => ({ id, text, by, at: '2026-11-27T10:00:00.000Z', editedAt: null });
  const openLog = async () => fireEvent.click(await screen.findByRole('tab', { name: /Execution log/ }));

  it('execution log: Enter adds an entry, Shift+Enter does not', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, { ...taskRoutes(), 'POST /api/tasks/t1/log': logEntry('l9', 'x') });
    await openLog();
    const input = screen.getByRole('textbox', { name: 'Add to the execution log' });
    expect(input).toHaveAttribute('placeholder', 'What did you do / where did you stop…');
    fireEvent.change(input, { target: { value: 'Stopped at the dry run' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(bodies(fetchMock, 'POST', '/api/tasks/t1/log')).toEqual([]);
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/tasks/t1/log')).toEqual([{ text: 'Stopped at the dry run' }]));
    expect(input).toHaveValue('');
  });

  it('execution log: entries newest first with actor, tab shows the count', async () => {
    mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes({ log: [logEntry('l2', 'Second', 'ai:Codex'), logEntry('l1', 'First')] }));
    expect(await screen.findByRole('tab', { name: /Execution log\s*2/ })).toBeInTheDocument();
    await openLog();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(items[0]).toContain('Second');
    expect(items[0]).toContain('Codex');
    expect(items[1]).toContain('First');
  });

  it('execution log: Edit from the … menu saves on Enter', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, { ...taskRoutes({ log: [logEntry('l1', 'Old text')] }), 'PATCH /api/log/l1': logEntry('l1', 'New text') });
    await openLog();
    fireEvent.click(screen.getByRole('button', { name: 'Entry actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const edit = screen.getByRole('textbox', { name: 'Edit entry' });
    fireEvent.change(edit, { target: { value: 'New text' } });
    fireEvent.keyDown(edit, { key: 'Enter' });
    await waitFor(() => expect(bodies(fetchMock, 'PATCH', '/api/log/l1')).toEqual([{ text: 'New text' }]));
  });

  it('execution log: Delete shows Undo; Undo keeps the entry, otherwise it is deleted', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, {
        ...taskRoutes({ log: [logEntry('l1', 'One'), logEntry('l2', 'Two')] }),
        'DELETE /api/log/l1': { ok: true },
        'DELETE /api/log/l2': { ok: true },
      });
      await openLog();
      fireEvent.click(screen.getAllByRole('button', { name: 'Entry actions' })[0]!);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.getByText('One')).toBeInTheDocument();
      fireEvent.click(screen.getAllByRole('button', { name: 'Entry actions' })[1]!);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
      expect(screen.getByText('Entry deleted')).toBeInTheDocument();
      expect(bodies(fetchMock, 'DELETE', '/api/log/l2')).toEqual([]);
      act(() => {
        vi.advanceTimersByTime(6100);
      });
      await waitFor(() => expect(bodies(fetchMock, 'DELETE', '/api/log/l2')).toHaveLength(1));
      expect(bodies(fetchMock, 'DELETE', '/api/log/l1')).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('has three tabs; Details is first and shows no Length row', async () => {
    mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes({ todos: [todo({ id: 'd1', done: true }), todo({ id: 'd2' }), todo({ id: 'd3' })] }));
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Details', 'To-dos1/3', 'Execution log']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Length')).toBeNull();
    expect(screen.queryByText(/Where I left off/)).toBeNull();
  });

  it('review bar sits above the tabs', async () => {
    mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes({ status: 'review' }));
    const bar = await screen.findByRole('region', { name: 'Review' });
    const tablist = screen.getByRole('tablist');
    expect(bar.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the title is a field with a "Task name" placeholder', async () => {
    mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes());
    expect(await screen.findByRole('textbox', { name: 'Title' })).toHaveAttribute('placeholder', 'Task name');
  });

  it('Important is a star toggle without text', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes());
    const star = await screen.findByRole('button', { name: 'Important' });
    expect(star).toHaveAttribute('aria-pressed', 'false');
    expect(star.textContent).toBe('');
    fireEvent.click(star);
    await waitFor(() => expect(bodies(fetchMock, 'PATCH', '/api/tasks/t1')).toEqual([{ important: true }]));
  });

  it('ticking a next to-do PATCHes done; a locked to-do is not focusable', async () => {
    const todos = [todo({ id: 'd1', title: 'First', state: 'next' }), todo({ id: 'd2', title: 'Second', state: 'locked', ord: 1 })];
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes({ todos }));
    fireEvent.click(await screen.findByRole('tab', { name: /To-dos/ }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'First' }));
    await waitFor(() => expect(bodies(fetchMock, 'PATCH', '/api/todos/d1')).toEqual([{ done: true }]));
    expect(screen.getByRole('checkbox', { name: 'Second' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('0 / 2')).toBeInTheDocument();
  });

  const group = (name: string) => within(screen.getByRole('group', { name }));

  it('Next day on Start moves the whole task (length kept), no cascade', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes());
    await screen.findByLabelText('Title');
    fireEvent.click(group('Start').getByRole('button', { name: 'Next day' }));
    await waitFor(() =>
      expect(bodies(fetchMock, 'POST', '/api/tasks/t1/reschedule')).toEqual([{ start: '2026-11-21', end: '2026-11-26', cascade: false }]),
    );
  });

  it('Next day on End changes only the end', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes());
    await screen.findByLabelText('Title');
    fireEvent.click(group('End').getByRole('button', { name: 'Next day' }));
    await waitFor(() =>
      expect(bodies(fetchMock, 'POST', '/api/tasks/t1/reschedule')).toEqual([{ start: '2026-11-20', end: '2026-11-26', cascade: false }]),
    );
  });

  it('picking a start day in the calendar keeps the length', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes());
    await screen.findByLabelText('Title');
    fireEvent.click(group('Start').getByRole('button', { name: /Nov 20/ }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Start calendar' })).getByRole('button', { name: /Nov 27/ }));
    await waitFor(() =>
      expect(bodies(fetchMock, 'POST', '/api/tasks/t1/reschedule')).toEqual([{ start: '2026-11-27', end: '2026-12-02', cascade: false }]),
    );
  });

  it('End cannot go before Start: Previous day is disabled at the start date', async () => {
    mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes({ start: '2026-11-25', end: '2026-11-25' }));
    await screen.findByLabelText('Title');
    expect(group('End').getByRole('button', { name: 'Previous day' })).toBeDisabled();
  });

  it('Priority and Done by are attribute rows that patch', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes());
    await screen.findByRole('radiogroup', { name: 'Priority' });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Priority' })).getByRole('radio', { name: 'P1' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Done by' })).getByRole('radio', { name: 'AI' }));
    await waitFor(() => expect(bodies(fetchMock, 'PATCH', '/api/tasks/t1')).toEqual([{ priority: 'p1' }, { executor: 'ai' }]));
  });

  it('Details holds Context and Deliverables; Context saves Markdown on blur', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes({ description: 'Hello **world**' }));
    const ctx = await screen.findByRole('textbox', { name: 'Description' });
    expect(ctx.innerHTML).toContain('<strong>world</strong>');
    const sections = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(sections).toEqual(expect.arrayContaining(['Attributes', 'Context', 'Deliverables']));
    expect(sections).not.toContain('To-do');
    fireEvent.focus(ctx);
    ctx.textContent = 'Plain note';
    fireEvent.input(ctx);
    fireEvent.blur(ctx);
    await waitFor(() => expect(bodies(fetchMock, 'PATCH', '/api/tasks/t1')).toEqual([{ description: 'Plain note' }]));
  });

  it('adds a to-do from the one-line row: Enter adds and keeps focus', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, { ...taskRoutes(), 'POST /api/tasks/t1/todos': [] });
    fireEvent.click(await screen.findByRole('tab', { name: /To-dos/ }));
    const add = await screen.findByRole('textbox', { name: 'Add a to-do' });
    add.focus();
    fireEvent.change(add, { target: { value: 'Write docs' } });
    fireEvent.keyDown(add, { key: 'Enter' });
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/tasks/t1/todos')).toEqual([{ todos: [{ title: 'Write docs' }] }]));
    expect((add as HTMLInputElement).value).toBe('');
    expect(add).toHaveFocus();
  });

  it('a refused title save restores the server value', async () => {
    mount(<TaskPane taskId="t1" slug="acme" />, {
      ...taskRoutes(),
      'PATCH /api/tasks/t1': () => new Response(JSON.stringify({ error: { code: 'forbidden', message: 'no' } }), { status: 403 }),
    });
    const title = (await screen.findByLabelText('Title')) as HTMLTextAreaElement;
    fireEvent.focus(title);
    fireEvent.change(title, { target: { value: 'Rejected' } });
    fireEvent.keyDown(title, { key: 'Enter' });
    fireEvent.blur(title);
    await waitFor(() => expect(title.value).toBe('Draft the spec'));
  });

  it('an agent update while the title is focused does not change it', async () => {
    const { qc } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes());
    const title = (await screen.findByLabelText('Title')) as HTMLInputElement;
    fireEvent.focus(title);
    fireEvent.change(title, { target: { value: 'My edit' } });
    act(() => {
      qc.setQueryData(['task', 't1'], taskDetail({ title: 'Agent rename' }));
    });
    expect(title.value).toBe('My edit');
  });

  it('Archive shows Task archived with Undo that restores', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes());
    fireEvent.click(await screen.findByRole('button', { name: 'Archive task' }));
    expect(await screen.findByText('Task archived')).toBeInTheDocument();
    expect(bodies(fetchMock, 'POST', '/api/archive')).toEqual([{ entity: 'task', id: 't1' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/restore')).toEqual([{ entity: 'task', id: 't1' }]));
    expect(await screen.findByLabelText('Title')).toBeInTheDocument();
  });

  it('shows deliverables: short sha, PR number with state, ticket key', async () => {
    const att = (id: string, kind: string, extra: object) => ({ id, taskId: 't1', role: 'deliverable', kind, title: null, url: `https://github.com/o/r/${id}`, ref: null, state: null, actor: null, at: '', archivedAt: null, ...extra });
    mount(
      <TaskPane taskId="t1" slug="acme" />,
      taskRoutes({ deliverables: [att('c', 'commit', { ref: 'abcdef1234' }), att('p', 'pr', { ref: '#12', state: 'open' }), att('k', 'ticket', { ref: 'ENG-4' })] as never }),
    );
    expect(await screen.findByText('abcdef1')).toBeInTheDocument();
    expect(screen.getByText('#12')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('ENG-4')).toBeInTheDocument();
  });

  it('adds a dependency from the same-project picker', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, { ...taskRoutes(), 'POST /api/dependencies': {} });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add dependency' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Add dependency' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Write tests' }));
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/dependencies')).toEqual([{ fromTaskId: 't1', taskId: 't2' }]));
  });

  it('Depends on offers other milestones being done (not its own) and removes any chip', async () => {
    const dependsOn = [
      { depId: 'dep1', id: 't2', title: 'Write tests', kind: 'task', bad: false },
      { depId: 'dep2', id: 'm2', title: 'Launch', kind: 'milestone', bad: false },
    ];
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, {
      ...taskRoutes({ dependsOn: dependsOn as never }),
      'DELETE /api/dependencies/dep1': { ok: true },
      'DELETE /api/dependencies/dep2': { ok: true },
    });
    expect(await screen.findByText('Launch done')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Launch done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Write tests' }));
    const deletes = () => fetchMock.mock.calls.filter(([, i]) => i?.method === 'DELETE').map(([u]) => new URL(String(u), 'http://x').pathname);
    await waitFor(() => expect(deletes()).toEqual(['/api/dependencies/dep2', '/api/dependencies/dep1']));
  });

  it('picking "<milestone> done" adds a milestone dependency', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, { ...taskRoutes(), 'POST /api/dependencies': {} });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add dependency' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Add dependency' }));
    expect(screen.queryByRole('menuitem', { name: 'Beta done' })).toBeNull(); // its own milestone: a loop
    fireEvent.click(screen.getByRole('menuitem', { name: 'Launch done' }));
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/dependencies')).toEqual([{ fromTaskId: 't1', milestoneId: 'm2' }]));
  });

  it('Blocks is editable from the blocker side: remove', async () => {
    const blocks = [{ depId: 'dep7', id: 't2', title: 'Write tests', kind: 'task', bad: false }];
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, { ...taskRoutes({ blocks: blocks as never }), 'DELETE /api/dependencies/dep7': { ok: true } });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Write tests' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) => i?.method === 'DELETE' && String(u).endsWith('/api/dependencies/dep7'))).toBe(true));
  });

  it('Blocks "Add" makes another task depend on this one', async () => {
    const tree = projectTree();
    tree.milestones[0]!.tasks.push(treeTask({ id: 't3', title: 'Ship docs' }));
    const blocks = [{ depId: 'dep7', id: 't2', title: 'Write tests', kind: 'task', bad: false }];
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, { ...taskRoutes({ blocks: blocks as never }), '/api/projects/acme': tree, 'POST /api/dependencies': {} });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add a task this blocks' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Add a task this blocks' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ship docs' }));
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/dependencies')).toEqual([{ fromTaskId: 't3', taskId: 't1' }]));
  });

  it('Depends on is hidden when there is nothing to depend on', async () => {
    const tree = projectTree();
    tree.milestones = [{ ...tree.milestones[0]!, tasks: [treeTask()] }];
    mount(<TaskPane taskId="t1" slug="acme" />, { ...taskRoutes(), '/api/projects/acme': tree });
    await screen.findByRole('button', { name: /^Milestone: Beta/ });
    expect(screen.queryByText('Depends on')).toBeNull();
  });

  it('Milestone select: "Add new…" creates a milestone and moves the task to it', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, { ...taskRoutes(), 'POST /api/projects/acme/milestones': { id: 'm9', name: 'Docs' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Milestone: Beta' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add new…' }));
    const input = screen.getByRole('textbox', { name: 'New milestone' });
    fireEvent.change(input, { target: { value: 'Docs' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/projects/acme/milestones')).toEqual([{ name: 'Docs' }]));
    await waitFor(() => expect(bodies(fetchMock, 'PATCH', '/api/tasks/t1')).toEqual([{ milestoneId: 'm9' }]));
  });

  it('Area select: "Add new…" adds the area to the project and sets it', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, { ...taskRoutes(), 'PATCH /api/projects/acme': {} });
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/api/projects/acme'))).toBe(true));
    fireEvent.click(await screen.findByRole('button', { name: 'Area: None' }));
    await screen.findByRole('menuitemradio', { name: 'Frontend' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add new…' }));
    const input = screen.getByRole('textbox', { name: 'New area' });
    fireEvent.change(input, { target: { value: 'Backend' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(bodies(fetchMock, 'PATCH', '/api/projects/acme')).toEqual([{ areas: [{ id: 'a1', name: 'Frontend' }, { name: 'Backend' }] }]));
    await waitFor(() => expect(bodies(fetchMock, 'PATCH', '/api/tasks/t1')).toEqual([{ area: 'Backend' }]));
  });

  it('"Add new…" is cancelled with Escape', async () => {
    mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes());
    fireEvent.click(await screen.findByRole('button', { name: 'Area: None' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add new…' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'New area' }), { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Area: None' })).toBeInTheDocument();
  });

  it('the date popover stays inside the window at the right edge and follows scrolling', async () => {
    mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes());
    const value = (await screen.findByRole('group', { name: 'End' })).querySelector('button')!;
    let left = 1300;
    value.getBoundingClientRect = () => ({ left, right: left + 150, top: 300, bottom: 330, width: 150, height: 30, x: left, y: 300, toJSON: () => ({}) }) as DOMRect;
    const ow = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    const oh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 260 });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 240 });
    try {
      window.innerWidth = 1440;
      window.innerHeight = 900;
      fireEvent.click(value);
      const pop = screen.getByRole('dialog', { name: 'End calendar' });
      expect(pop.parentElement).toBe(document.body);
      expect(parseFloat(pop.style.left) + 260).toBeLessThanOrEqual(1440);
      expect(parseFloat(pop.style.top)).toBeGreaterThan(330);
      left = 1000;
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });
      expect(parseFloat(pop.style.left)).toBe(1000);
    } finally {
      if (ow) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', ow);
      if (oh) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', oh);
    }
  });

  it('the date popover flips above the field when there is no room below', async () => {
    mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes());
    const value = (await screen.findByRole('group', { name: 'Start' })).querySelector('button')!;
    value.getBoundingClientRect = () => ({ left: 1100, right: 1250, top: 800, bottom: 830, width: 150, height: 30, x: 1100, y: 800, toJSON: () => ({}) }) as DOMRect;
    const oh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 240 });
    try {
      window.innerHeight = 900;
      fireEvent.click(value);
      expect(parseFloat(screen.getByRole('dialog', { name: 'Start calendar' }).style.top)).toBeLessThan(800);
    } finally {
      if (oh) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', oh);
    }
  });
});

const tomorrow = () => addDays(today(), 1);
const grp = (name: string) => within(screen.getByRole('group', { name }));

describe('NewTask', () => {
  const routes = { '/api/projects/acme': projectTree(), 'POST /api/milestones/m1/tasks': treeTask({ id: 'tNew' }), 'POST /api/inbox/i1/triage': { item: {}, created: { entity: 'task', id: 'tInbox' } } };

  it('dates default to tomorrow, one day long, never empty', () => {
    mount(<NewTask slug="acme" milestoneId="m1" />, routes);
    expect(grp('Start').getByRole('button', { name: /,/ })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('YYYY-MM-DD')).toBeNull();
  });

  it('creates with a title and the default dates, then opens the new task', async () => {
    const { fetchMock } = mount(<NewTask slug="acme" milestoneId="m1" />, routes);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Ship it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/milestones/m1/tasks')).toEqual([{ title: 'Ship it', start: tomorrow(), end: tomorrow() }]));
    await waitFor(() => expect(screen.getByTestId('search').textContent).toContain('task=tNew'));
  });

  it('moving Start keeps the length; End only changes the end', async () => {
    const { fetchMock } = mount(<NewTask slug="acme" milestoneId="m1" />, routes);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Ship it' } });
    fireEvent.click(grp('End').getByRole('button', { name: 'Next day' })); // two days long
    fireEvent.click(grp('Start').getByRole('button', { name: 'Next day' })); // both move
    fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/milestones/m1/tasks')).toEqual([{ title: 'Ship it', start: addDays(tomorrow(), 1), end: addDays(tomorrow(), 2) }]));
  });

  it('sends context, one-line to-dos and links; mod+enter creates', async () => {
    const { fetchMock } = mount(<NewTask slug="acme" milestoneId="m1" />, routes);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Ship it' } });
    const ctx = screen.getByRole('textbox', { name: 'Context' });
    ctx.textContent = 'Short, user-facing.';
    fireEvent.input(ctx);
    const add = screen.getByRole('textbox', { name: 'Add a to-do' });
    fireEvent.change(add, { target: { value: 'one' } });
    fireEvent.keyDown(add, { key: 'Enter' });
    fireEvent.change(add, { target: { value: 'two' } });
    fireEvent.keyDown(add, { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: 'To-do 1' })).toHaveValue('one');
    expect(add).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    const url = screen.getByRole('textbox', { name: 'Link address' });
    fireEvent.change(url, { target: { value: 'https://example.com/spec' } });
    fireEvent.keyDown(url, { key: 'Enter' });
    fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Enter', ctrlKey: true });
    await waitFor(() =>
      expect(bodies(fetchMock, 'POST', '/api/milestones/m1/tasks')).toEqual([
        {
          title: 'Ship it',
          start: tomorrow(),
          end: tomorrow(),
          description: 'Short, user-facing.',
          todos: [{ title: 'one' }, { title: 'two' }],
          links: [{ url: 'https://example.com/spec' }],
        },
      ]),
    );
  });

  it('Backspace on an empty to-do row removes it', () => {
    mount(<NewTask slug="acme" milestoneId="m1" />, routes);
    const add = screen.getByRole('textbox', { name: 'Add a to-do' });
    fireEvent.change(add, { target: { value: 'one' } });
    fireEvent.keyDown(add, { key: 'Enter' });
    const row = screen.getByRole('textbox', { name: 'To-do 1' });
    fireEvent.change(row, { target: { value: '' } });
    fireEvent.keyDown(row, { key: 'Backspace' });
    expect(screen.queryByRole('textbox', { name: 'To-do 1' })).toBeNull();
  });

  it('Context is above To-do', () => {
    mount(<NewTask slug="acme" milestoneId="m1" />, routes);
    const order = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(order.indexOf('Context')).toBeLessThan(order.indexOf('To-do'));
  });

  it('End cannot be set before Start', () => {
    mount(<NewTask slug="acme" milestoneId="m1" />, routes);
    expect(grp('End').getByRole('button', { name: 'Previous day' })).toBeDisabled();
  });

  it('has a Cancel button', () => {
    mount(<NewTask slug="acme" milestoneId="m1" />, routes);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('a double Enter creates one task', async () => {
    const slow = { ...routes, 'POST /api/milestones/m1/tasks': async () => (await new Promise((r) => setTimeout(r, 30)), treeTask({ id: 'tNew' })) };
    const { fetchMock } = mount(<NewTask slug="acme" milestoneId="m1" />, slow);
    const title = screen.getByLabelText('Title');
    fireEvent.change(title, { target: { value: 'Ship it' } });
    fireEvent.keyDown(title, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(title, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(screen.getByTestId('search').textContent).toContain('task=tNew'));
    expect(bodies(fetchMock, 'POST', '/api/milestones/m1/tasks')).toHaveLength(1);
  });

  it('inbox prefill triages as a task', async () => {
    const { fetchMock } = mount(<NewTask slug="acme" milestoneId="m1" title="From inbox" inboxId="i1" />, routes);
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('From inbox');
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() =>
      expect(bodies(fetchMock, 'POST', '/api/inbox/i1/triage')).toEqual([{ as: 'task', milestoneId: 'm1', task: { title: 'From inbox', start: tomorrow(), end: tomorrow() } }]),
    );
    await waitFor(() => expect(screen.getByTestId('search').textContent).toContain('task=tInbox'));
  });

  it('shows the draft bar from the start', async () => {
    const { useDraftBar } = await import('../src/pane/draftBar');
    let seen: unknown;
    function Watch() {
      seen = useDraftBar();
      return null;
    }
    mount(
      <>
        <NewTask slug="acme" milestoneId="m1" />
        <Watch />
      </>,
      routes,
    );
    expect(seen).toEqual({ start: tomorrow(), end: tomorrow(), milestoneId: 'm1' });
    fireEvent.click(grp('End').getByRole('button', { name: 'Next day' }));
    expect(seen).toEqual({ start: tomorrow(), end: addDays(tomorrow(), 1), milestoneId: 'm1' });
  });
});

describe('NewTask without milestones', () => {
  const empty = () => ({ ...projectTree(), milestones: [] }) as unknown as ReturnType<typeof projectTree>;

  it('asks to create a milestone first, then continues with the task form', async () => {
    const { fetchMock } = mount(<NewTask slug="acme" />, {
      '/api/projects/acme': empty(),
      'POST /api/projects/acme/milestones': { id: 'mNew', name: 'First release' },
      'POST /api/milestones/mNew/tasks': treeTask({ id: 'tNew' }),
    });
    expect(await screen.findByRole('region', { name: 'Create a milestone first' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create task' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Milestone name' }), { target: { value: 'First release' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create milestone' }));
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/projects/acme/milestones')).toEqual([{ name: 'First release', due: addDays(today(), 14) }]));
    const title = await screen.findByRole('textbox', { name: 'Title' });
    fireEvent.change(title, { target: { value: 'Ship it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/milestones/mNew/tasks')).toHaveLength(1));
  });
});

describe('NewTask dependencies', () => {
  it('a milestone dependency is added after the task is created; task dependencies go in the body', async () => {
    const { fetchMock } = mount(<NewTask slug="acme" milestoneId="m1" />, {
      '/api/projects/acme': projectTree(),
      'POST /api/milestones/m1/tasks': treeTask({ id: 'tNew' }),
      'POST /api/dependencies': {},
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Ship it' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add dependency' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Add dependency' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Launch done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add dependency' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Write tests' }));
    expect(screen.getByText('Launch done')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/milestones/m1/tasks')[0]).toMatchObject({ after: ['t2'] }));
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/dependencies')).toEqual([{ fromTaskId: 'tNew', milestoneId: 'm2' }]));
  });

  it('the title field autofocuses with a "Task name" placeholder', () => {
    mount(<NewTask slug="acme" milestoneId="m1" />, { '/api/projects/acme': projectTree() });
    const title = screen.getByRole('textbox', { name: 'Title' });
    expect(title).toHaveFocus();
    expect(title).toHaveAttribute('placeholder', 'Task name');
  });
});

describe('NewMilestone', () => {
  it('creates with a name and a never-empty due date (default two weeks out)', async () => {
    const { fetchMock: f } = mount(<NewMilestone slug="acme" />, { 'POST /api/projects/acme/milestones': { id: 'mNew' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Beta' } });
    fireEvent.click(grp('Due').getByRole('button', { name: 'Next day' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Active' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create milestone' }));
    await waitFor(() => expect(bodies(f, 'POST', '/api/projects/acme/milestones')).toEqual([{ name: 'Beta', due: addDays(today(), 15), status: 'active' }]));
  });

  it('defaults the due date to two weeks after the last milestone', async () => {
    const { fetchMock: f } = mount(<NewMilestone slug="acme" />, { '/api/projects/acme': projectTree(), 'POST /api/projects/acme/milestones': { id: 'mNew' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Docs' } });
    const expected = addDays('2026-12-01', 14) < tomorrow() ? tomorrow() : addDays('2026-12-01', 14);
    expect(screen.queryByRole('grid')).toBeNull(); // a popover, not an inline calendar
    const value = grp('Due').getByRole('button', { expanded: false });
    await waitFor(() => expect(value.textContent).not.toBe(''));
    fireEvent.click(value);
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: 'Due calendar' })).getByRole('button', { pressed: true })).toHaveAttribute('data-date', expected));
    fireEvent.click(screen.getByRole('button', { name: 'Create milestone' }));
    await waitFor(() => expect(bodies(f, 'POST', '/api/projects/acme/milestones')).toEqual([{ name: 'Docs', due: expected }]));
  });

  it('a double Enter creates one milestone', async () => {
    const { fetchMock } = mount(<NewMilestone slug="acme" />, {
      'POST /api/projects/acme/milestones': async () => (await new Promise((r) => setTimeout(r, 30)), { id: 'mNew' }),
    });
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Beta' } });
    fireEvent.keyDown(name, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(name, { key: 'Enter', ctrlKey: true });
    await new Promise((r) => setTimeout(r, 80));
    expect(bodies(fetchMock, 'POST', '/api/projects/acme/milestones')).toHaveLength(1);
  });
});

describe('markdown', () => {
  it('round-trips bold, italic, links and lists', () => {
    const md = 'Intro **bold** and *it* with [a link](https://x.io)\n- one\n- two\nend';
    const el = document.createElement('div');
    el.innerHTML = mdToHtml(md);
    expect(el.querySelectorAll('li')).toHaveLength(2);
    expect(el.querySelector('strong')?.textContent).toBe('bold');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('https://x.io');
    expect(htmlToMd(el)).toBe(md);
  });

  it('escapes HTML and refuses script links', () => {
    const el = document.createElement('div');
    el.innerHTML = mdToHtml('<b>x</b> [bad](javascript:alert(1))');
    expect(el.querySelector('b')).toBeNull();
    expect(el.querySelector('a')).toBeNull();
  });

  it('reads Chrome-style div lines', () => {
    const el = document.createElement('div');
    el.innerHTML = 'one<div>two</div><div><br></div><div>three</div>';
    expect(htmlToMd(el)).toBe('one\ntwo\n\nthree');
  });
});
