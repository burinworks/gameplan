import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { describe, expect, it } from 'vitest';
import type { ProjectTree } from '../src/api/types';
import { PausedArchived } from '../src/screens/archive/PausedArchived';
import { ListTab } from '../src/screens/project/ListTab';
import { Sidebar } from '../src/shell/Sidebar';
import { projectTree, settings } from './fixtures/project';
import { overview } from './fixtures/projects';
import { mockFetch } from './setup';

function mount(ui: ReactNode, path = '/') {
  const { hook, searchHook } = memoryLocation({ path });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={hook} searchHook={searchHook}>
        {ui}
      </Router>
    </QueryClientProvider>,
  );
}

describe('Sidebar colours', () => {
  const list = [
    {
      slug: 'ship',
      name: 'Ship it',
      color: '#6E7CF5',
      status: 'active',
      progress: { pct: 40, done: 2, total: 5 },
      atRisk: 0,
      milestones: [{ id: 'm1', name: 'Alpha', due: '2026-12-01', status: 'active', color: '#D9892B', missed: false }],
      nextMilestone: null,
    },
  ];

  it('project rows have no colour dot; milestones use their own colour', async () => {
    mockFetch({ '/api/projects': list, '/api/inbox': { count: 0, items: [] }, '/api/overview': { paused: [], archived: [], count: 0 }, '/api/projects/ship': projectTree });
    mount(<Sidebar onSearch={() => {}} onNewProject={() => {}} />, '/p/ship/timeline');
    const link = await screen.findByRole('link', { name: /Ship it/ });
    expect(link.querySelector('.gp-swatch')).toBeNull();
    expect(within(link).getByText('40%')).toBeInTheDocument();
    const ms = (await screen.findByText('Alpha')).closest('li') as HTMLElement;
    expect(ms.style.getPropertyValue('--ms')).toBe('#D9892B');
  });
});

describe('ListTab colours', () => {
  it('milestone diamonds use the milestone colour, not the project colour', async () => {
    const tree = {
      ...projectTree,
      milestones: projectTree.milestones.map((m, i) => ({ ...m, color: i === 0 ? '#3FA796' : '#B66AD0' })),
    } as ProjectTree;
    mockFetch({ '/api/projects/ship': tree, '/api/settings': settings });
    mount(<ListTab slug="ship" />, '/p/ship/list');
    const group = await screen.findByRole('button', { name: 'Collapse Alpha' });
    expect((group.querySelector('.pl-group__diamond') as HTMLElement).style.background).toBe('rgb(63, 167, 150)');
  });

  it('an area without its own colour takes its palette slot', async () => {
    const tree = {
      ...projectTree,
      project: { ...projectTree.project, areas: [{ id: 'a-x', name: 'Other', color: null, ord: 0, tasks: 0 }, { ...projectTree.project.areas[0]!, color: null }] },
      milestones: projectTree.milestones.map((m) => ({ ...m, tasks: m.tasks.map((t) => (t.area ? { ...t, area: { ...t.area, color: null } } : t)) })),
    } as ProjectTree;
    mockFetch({ '/api/projects/ship': tree, '/api/settings': settings });
    mount(<ListTab slug="ship" />, '/p/ship/list');
    const row = (await screen.findByText('Draft the spec')).closest('tr')!;
    expect((row.querySelector('.pl-area__swatch') as HTMLElement).style.background).toBe('var(--gp-p2)');
  });
});

describe('PausedArchived', () => {
  it('empty states use a pause glyph and an archive glyph in large tiles', async () => {
    mockFetch({ '/api/overview': { paused: [], archived: [], count: 0 } });
    mount(<PausedArchived />);
    const paused = (await screen.findByText('Nothing paused')).closest('.pa__empty') as HTMLElement;
    const archived = screen.getByText('Nothing archived').closest('.pa__empty') as HTMLElement;
    expect(paused.querySelector('[data-icon="paused"] svg')).toHaveAttribute('width', '24');
    expect(archived.querySelector('[data-icon="archived"] svg')).toHaveAttribute('width', '24');
  });

  it('paused rows carry no project colour', async () => {
    mockFetch({ '/api/overview': overview });
    mount(<PausedArchived />);
    const row = (await screen.findByText('Side')).closest('.pa__row') as HTMLElement;
    expect(row.querySelector('[style*="background"]:not(.pa__bar-fill)')).toBeNull();
  });
});
