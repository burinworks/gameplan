import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { describe, expect, it, vi } from 'vitest';
import { SearchPalette } from '../src/search/SearchPalette';
import { searchHits } from './fixtures/settings';
import { mockFetch } from './setup';

function setup() {
  mockFetch({
    '/api/search': ({ url }: { url: string }) => searchHits[new URL(url, 'http://x').searchParams.get('q') ?? ''] ?? [],
  });
  const onClose = vi.fn();
  const loc = memoryLocation({ path: '/', record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={loc.hook} searchHook={loc.searchHook}>
        <SearchPalette onClose={onClose} />
      </Router>
    </QueryClientProvider>,
  );
  return { onClose, loc };
}

describe('SearchPalette', () => {
  it('groups hits by type and Enter opens the task pane', async () => {
    const { onClose, loc } = setup();
    const input = screen.getByRole('textbox', { name: 'Search' });
    expect(input).toHaveFocus();
    await userEvent.type(input, 'npm');
    expect(await screen.findByText('Publish npm package')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(loc.history?.at(-1)).toContain('/p/npm-release/timeline?task=t9');
    expect(onClose).toHaveBeenCalled();
  });

  it('says when nothing matches', async () => {
    setup();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search' }), 'zzzz');
    expect(await screen.findByText('No matches for "zzzz"')).toBeInTheDocument();
  });

  it('shows nothing for an empty query and closes on Escape', async () => {
    const { onClose } = setup();
    expect(screen.queryByText(/No matches/)).toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
