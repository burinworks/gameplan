import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { describe, expect, it, vi } from 'vitest';
import { PausedArchived } from '../src/screens/archive/PausedArchived';
import { ProjectSettings } from '../src/screens/project/ProjectSettings';
import { NewProject, PALETTE } from '../src/sheets/NewProject';
import { overview, projectList, templates, tree } from './fixtures/projects';
import { mockFetch } from './setup';

function mount(ui: ReactNode, path = '/') {
  const { hook, searchHook, history } = memoryLocation({ path, record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={hook} searchHook={searchHook}>
        {ui}
      </Router>
    </QueryClientProvider>,
  );
  return { history };
}

const bodyOf = (fn: ReturnType<typeof mockFetch>, method: string, path: string) => {
  const call = fn.mock.calls.find(([u, i]) => String(u).startsWith(path) && (i?.method ?? 'GET') === method);
  return call ? JSON.parse(String(call[1]?.body)) : undefined;
};

describe('NewProject', () => {
  const routes = () => ({
    '/api/templates': templates,
    '/api/projects': projectList,
    'POST /api/projects': { slug: 'fresh', id: 'x' },
  });

  it('choosing a template posts template and startDate without areas', async () => {
    const fn = mockFetch(routes());
    const onClose = vi.fn();
    const { history } = mount(<NewProject onClose={onClose} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /Launch/ }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Spring');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const b = bodyOf(fn, 'POST', '/api/projects');
    expect(b).toMatchObject({ name: 'Spring', template: 'launch', startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(b.areas).toBeUndefined();
    expect(history?.at(-1)).toBe('/p/fresh/timeline');
  });

  it('blank posts typed area tokens and the first milestone', async () => {
    const fn = mockFetch(routes());
    mount(<NewProject onClose={() => {}} />);
    const user = userEvent.setup();
    await screen.findByRole('radio', { name: /Launch/ });
    await user.type(screen.getByRole('textbox', { name: 'Areas' }), 'AI{Enter}QA,');
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Fresh');
    await user.type(screen.getByRole('textbox', { name: 'First milestone' }), 'Kickoff');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(bodyOf(fn, 'POST', '/api/projects')).toBeDefined());
    const b = bodyOf(fn, 'POST', '/api/projects');
    expect(b.areas.map((a: { name: string }) => a.name)).toEqual(['AI', 'QA']);
    expect(b.firstMilestone).toMatchObject({ name: 'Kickoff' });
    expect(b.template).toBeUndefined();
  });

  it('colour defaults to a palette colour not used by existing projects', async () => {
    const fn = mockFetch(routes());
    mount(<NewProject onClose={() => {}} />);
    const user = userEvent.setup();
    const third = await screen.findByRole('radio', { name: PALETTE[2]!.name });
    await waitFor(() => expect(third).toHaveAttribute('aria-checked', 'true'));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Z');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(bodyOf(fn, 'POST', '/api/projects')).toBeDefined());
    expect(bodyOf(fn, 'POST', '/api/projects').color).toBe(PALETTE[2]!.hex);
  });
});

describe('NewProject template cards and areas', () => {
  const routes = () => ({
    '/api/templates': templates,
    '/api/projects': projectList,
    '/api/settings': {},
    'POST /api/projects': { slug: 'fresh', id: 'x' },
  });

  it('shows each template as a card with its milestone and task counts', async () => {
    mockFetch(routes());
    mount(<NewProject onClose={() => {}} />);
    const group = await screen.findByRole('radiogroup', { name: 'Start from' });
    expect(await within(group).findByRole('radio', { name: /Launch/ })).toHaveTextContent('4 milestones · 14 tasks');
    expect(within(group).getByRole('radio', { name: /Blank/ })).toHaveTextContent('Empty project');
    expect(within(group).getByRole('radio', { name: /Blank/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('a template prefills its areas, shows the milestone preview and keeps added areas', async () => {
    const fn = mockFetch(routes());
    mount(<NewProject onClose={() => {}} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /Report/ }));
    expect(screen.getByRole('button', { name: 'Remove Research' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Design' })).toBeInTheDocument();
    expect(screen.getByText(/^Outline [A-Z][a-z]{2} \d+ · Draft .* · Final /)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Areas' }), 'Review{Enter}');
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Q1');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(bodyOf(fn, 'POST', '/api/projects')).toBeDefined());
    const b = bodyOf(fn, 'POST', '/api/projects');
    expect(b.template).toBe('report');
    expect(b.areas).toEqual([{ name: 'Review' }]);
  });

  it('switching back to Blank drops the template areas', async () => {
    mockFetch(routes());
    mount(<NewProject onClose={() => {}} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /Report/ }));
    await user.click(screen.getByRole('radio', { name: /Blank/ }));
    expect(screen.queryByRole('button', { name: 'Remove Research' })).toBeNull();
  });
});

describe('ProjectSettings', () => {
  it('renaming an area PATCHes the full areas array with ids', async () => {
    const fn = mockFetch({ '/api/projects/alpha': tree, 'PATCH /api/projects/alpha': tree.project });
    mount(<ProjectSettings slug="alpha" />);
    const user = userEvent.setup();
    const input = await screen.findByRole('textbox', { name: 'Area Frontend' });
    await user.clear(input);
    await user.type(input, 'Web');
    await user.tab();
    await waitFor(() => expect(bodyOf(fn, 'PATCH', '/api/projects/alpha')).toBeDefined());
    expect(bodyOf(fn, 'PATCH', '/api/projects/alpha')).toEqual({
      areas: [
        { id: 'a1', name: 'Web', color: null },
        { id: 'a2', name: 'Backend', color: null },
      ],
    });
  });

  it('disables deleting an area that has tasks', async () => {
    mockFetch({ '/api/projects/alpha': tree });
    mount(<ProjectSettings slug="alpha" />);
    expect(await screen.findByRole('button', { name: 'Delete Frontend' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Backend' })).toBeEnabled();
  });

  it('a refused text save restores the server value', async () => {
    mockFetch({ '/api/projects/alpha': tree, 'PATCH /api/projects/alpha': () => Response.json({ error: { code: 'forbidden', message: 'no' } }, { status: 403 }) });
    mount(<ProjectSettings slug="alpha" />);
    const user = userEvent.setup();
    const input = (await screen.findByRole('textbox', { name: 'Name' })) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'Rejected');
    await user.tab();
    await waitFor(() => expect(input.value).toBe('Alpha'));
  });

  it('labels the executor default Done by', async () => {
    mockFetch({ '/api/projects/alpha': tree });
    mount(<ProjectSettings slug="alpha" />);
    expect(await screen.findByRole('radiogroup', { name: 'Done by' })).toBeInTheDocument();
    expect(screen.queryByText('Default executor')).toBeNull();
  });

  it('archive asks first, then posts', async () => {
    const fn = mockFetch({ '/api/projects/alpha': tree, 'POST /api/archive': { ok: true } });
    mount(<ProjectSettings slug="alpha" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Archive project' }));
    expect(bodyOf(fn, 'POST', '/api/archive')).toBeUndefined();
    const sheet = screen.getByRole('dialog', { name: 'Archive Alpha?' });
    await user.click(within(sheet).getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(bodyOf(fn, 'POST', '/api/archive')).toEqual({ entity: 'project', id: 'p1' }));
  });
});

describe('PausedArchived', () => {
  it('has a page title and per-section empty states', async () => {
    mockFetch({ '/api/overview': { paused: [], archived: [], count: 0 } });
    mount(<PausedArchived />);
    expect(await screen.findByRole('heading', { name: 'Paused & archived' })).toBeInTheDocument();
    expect(await screen.findByText('Nothing paused')).toBeInTheDocument();
    expect(screen.getByText('Nothing archived')).toBeInTheDocument();
  });

  it('writes counts and the archive date in full', async () => {
    const one = { ...overview.archived[0]!, tasks: 1, milestones: 1 };
    mockFetch({ '/api/overview': { ...overview, archived: [one] } });
    mount(<PausedArchived />);
    expect(await screen.findByText('1 task · 1 milestone')).toBeInTheDocument();
    expect(screen.getByText(/^Archived Nov 10/)).toBeInTheDocument();
    expect(screen.getByText(/^Paused Nov 20/)).toBeInTheDocument();
  });

  it('Resume PATCHes status active', async () => {
    const fn = mockFetch({ '/api/overview': overview, 'PATCH /api/projects/side': {} });
    mount(<PausedArchived />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(bodyOf(fn, 'PATCH', '/api/projects/side')).toEqual({ status: 'active' }));
  });

  it('Restore posts entity and id', async () => {
    const fn = mockFetch({ '/api/overview': overview, 'POST /api/restore': { ok: true } });
    mount(<PausedArchived />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(bodyOf(fn, 'POST', '/api/restore')).toEqual({ entity: 'project', id: 'p3' }));
    expect(screen.getByText('7 tasks · 2 milestones')).toBeInTheDocument();
  });

  it('archived chip reflects the real status', async () => {
    const row = (id: string, name: string, status: string) => ({ ...overview.archived[0]!, id, slug: id, name, status });
    mockFetch({ '/api/overview': { ...overview, archived: [row('d', 'Dn', 'done'), row('x', 'Dr', 'dropped'), row('a', 'Ac', 'active')] } });
    mount(<PausedArchived />);
    await screen.findByText('Ac');
    const chips = document.querySelectorAll('.gp-chip');
    expect([...chips].map((c) => c.textContent)).toEqual(['Done', 'Dropped']);
  });
});
