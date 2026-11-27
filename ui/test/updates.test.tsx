import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UpdatesTab } from '../src/screens/project/UpdatesTab';
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

function setup(extra: Record<string, RouteHandler> = {}) {
  const fetchMock = mockFetch({
    '/api/updates': ({ url }: { url: string }) => (new URL(url, 'http://x').searchParams.get('actor') === 'agents' ? [rows[0]] : rows),
    ...extra,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <UpdatesTab slug="ship" />
    </QueryClientProvider>,
  );
  return fetchMock;
}

describe('Updates tab', () => {
  it('writes a moved task as a sentence with the reason and conflicts in risk tone', async () => {
    setup();
    const text = await screen.findByText('Moved Signed npm 1.0 release Nov 28 → Dec 3');
    const row = text.closest('li')!;
    expect(within(row).getByText('Codex')).toBeInTheDocument();
    expect(within(row).getByText('Waiting on the signing key')).toBeInTheDocument();
    expect(within(row).getByText('Review the API starts before it ends')).toHaveClass('up-risk');
  });

  it('groups by day with Today and Yesterday headings', async () => {
    setup();
    await screen.findByText('Today');
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('Draft the spec: Doing → Review')).toBeInTheDocument();
  });

  it('the Agents filter refetches with actor=agents', async () => {
    const fetchMock = setup();
    await screen.findByText('Moved Signed npm 1.0 release Nov 28 → Dec 3');
    fireEvent.click(screen.getByRole('radio', { name: 'Agents' }));
    await waitFor(() => expect(screen.queryByText('Captured "Call the bank"')).toBeNull());
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('actor=agents') && u.includes('project=ship'))).toBe(true);
  });

  it('Revert posts to the event revert route', async () => {
    const fetchMock = setup({ 'POST /api/events/e-move/revert': { ok: true } });
    const row = (await screen.findByText(/^Moved Signed npm/)).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Revert' }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]) === '/api/events/e-move/revert' && (c[1] as RequestInit).method === 'POST')).toBe(true));
  });

  it('a 409 shows the conflict line on that row', async () => {
    setup({ 'POST /api/events/e-move/revert': () => Response.json({ error: { code: 'conflict', message: 'stale' } }, { status: 409 }) });
    const row = (await screen.findByText(/^Moved Signed npm/)).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Revert' }));
    expect(await within(row).findByText('Changed since — reload to see the latest')).toBeInTheDocument();
  });

  it('captured rows have no Revert', async () => {
    setup();
    const row = (await screen.findByText('Captured "Call the bank"')).closest('li')!;
    expect(within(row).queryByRole('button', { name: 'Revert' })).toBeNull();
  });
});
