import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { describe, expect, it } from 'vitest';
import { ProjectSettings } from '../src/screens/project/ProjectSettings';
import { tree } from './fixtures/projects';
import { mockFetch } from './setup';

function mount(data: typeof tree = tree) {
  const fn = mockFetch({ '/api/projects/alpha': data, 'PATCH /api/projects/alpha': data.project });
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

const patchBody = (fn: ReturnType<typeof mockFetch>) => {
  const call = fn.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === 'PATCH');
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

  it('puts General, Links and New tasks left; Areas, Labels and Archive right', async () => {
    mount();
    await screen.findByRole('link', { name: 'Alpha' });
    const cols = document.querySelectorAll('.ps-col');
    expect(cols).toHaveLength(2);
    for (const name of ['General', 'Links', 'New tasks']) expect(within(cols[0] as HTMLElement).getByRole('region', { name })).toBeInTheDocument();
    for (const name of ['Areas', 'Labels', 'Archive']) expect(within(cols[1] as HTMLElement).getByRole('region', { name })).toBeInTheDocument();
  });

  it('calls the priority default Priority', async () => {
    mount();
    expect(await screen.findByRole('radiogroup', { name: 'Priority' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Default priority' })).toBeNull();
  });

  it('shows a template colour outside the palette as the selected swatch', async () => {
    mount({ ...tree, project: { ...tree.project, color: '#123456' } });
    const group = await screen.findByRole('radiogroup', { name: 'Colour' });
    const checked = within(group).getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveAttribute('aria-label', 'Current colour');
  });

  it('marks the palette swatch of the current colour as selected', async () => {
    mount();
    expect(await screen.findByRole('radio', { name: 'Indigo' })).toHaveAttribute('aria-checked', 'true');
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
  });

  it('labels are chips with a + button that adds one', async () => {
    const fn = mount();
    const user = userEvent.setup();
    expect(await screen.findByText('ops')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add label' }));
    await user.type(screen.getByRole('textbox', { name: 'New label' }), 'blocker{Enter}');
    await waitFor(() => expect(patchBody(fn)).toEqual({ labels: ['ops', 'blocker'] }));
  });

  it('removes a label', async () => {
    const fn = mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove ops' }));
    await waitFor(() => expect(patchBody(fn)).toEqual({ labels: [] }));
  });

  it('Archive sits in its own panel row and asks before archiving', async () => {
    mount();
    const panel = await screen.findByRole('region', { name: 'Archive' });
    expect(within(panel).getByRole('heading', { name: 'Archive project' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Archive project' })).toHaveTextContent('Archive');
  });
});
