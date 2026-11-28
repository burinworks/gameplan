import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { describe, expect, it } from 'vitest';
import { ProjectSettings } from '../src/screens/project/ProjectSettings';
import { PALETTE } from '../src/sheets/NewProject';
import { tree } from './fixtures/projects';
import { mockFetch } from './setup';

type Tree = Omit<typeof tree, 'milestones'> & { milestones: unknown[] };
const milestone = (id: string, name: string, color: string, due: string | null, tasks: number, status = 'active') => ({
  id,
  projectId: 'p1',
  name,
  due,
  status,
  color,
  tasks: Array.from({ length: tasks }, (_, i) => ({ id: `${id}-t${i}` })),
});
const withProject = (over: Record<string, unknown>) => ({ ...tree, project: { ...tree.project, ...over } }) as unknown as Tree;
const withMilestones: Tree = { ...tree, milestones: [milestone('m1', 'Beta', '#6E7CF5', '2026-12-04', 2), milestone('m2', 'Launch', '#123456', null, 1)] };

function mount(data: Tree = tree) {
  const fn = mockFetch({
    '/api/projects/alpha': data,
    'PATCH /api/projects/alpha': data.project,
    'PATCH /api/milestones/m1': { id: 'm1' },
  });
  const { hook } = memoryLocation({ path: '/p/alpha/settings' });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>
        <ProjectSettings slug="alpha" />
      </Router>
    </QueryClientProvider>,
  );
  return fn;
}

const patchBody = (fn: ReturnType<typeof mockFetch>, path = '/api/projects/alpha') => {
  const call = fn.mock.calls.find(([u, i]) => String(u) === path && (i as RequestInit | undefined)?.method === 'PATCH');
  return call ? JSON.parse(String((call[1] as RequestInit).body)) : undefined;
};

