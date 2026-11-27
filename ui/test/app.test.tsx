import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/App';
import { mockFetch } from './setup';

function setup(path: string, searchPath = '') {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  mockFetch({
    '/api/projects': [],
    '/api/inbox': { count: 0, items: [] },
    '/api/overview': { paused: [], archived: [], count: 0 },
    '/api/settings': { appearance: 'dark', accent: '#D9892B' },
  });
  const { hook, searchHook } = memoryLocation({ path, searchPath });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={hook} searchHook={searchHook}>
        <App />
      </Router>
    </QueryClientProvider>,
  );
}

describe('App routes', () => {
  it('routes to stubs and applies the theme from settings', async () => {
    setup('/inbox');
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Inbox' })).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'));
  });

  it('opens the pane from the query on project routes', () => {
    setup('/p/x/list', 'task=t1');
    expect(screen.getByRole('region', { name: 'Project' })).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Task' })).toBeInTheDocument();
  });
});
