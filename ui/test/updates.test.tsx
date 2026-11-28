import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useErrorLine } from '../src/api/hooks';
import { UpdatesTab, type Actor } from '../src/screens/project/UpdatesTab';
import { Segmented } from '../src/ui';
import { day, update } from './fixtures/project';
import { mockFetch, type RouteHandler } from './setup';

const year = new Date().getFullYear();

const rows = [
  update({
    id: 'e-move',
    kind: 'dates_changed',
    before: { start: `${year}-11-20`, end: `${year}-11-28` },
    after: { start: `${year}-11-20`, end: `${year}-12-03`, conflicts: ['Review the API starts before it ends'] },
    reason: 'Waiting on the signing key',
    label: 'Signed npm 1.0 release',
  }),
  update({ id: 'e-cap', kind: 'captured', actor: 'you', entity: 'inbox', label: 'Call the bank', after: { text: 'Call the bank' } }),
  update({ id: 'e-old', kind: 'status_changed', actor: 'you', before: { status: 'doing' }, after: { status: 'review' }, label: 'Draft the spec', day: day(-1) }),
];

function Line() {
  return <output data-testid="line">{useErrorLine()}</output>;
}

/** The filter lives in the project header; this stands in for it. */
function Harness() {
  const [actor, setActor] = useState<Actor>('all');
  return (
    <>
      <Segmented
        label="Filter updates"
        options={[
          { value: 'all', label: 'All' },
          { value: 'agents', label: 'Agents' },
          { value: 'you', label: 'You' },
        ]}
        value={actor}
        onChange={setActor}
      />
      <UpdatesTab slug="ship" actor={actor} />
    </>
  );
}

function setup(extra: Record<string, RouteHandler> = {}) {
  const fetchMock = mockFetch({
    '/api/updates': ({ url }: { url: string }) => (new URL(url, 'http://x').searchParams.get('actor') === 'agents' ? [rows[0]] : rows),
    ...extra,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Harness />
      <Line />
    </QueryClientProvider>,
  );
  return fetchMock;
}

describe('Updates tab', () => {
  it('writes a moved task as a sentence with the reason and conflicts in risk tone', async () => {
    setup();
    const row = (await screen.findByText('Signed npm 1.0 release')).closest('li')!;
    expect(within(row).getByText('Codex')).toBeInTheDocument();
    expect(within(row).getByText('moved')).toBeInTheDocument();
    expect(within(row).getByText('Nov 28 → Dec 3')).toBeInTheDocument();
    expect(within(row).getByText('Waiting on the signing key')).toBeInTheDocument();
    expect(within(row).getByText('Review the API starts before it ends').closest('.up-risk')).not.toBeNull();
  });

  it('groups by day with Today and Yesterday headings', async () => {
    setup();
    await screen.findByText('Today');
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    const row = screen.getByText('Draft the spec').closest('li')!;
    expect(within(row).getByText('changed the status of')).toBeInTheDocument();
    expect(within(row).getByText('Doing → Review')).toBeInTheDocument();
  });

  it('the Agents filter refetches with actor=agents', async () => {
    const fetchMock = setup();
    await screen.findByText('Signed npm 1.0 release');
    fireEvent.click(screen.getByRole('radio', { name: 'Agents' }));
    await waitFor(() => expect(screen.queryByText('"Call the bank"')).toBeNull());
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('actor=agents') && u.includes('project=ship'))).toBe(true);
  });

  it('Revert posts to the event revert route', async () => {
    const fetchMock = setup({ 'POST /api/events/e-move/revert': { ok: true } });
    const row = (await screen.findByText('Signed npm 1.0 release')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Revert' }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]) === '/api/events/e-move/revert' && (c[1] as RequestInit).method === 'POST')).toBe(true));
  });

  it('a 409 shows the conflict line on that row', async () => {
    setup({ 'POST /api/events/e-move/revert': () => Response.json({ error: { code: 'conflict', message: 'stale' } }, { status: 409 }) });
    const row = (await screen.findByText('Signed npm 1.0 release')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Revert' }));
    expect(await within(row).findByText('Changed since — reload to see the latest')).toBeInTheDocument();
  });

  it('captured rows have no Revert', async () => {
    setup();
    const row = (await screen.findByText('"Call the bank"')).closest('li')!;
    expect(within(row).queryByRole('button', { name: 'Revert' })).toBeNull();
  });

  it('a refused revert shows one message, not also the shared line', async () => {
    setup({ 'POST /api/events/e-move/revert': () => Response.json({ error: { code: 'conflict', message: 'stale' } }, { status: 409 }) });
    const row = (await screen.findByText('Signed npm 1.0 release')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Revert' }));
    await within(row).findByText('Changed since — reload to see the latest');
    expect(screen.getByTestId('line')).toBeEmptyDOMElement();
  });

  it('shows an avatar initial per actor: agents in the accent, You neutral', async () => {
    setup();
    const agent = (await screen.findByText('Signed npm 1.0 release')).closest('li')!;
    expect(agent.querySelector('.up-avatar')).toHaveTextContent('C');
    expect(agent.querySelector('.up-avatar')).not.toHaveClass('is-you');
    const you = screen.getByText('"Call the bank"').closest('li')!;
    expect(you.querySelector('.up-avatar')).toHaveTextContent('Y');
    expect(you.querySelector('.up-avatar')).toHaveClass('is-you');
  });

  it('pluralises the planned counts', async () => {
    mockFetch({
      '/api/updates': [update({ id: 'e-plan', kind: 'planned', label: 'M4 · Launch', after: { tasks: 1, todos: 1, dependencies: 1 } }), update({ id: 'e-plan2', kind: 'planned', label: 'M5', after: { tasks: 6, todos: 28, dependencies: 5 } })],
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <UpdatesTab slug="ship" actor="all" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('1 task · 1 to-do · 1 dependency')).toBeInTheDocument();
    expect(screen.getByText('6 tasks · 28 to-dos · 5 dependencies')).toBeInTheDocument();
  });

  it('shows an empty state when there is no activity', async () => {
    mockFetch({ '/api/updates': [] });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <UpdatesTab slug="ship" actor="all" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('No activity yet')).toBeInTheDocument();
  });
});
