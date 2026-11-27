import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { describe, expect, it } from 'vitest';
import { Sidebar } from '../src/shell/Sidebar';
import { mockFetch } from './setup';

const projects = [
  {
    slug: 'gameplan',
    name: 'Gameplan',
    color: '#6E7CF5',
    status: 'active',
    progress: { pct: 38, done: 3, total: 8 },
    atRisk: 0,
    milestones: [{ id: 'g1', name: 'Alpha', due: '2026-12-01', status: 'active', missed: false }],
    nextMilestone: null,
  },
  {
    slug: 'mcp-pipe',
    name: 'MCP pipe',
    color: '#D9892B',
    status: 'active',
    progress: { pct: 60, done: 6, total: 10 },
    atRisk: 0,
    milestones: [
      { id: 'm1', name: 'Wire protocol', due: '2026-11-28', status: 'done', missed: false },
      { id: 'm2', name: 'Ship it', due: '2026-12-10', status: 'active', missed: false },
    ],
    nextMilestone: null,
  },
];

function setup(path: string) {
  mockFetch({
    '/api/projects': projects,
    '/api/inbox': { count: 4, items: [] },
    '/api/overview': { paused: [], archived: [], count: 5 },
    '/api/projects/mcp-pipe': { project: { id: 'p2', slug: 'mcp-pipe', name: 'MCP pipe', repo: null, github: 'acme/mcp-pipe', vaultNote: null }, milestones: [] },
  });
  const { hook } = memoryLocation({ path });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>
        <Sidebar onSearch={() => {}} onNewProject={() => {}} />
      </Router>
    </QueryClientProvider>,
  );
}

describe('Sidebar', () => {
  it('lists projects in order with percent, inbox count and paused & archived count', async () => {
    setup('/');
    const nav = screen.getByRole('navigation');
    const first = await screen.findByRole('link', { name: /Gameplan/ });
    const second = screen.getByRole('link', { name: /MCP pipe/ });
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(first).getByText('38%')).toBeInTheDocument();
    expect(await within(nav).findByText('4')).toBeInTheDocument();
    expect(await within(nav).findByText('5')).toBeInTheDocument();
    expect(screen.queryByText('Wire protocol')).not.toBeInTheDocument();
  });

  it('expands the current project milestones and keeps Settings last', async () => {
    setup('/p/mcp-pipe/timeline');
    expect(await screen.findByText('Wire protocol')).toBeInTheDocument();
    expect(screen.getByText('Ship it')).toBeInTheDocument();
    expect(screen.getByText('Nov 28')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links[links.length - 1]).toHaveTextContent('Settings');
    expect(screen.getByRole('button', { name: 'MCP pipe menu' })).toHaveAttribute('aria-haspopup', 'menu');
  });
});
