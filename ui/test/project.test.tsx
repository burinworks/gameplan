import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { beforeEach, describe, expect, it } from 'vitest';
import { isTab } from '../src/app/routes';
import { TimelineTab } from '../src/screens/project/TimelineTab';
import { ProjectScreen } from '../src/screens/project/ProjectScreen';
import { mockFetch } from './setup';
import { projectTree, settings, tasks } from './fixtures/project';

function setup(path = '/p/ship/timeline', searchPath = '') {
  const fetchMock = mockFetch({ '/api/projects/ship': projectTree, '/api/settings': settings });
  const loc = memoryLocation({ path, searchPath, record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={loc.hook} searchHook={loc.searchHook}>
        <Route path="/p/:slug/:tab?">{(p) => <ProjectScreen slug={p.slug!} tab={isTab(p.tab) ? p.tab : 'timeline'} />}</Route>
      </Router>
    </QueryClientProvider>,
  );
  return { ...loc, fetchMock };
}

const last = (h: string[] | undefined) => h![h!.length - 1];

beforeEach(() => {
  localStorage.clear();
});

describe('Project screen header', () => {
  it('title menu lists Settings, repository, vault note and Archive', async () => {
    setup();
    const title = await screen.findByRole('button', { name: 'Ship it' });
    fireEvent.click(title);
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Open repository' })).toHaveAttribute('href', 'https://github.com/acme/ship');
    expect(within(menu).getByRole('menuitem', { name: 'Open vault note' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Archive' })).toBeInTheDocument();
  });

  it('switching tabs updates the path and keeps the pane query', async () => {
    const { history } = setup('/p/ship/timeline', 'task=t-spec');
    await screen.findByRole('button', { name: 'Ship it' });
    fireEvent.click(screen.getByRole('radio', { name: 'List' }));
    expect(last(history)).toBe('/p/ship/list?task=t-spec');
    await screen.findByRole('region', { name: 'List' });
  });

  it('New task opens the pane on the first open milestone; New milestone is in the overflow menu', async () => {
    const { history } = setup();
    await screen.findByRole('button', { name: 'Ship it' });
    fireEvent.click(screen.getByRole('button', { name: 'New task' }));
    expect(last(history)).toBe('/p/ship/timeline?new=task&milestone=m1');
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New milestone' }));
    expect(last(history)).toBe('/p/ship/timeline?new=milestone');
  });
});

describe('Timeline tab', () => {
  it('renders a risk bar for the late task and a bad arrow', async () => {
    setup();
    await screen.findByRole('region', { name: 'Timeline' });
    const late = await waitFor(() => {
      const el = document.querySelector(`[data-bar="${tasks.release.id}"]`);
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(late).toHaveClass('is-risk');
    expect(document.querySelector(`[data-bar="${tasks.spec.id}"]`)).not.toHaveClass('is-risk');
    expect(document.querySelector(`[data-link="${tasks.spec.id}>${tasks.review.id}"]`)).toHaveAttribute('data-bad', 'true');
  });

  it('groups by milestone and collapses a group, remembering it', async () => {
    setup();
    await waitFor(() => expect(document.querySelector('.tl-group')).not.toBeNull());
    const alpha = document.querySelector('.tl-group') as HTMLElement;
    expect(document.querySelector(`[data-bar="${tasks.spec.id}"]`)).not.toBeNull();
    fireEvent.click(alpha);
    expect(document.querySelector(`[data-bar="${tasks.spec.id}"]`)).toBeNull();
    expect(JSON.parse(localStorage.getItem('gameplan.timeline.collapsed.ship')!)).toEqual(['m1']);
  });

  it('opening a bar sets ?task=', async () => {
    const { history } = setup();
    await screen.findByRole('region', { name: 'Timeline' });
    const bar = await waitFor(() => {
      const el = document.querySelector(`[data-bar="${tasks.spec.id}"]`);
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.click(bar);
    expect(last(history)).toBe('/p/ship/timeline?task=t-spec');
  });
});

describe('List tab', () => {
  it('shows a Review pill with the review tone, AI chip and group headings', async () => {
    setup('/p/ship/list');
    const row = (await screen.findByText('Review the API')).closest('tr')!;
    expect(within(row).getByText('Review')).toHaveClass('gp-chip--review');
    expect(within(row).getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText(/1\/5 to-dos/)).toBeInTheDocument();
    const done = screen.getByText('Write the docs').closest('tr')!;
    expect(within(done).getByText('Done')).toHaveClass('gp-chip--ok');
  });

  it('sorting by end reverses the order on the second click', async () => {
    setup('/p/ship/list');
    await screen.findByText('Review the API');
    const titles = () => within(screen.getAllByRole('rowgroup')[1]!).getAllByRole('button').map((b) => b.textContent);
    // Alpha rows: spec ends +2, release ends -3, review ends +9.
    expect(titles()).toEqual(['Draft the spec', 'Signed npm release', 'Review the API']);
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    expect(titles()).toEqual(['Signed npm release', 'Draft the spec', 'Review the API']);
    fireEvent.click(screen.getByRole('button', { name: /End/ }));
    expect(titles()).toEqual(['Review the API', 'Draft the spec', 'Signed npm release']);
  });

  it('clicking a row sets ?task=', async () => {
    const { history } = setup('/p/ship/list');
    fireEvent.click(await screen.findByText('Draft the spec'));
    expect(last(history)).toBe('/p/ship/list?task=t-spec');
  });
});

describe('Timeline collapse state per project', () => {
  it('reloads collapsed groups when the slug changes and never writes A under B', async () => {
    localStorage.setItem('gameplan.timeline.collapsed.other', JSON.stringify(['m2']));
    mockFetch({ '/api/projects/ship': projectTree, '/api/projects/other': projectTree, '/api/settings': settings });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <TimelineTab slug="ship" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(document.querySelector('.tl-group')).not.toBeNull());
    fireEvent.click(document.querySelector('.tl-group') as HTMLElement);
    expect(JSON.parse(localStorage.getItem('gameplan.timeline.collapsed.ship')!)).toEqual(['m1']);
    rerender(
      <QueryClientProvider client={qc}>
        <TimelineTab slug="other" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(document.querySelectorAll('.tl-group[aria-expanded="false"]')).toHaveLength(1));
    expect(document.querySelector('.tl-group[aria-expanded="false"]')).toHaveAttribute('aria-label', 'Launch');
    fireEvent.click(document.querySelector('.tl-group') as HTMLElement);
    expect(JSON.parse(localStorage.getItem('gameplan.timeline.collapsed.other')!)).toEqual(['m2', 'm1']);
    expect(JSON.parse(localStorage.getItem('gameplan.timeline.collapsed.ship')!)).toEqual(['m1']);
  });
});

describe('Archive from the title menu', () => {
  it('stays put and keeps the sheet when the archive fails', async () => {
    const { history } = setup();
    mockFetch({
      '/api/projects/ship': projectTree,
      '/api/settings': settings,
      'POST /api/archive': () => Response.json({ error: { code: 'forbidden', message: 'nope' } }, { status: 403 }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Ship it' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 20));
    expect(last(history)).toBe('/p/ship/timeline');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('goes home after the archive succeeds', async () => {
    const { history } = setup();
    mockFetch({ '/api/projects/ship': projectTree, '/api/settings': settings, 'POST /api/archive': { ok: true } });
    fireEvent.click(await screen.findByRole('button', { name: 'Ship it' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(last(history)).toBe('/'));
  });
});
