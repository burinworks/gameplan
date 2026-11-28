import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Router, useSearch } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { describe, expect, it } from 'vitest';
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

  it('the priority chip opens a menu and patches', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes());
    fireEvent.click(await screen.findByRole('button', { name: 'Priority: P2' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'P1' }));
    await waitFor(() => expect(bodies(fetchMock, 'PATCH', '/api/tasks/t1')).toEqual([{ priority: 'p1' }]));
  });

  it('Context comes before To-do and saves Markdown on blur', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, taskRoutes({ description: 'Hello **world**' }));
    const ctx = await screen.findByRole('textbox', { name: 'Description' });
    expect(ctx.innerHTML).toContain('<strong>world</strong>');
    const sections = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(sections.indexOf('Context')).toBeGreaterThan(-1);
    expect(sections.indexOf('Context')).toBeLessThan(sections.indexOf('To-do'));
    fireEvent.focus(ctx);
    ctx.textContent = 'Plain note';
    fireEvent.input(ctx);
    fireEvent.blur(ctx);
    await waitFor(() => expect(bodies(fetchMock, 'PATCH', '/api/tasks/t1')).toEqual([{ description: 'Plain note' }]));
  });

  it('adds a to-do from the one-line row: Enter adds and keeps focus', async () => {
    const { fetchMock } = mount(<TaskPane taskId="t1" slug="acme" />, { ...taskRoutes(), 'POST /api/tasks/t1/todos': [] });
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add dependency' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Add dependency' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Write tests' }));
    await waitFor(() => expect(bodies(fetchMock, 'POST', '/api/dependencies')).toEqual([{ fromTaskId: 't1', taskId: 't2' }]));
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
    await waitFor(() => expect(screen.getByRole('button', { pressed: true, name: /\d/ })).toHaveAttribute('data-date', expected));
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