describe('ProjectSettings design', () => {
  it('header is a breadcrumb linking back to the project', async () => {
    mount();
    const crumb = await screen.findByRole('link', { name: 'Alpha' });
    expect(crumb).toHaveAttribute('href', '/p/alpha/timeline');
    const h1 = crumb.closest('h1') as HTMLElement;
    expect(within(h1).getByText('Settings')).toBeInTheDocument();
  });

  it('puts General and Links left; Milestones and Areas right; no colour, labels or vault note', async () => {
    mount();
    await screen.findByRole('link', { name: 'Alpha' });
    const cols = document.querySelectorAll('.ps-col');
    expect(cols).toHaveLength(2);
    for (const name of ['General', 'Links']) expect(within(cols[0] as HTMLElement).getByRole('region', { name })).toBeInTheDocument();
    for (const name of ['Milestones', 'Areas']) expect(within(cols[1] as HTMLElement).getByRole('region', { name })).toBeInTheDocument();
    for (const name of ['New tasks', 'Labels', 'Archive']) expect(screen.queryByRole('region', { name })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Colour' })).toBeNull();
    expect(screen.queryByText('Vault note')).toBeNull();
    expect(screen.queryByText('GitHub')).toBeNull();
  });

  it('keeps the new-task defaults in General', async () => {
    mount();
    const general = await screen.findByRole('region', { name: 'General' });
    expect(within(general).getByRole('radiogroup', { name: 'Priority' })).toBeInTheDocument();
    expect(within(general).getByRole('radiogroup', { name: 'Done by' })).toBeInTheDocument();
  });

  it('status is a Pause button when active and a Resume button when paused; no Done or Dropped', async () => {
    const fn = mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(patchBody(fn)).toEqual({ status: 'paused' }));
    expect(screen.queryByRole('radio', { name: 'Done' })).toBeNull();
    expect(screen.queryByText('Dropped')).toBeNull();
  });

  it('a paused project offers Resume', async () => {
    const fn = mount(withProject({ status: 'paused' }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(patchBody(fn)).toEqual({ status: 'active' }));
  });

  it('Repository is one field showing the GitHub value and saving owner/repo as github', async () => {
    const fn = mount(withProject({ github: 'acme/old', repo: '~/code/old' }));
    const user = userEvent.setup();
    const input = await screen.findByRole('textbox', { name: 'Repository' });
    expect(input).toHaveValue('acme/old');
    await user.clear(input);
    await user.type(input, 'acme/new');
    await user.tab();
    await waitFor(() => expect(patchBody(fn)).toEqual({ github: 'acme/new' }));
  });

  it('Repository saves a non-GitHub address as repo and clears github', async () => {
    const fn = mount(withProject({ github: 'acme/old' }));
    const user = userEvent.setup();
    const input = await screen.findByRole('textbox', { name: 'Repository' });
    await user.clear(input);
    await user.type(input, 'https://gitlab.com/acme/new');
    await user.tab();
    await waitFor(() => expect(patchBody(fn)).toEqual({ repo: 'https://gitlab.com/acme/new', github: null }));
  });

  it('lists milestones with colour, due and task count', async () => {
    mount(withMilestones);
    const list = await screen.findByRole('list', { name: 'Milestones' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Beta');
    expect(rows[0]).toHaveTextContent('Dec 4');
    expect(rows[0]).toHaveTextContent('2 tasks');
    expect(rows[1]).toHaveTextContent('No date');
    expect(rows[1]).toHaveTextContent('1 task');
  });

  it('says so when there are no milestones', async () => {
    mount();
    expect(await screen.findByText(/No milestones yet/)).toBeInTheDocument();
  });

  it('changes a milestone colour from the palette popover', async () => {
    const fn = mount(withMilestones);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Colour of Beta' }));
    const pop = screen.getByRole('dialog', { name: 'Colour of Beta' });
    expect(within(pop).getByRole('radio', { name: 'Indigo' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(pop).getByRole('radio', { name: 'Teal' }));
    await waitFor(() => expect(patchBody(fn, '/api/milestones/m1')).toEqual({ color: PALETTE[2].hex }));
    expect(screen.queryByRole('dialog', { name: 'Colour of Beta' })).toBeNull();
  });

  it('shows a colour outside the palette as the selected swatch', async () => {
    mount(withMilestones);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Colour of Launch' }));
    const pop = screen.getByRole('dialog', { name: 'Colour of Launch' });
    const checked = within(pop).getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveAttribute('aria-label', 'Current colour');
  });

  it('Escape closes the colour popover without saving', async () => {
    const fn = mount(withMilestones);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Colour of Beta' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Colour of Beta' })).toBeNull();
    expect(patchBody(fn, '/api/milestones/m1')).toBeUndefined();
  });

  it('changes an area colour, sending the full areas list', async () => {
    const fn = mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Colour of Backend' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Colour of Backend' })).getByRole('radio', { name: 'Coral' }));
    await waitFor(() => expect(patchBody(fn)).toBeDefined());
    expect(patchBody(fn)).toEqual({
      areas: [
        { id: 'a1', name: 'Frontend', color: null },
        { id: 'a2', name: 'Backend', color: PALETTE[5].hex },
      ],
    });
  });

  it('calls the priority default Priority', async () => {
    mount();
    expect(await screen.findByRole('radiogroup', { name: 'Priority' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Default priority' })).toBeNull();
  });

  it('area rows show the task count and a drag handle; no up/down arrows', async () => {
    mount();
    expect(await screen.findByText('2 tasks')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reorder Frontend' })).toHaveAttribute('draggable', 'true');
    expect(screen.queryByRole('button', { name: /Move Frontend/ })).toBeNull();
  });

  it('reorders areas with the arrow keys on the handle', async () => {
    const fn = mount();
    const handle = await screen.findByRole('button', { name: 'Reorder Frontend' });
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    await waitFor(() => expect(patchBody(fn)).toBeDefined());
    expect(patchBody(fn).areas.map((a: { name: string }) => a.name)).toEqual(['Backend', 'Frontend']);
  });

  it('reorders areas by dropping the handle on another row', async () => {
    const fn = mount();
    const handle = await screen.findByRole('button', { name: 'Reorder Frontend' });
    const target = screen.getByRole('textbox', { name: 'Area Backend' }).closest('.ps-area') as HTMLElement;
    fireEvent.dragStart(handle, { dataTransfer: { setDragImage: () => undefined, effectAllowed: '' } });
    fireEvent.dragOver(target, { dataTransfer: {} });
    fireEvent.drop(target, { dataTransfer: {} });
    await waitFor(() => expect(patchBody(fn)).toBeDefined());
    expect(patchBody(fn).areas.map((a: { name: string }) => a.name)).toEqual(['Backend', 'Frontend']);
  });

  it('Add area opens a field and adds the area on Enter', async () => {
    const fn = mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add area' }));
    await user.type(screen.getByRole('textbox', { name: 'New area' }), 'Docs{Enter}');
    await waitFor(() => expect(patchBody(fn)).toBeDefined());
    expect(patchBody(fn).areas.map((a: { name: string }) => a.name)).toEqual(['Frontend', 'Backend', 'Docs']);
    // A new area gets the first palette colour no other area uses.
    expect(patchBody(fn).areas[2].color).toBe(PALETTE[0].hex);
  });

  it('Archive sits next to the status and asks before archiving', async () => {
    mount();
    const general = await screen.findByRole('region', { name: 'General' });
    const btn = within(general).getByRole('button', { name: 'Archive project' });
    expect(btn).toHaveTextContent('Archive');
    await userEvent.click(btn);
    expect(screen.getByRole('dialog', { name: 'Archive Alpha?' })).toBeInTheDocument();
  });
});
