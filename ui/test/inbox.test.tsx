import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { describe, expect, it } from 'vitest';
import type { EventRow } from '../src/api/types';
import { useErrorLine } from '../src/api/hooks';
import { undoStack } from '../src/api/live';
import { Inbox } from '../src/screens/inbox/Inbox';
import { inboxItems, inboxPayload, projects, taskHits } from './fixtures/inbox';
import { mockFetch } from './setup';

function ErrorLine() {
  const e = useErrorLine();
  return e ? <div role="alert">{e}</div> : null;
}

function setup(routes: Parameters<typeof mockFetch>[0] = {}, items = inboxItems) {
  const fetchFn = mockFetch({
    '/api/inbox': inboxPayload(items),
    '/api/projects': projects,
    '/api/search': taskHits,
    'POST /api/inbox/i1/triage': { item: { id: 'i1' } },
    'POST /api/inbox/i2/triage': { item: { id: 'i2' } },
    'POST /api/inbox/i4/triage': { item: { id: 'i4' } },
    'POST /api/events/ev-i1/revert': { ok: true },
    'POST /api/events/ev-cap/revert': { ok: true },
    ...routes,
  });
  const loc = memoryLocation({ path: '/inbox', record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={loc.hook}>
        <ErrorLine />
        <Inbox />
      </Router>
    </QueryClientProvider>,
  );
  return { fetchFn, loc };
}

const ev = (id: string, entityId: string, kind: string, batchId: string): EventRow =>
  ({ id, entityId, kind, batchId, actor: 'you', entity: 'inbox_item', at: new Date().toISOString() }) as unknown as EventRow;
const reverts = (fn: ReturnType<typeof mockFetch>) => fn.mock.calls.map(([u]) => String(u)).filter((u) => u.endsWith('/revert'));

const posts = (fn: ReturnType<typeof mockFetch>) =>
  fn.mock.calls
    .filter(([, i]) => (i as RequestInit | undefined)?.method === 'POST')
    .map(([u, i]) => [String(u), JSON.parse(String((i as RequestInit).body))]);

describe('Inbox', () => {
  it('lists items with actor and age', async () => {
    setup();
    expect(await screen.findAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('You · 2h')).toBeInTheDocument();
    expect(screen.getByText('claude-code · 5h')).toBeInTheDocument();
    expect(screen.getByText('اشتري الحليب')).toHaveAttribute('dir', 'auto');
  });

  it('shows the empty state', async () => {
    setup({}, []);
    expect(await screen.findByText('Inbox is empty')).toBeInTheDocument();
  });

  it('dismisses with an undo line', async () => {
    const { fetchFn } = setup();
    const row = (await screen.findByText('Call the landlord about the lease')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(posts(fetchFn)).toContainEqual(['/api/inbox/i1/triage', { as: 'dismiss' }]));
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.queryByText('Call the landlord about the lease')).not.toBeInTheDocument();
  });

  it('adds as a to-do to a searched task', async () => {
    const { fetchFn } = setup();
    const row = (await screen.findByText('Draft release notes')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Add as to-do' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Find a task' }), 'wire');
    await userEvent.click(await screen.findByRole('menuitem', { name: /Wire the sync client/ }));
    await waitFor(() => expect(posts(fetchFn)).toContainEqual(['/api/inbox/i4/triage', { as: 'todo', taskId: 't1' }]));
  });

  it('makes a task by navigating to the new-task pane', async () => {
    const { loc } = setup();
    const row = (await screen.findByText('Draft release notes')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Make task' }));
    expect(await screen.findByText('MCP pipe')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Beta' }));
    const url = loc.history!.at(-1)!;
    expect(url).toMatch(/^\/p\/gameplan\/timeline\?/);
    expect(url).toContain('new=task');
    expect(url).toContain('milestone=g2');
    expect(url).toContain('inbox=i4');
    expect(url).toContain('title=Draft+release+notes');
  });

  it('keeps the row and shows the conflict line on a 409', async () => {
    setup({ 'POST /api/inbox/i1/triage': () => Response.json({ error: { code: 'conflict', message: 'already triaged' } }, { status: 409 }) });
    const row = (await screen.findByText('Call the landlord about the lease')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByText('Changed since — reload to see the latest')).toBeInTheDocument();
    expect(screen.getByText('Call the landlord about the lease')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('captures text with Enter', async () => {
    const { fetchFn } = setup({ 'POST /api/inbox': { id: 'i9', text: 'Buy stamps', by: 'you', at: new Date().toISOString() } });
    await screen.findAllByRole('listitem');
    await userEvent.type(screen.getByRole('textbox', { name: 'Capture' }), 'Buy stamps{Enter}');
    await waitFor(() => expect(posts(fetchFn)).toContainEqual(['/api/inbox', { text: 'Buy stamps' }]));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Capture' })).toHaveValue(''));
  });

  it('moves with arrow keys and dismisses with d', async () => {
    const { fetchFn } = setup();
    await screen.findAllByRole('listitem');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}d');
    await waitFor(() => expect(posts(fetchFn)).toContainEqual(['/api/inbox/i2/triage', { as: 'dismiss' }]));
  });

  it('undo reverts its own triage event, not a later capture', async () => {
    const { fetchFn } = setup();
    const row = (await screen.findByText('Call the landlord about the lease')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Dismiss' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    undoStack.push(ev('ev-i1', 'i1', 'triaged', 'b1'));
    undoStack.push(ev('ev-cap', 'i9', 'created', 'b2'));
    await waitFor(() => expect(reverts(fetchFn)).toEqual(['/api/events/ev-i1/revert']));
    expect(await screen.findByText('Call the landlord about the lease')).toBeInTheDocument();
  });

  it('undo uses an event that already arrived', async () => {
    const { fetchFn } = setup();
    const row = (await screen.findByText('Call the landlord about the lease')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Dismiss' }));
    undoStack.push(ev('ev-i1', 'i1', 'triaged', 'b1'));
    undoStack.push(ev('ev-cap', 'i9', 'created', 'b2'));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(reverts(fetchFn)).toEqual(['/api/events/ev-i1/revert']));
  });
});
