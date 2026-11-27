import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Router, useSearch } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { describe, expect, it } from 'vitest';
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
  it('review task: Approve posts accept', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes({ status: 'review' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/tasks/t1/review')).toEqual([{ decision: 'accept' }]));
  });

  it('review task: Send back with a note', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes({ status: 'review' }));
    expect(await screen.findByText('Needs review')).toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('resume: empty state edits, rejects newline, stops at 200 chars, counter at 180', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes());
    fireEvent.click(await screen.findByRole('button', { name: 'Add where you left off' }));
    const input = screen.getByLabelText('Where I left off', { selector: 'input' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'a\nb' } });
    expect(input.value).toBe('ab');
    expect(screen.queryByText(/\/200/)).toBeNull();
    fireEvent.change(input, { target: { value: 'x'.repeat(250) } });
    expect(input.value).toHaveLength(200);
    expect(input.maxLength).toBe(200);
    expect(screen.getByText('200/200')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(bodies(fetchMock, 'PUT', '/api/tasks/t1/resume')).toEqual([{ note: 'x'.repeat(200) }]));
  });

  it('ticking a next to-do PATCHes done; a locked to-do is not focusable', async () => {
    const todos = [todo({ id: 'd1', title: 'First', state: 'next' }), todo({ id: 'd2', title: 'Second', state: 'locked', ord: 1 })];
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes({ todos }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'First' }));
    await waitFor(() => expect(bodies(fetchMock, 'PATCH', '/api/todos/d1')).toEqual([{ done: true }]));
    expect(screen.getByRole('checkbox', { name: 'Second' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('0/2 to-dos')).toBeInTheDocument();
  });

  it('+ on Start shifts both dates by one day, no cascade', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes());
    fireEvent.click(await screen.findByRole('button', { name: 'Start +1 day' }));
    await waitFor(() =>
      expect(bodies(fetchMock, 'POST', '/api/tasks/t1/reschedule')).toEqual([{ start: '2026-11-21', end: '2026-11-26', cascade: false }]),
    );
  });

  it('plain click on End + shifts both dates', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes());
    fireEvent.click(await screen.findByRole('button', { name: 'End +1 day' }));
    await waitFor(() =>
      expect(bodies(fetchMock, 'POST', '/api/tasks/t1/reschedule')).toEqual([{ start: '2026-11-21', end: '2026-11-26', cascade: false }]),
    );
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

  it('shift-click shifts only End', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes());
    fireEvent.click(await screen.findByRole('button', { name: 'End +1 day' }), { shiftKey: true });
    await waitFor(() =>
      expect(bodies(fetchMock, 'POST', '/api/tasks/t1/reschedule')).toEqual([{ start: '2026-11-20', end: '2026-11-26', cascade: false }]),
    );
  });

  it('invalid date shows the risk ring and sends nothing', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes());
    const start = await screen.findByLabelText('Start date');
    fireEvent.focus(start);
    fireEvent.change(start, { target: { value: '2026-13-40' } });
    expect(start).toHaveClass('is-invalid');
    fireEvent.keyDown(start, { key: 'Enter' });
    fireEvent.blur(start);
    expect(start).toHaveClass('is-invalid');
    expect(bodies(fetchMock, 'POST', '/api/tasks/t1/reschedule')).toEqual([]);
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
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
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
    const pick = await screen.findByLabelText('Add dependency');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Write tests' })).toBeInTheDocument());
    fireEvent.change(pick, { target: { value: 't2' } });
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/dependencies')).toEqual([{ fromTaskId: 't1', taskId: 't2' }]));
  });
});

describe('NewTask', () => {
  const routes = { '/api/projects/acme': projectTree(), 'POST /api/milestones/m1/tasks': treeTask({ id: 'tNew' }), 'POST /api/inbox/i1/triage': { item: {}, created: { entity: 'task', id: 'tInbox' } } };

  it('creates with only a title and opens the new task', async () => {
    const { fetchMock } = mount(<NewTask slug="acme" milestoneId="m1" />, routes);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Ship it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/milestones/m1/tasks')).toEqual([{ title: 'Ship it' }]));
    await waitFor(() => expect(screen.getByTestId('search').textContent).toContain('task=tNew'));
  });

  it('sends dates, to-do lines and links; mod+enter creates', async () => {
    const { fetchMock } = mount(<NewTask slug="acme" milestoneId="m1" />, routes);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Ship it' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-11-30' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-12-02' } });
    fireEvent.change(screen.getByLabelText('To-dos'), { target: { value: 'one\n\ntwo' } });
    fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Enter', ctrlKey: true });
    await waitFor(() =>
      expect(bodies(fetchMock, 'POST', '/api/milestones/m1/tasks')).toEqual([
        { title: 'Ship it', start: '2026-11-30', end: '2026-12-02', todos: [{ title: 'one' }, { title: 'two' }] },
      ]),
    );
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

  it('shows no request for an invalid date', () => {
    const { fetchMock } = mount(<NewTask slug="acme" milestoneId="m1" />, routes);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: 'nope' } });
    expect(screen.getByLabelText('Start date')).toHaveClass('is-invalid');
    expect(screen.getByRole('button', { name: 'Create task' })).toBeDisabled();
    expect(bodies(fetchMock, 'POST', '/api/milestones/m1/tasks')).toEqual([]);
  });

  it('inbox prefill triages as a task', async () => {
    const { fetchMock } = mount(<NewTask slug="acme" milestoneId="m1" title="From inbox" inboxId="i1" />, routes);
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('From inbox');
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/inbox/i1/triage')).toEqual([{ as: 'task', milestoneId: 'm1', task: { title: 'From inbox' } }]));
    await waitFor(() => expect(screen.getByTestId('search').textContent).toContain('task=tInbox'));
  });

  it('sets the draft bar while the dates are valid and clears on unmount', async () => {
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
    expect(seen).toBeNull();
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-11-30' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-12-02' } });
    expect(seen).toEqual({ start: '2026-11-30', end: '2026-12-02', milestoneId: 'm1' });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: 'bad' } });
    expect(seen).toBeNull();
  });
});

describe('NewMilestone', () => {
  it('creates with a name and due date', async () => {
    const { fetchMock: f } = mount(<NewMilestone slug="acme" />, { 'POST /api/projects/acme/milestones': { id: 'mNew' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Beta' } });
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Due +1 day' }));
    expect((screen.getByLabelText('Due date') as HTMLInputElement).value).toBe('2026-12-02');
    fireEvent.click(screen.getByRole('radio', { name: 'Active' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create milestone' }));
    await waitFor(() => expect(bodies(f, 'POST', '/api/projects/acme/milestones')).toEqual([{ name: 'Beta', due: '2026-12-02', status: 'active' }]));
  });
});

describe('NewMilestone', () => {
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
