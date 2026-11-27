import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { describe, expect, it } from 'vitest';
import { Home } from '../src/screens/home/Home';
import { PlanPicker } from '../src/screens/home/PlanPicker';
import { homeFixture, timelineFixture } from './fixtures/home';
import { mockFetch } from './setup';

function wrap(ui: React.ReactNode) {
  const { hook } = memoryLocation({ path: '/' });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>{ui}</Router>
    </QueryClientProvider>,
  );
}

const routes = (home: unknown = homeFixture) => ({
  '/api/home': home,
  '/api/timeline': timelineFixture,
  '/api/settings': { week_start: 'mon', show_weekends: true },
  'POST /api/inbox': { id: 'i1', text: 'x' },
  'PUT /api/day-plan/2026-11-27': [],
});

describe('Home', () => {
  it('shows the header date and My plan rows in order with the when chip', async () => {
    mockFetch(routes());
    wrap(<Home />);
    expect(await screen.findByRole('heading', { name: 'Friday, 27 November' })).toBeInTheDocument();
    const panel = screen.getByRole('region', { name: 'My plan' });
    const rows = within(panel).getAllByTestId('plan-row');
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => within(r).getByTestId('plan-n').textContent)).toEqual(['1', '2', '3']);
    expect(within(rows[0]!).getByText('after standup')).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/↳ Outline is done/)).toBeInTheDocument();
  });

  it('shows the needs review count and an empty line when none', async () => {
    mockFetch(routes());
    const { unmount } = wrap(<Home />);
    const panel = await screen.findByRole('region', { name: 'Needs review' });
    expect(within(panel).getByText('2')).toBeInTheDocument();
    unmount();
    mockFetch(routes({ ...homeFixture, needsReview: [] }));
    wrap(<Home />);
    expect(await screen.findByText('Nothing to review')).toBeInTheDocument();
  });

  it('captures on Enter, clears, and keeps focus', async () => {
    const f = mockFetch(routes());
    wrap(<Home />);
    const input = await screen.findByPlaceholderText('Capture…');
    input.focus();
    fireEvent.change(input, { target: { value: 'call the bank' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(input).toHaveValue(''));
    const call = f.mock.calls.find(([u, i]) => String(u).includes('/api/inbox') && (i as RequestInit | undefined)?.method === 'POST')!;
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({ text: 'call the bank' });
    expect(input).toHaveFocus();
  });

  it('hides Rescheduled when empty and has no subtitle copy', async () => {
    mockFetch(routes({ ...homeFixture, rescheduled: [] }));
    const { container } = wrap(<Home />);
    await screen.findByRole('region', { name: 'Needs review' });
    expect(screen.queryByRole('region', { name: 'Rescheduled' })).toBeNull();
    expect(container.textContent).not.toMatch(/Create a|here or ask|!/);
  });
});

describe('PlanPicker', () => {
  it('disables the 4th pick and sends the plan', async () => {
    const f = mockFetch(routes());
    let closed = false;
    wrap(<PlanPicker onClose={() => (closed = true)} />);
    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes).toHaveLength(7);
    for (const b of boxes.slice(0, 3)) fireEvent.click(b);
    expect(boxes[3]).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(boxes[3]!);
    expect(boxes[3]).toHaveAttribute('aria-checked', 'false');
    fireEvent.change(screen.getAllByPlaceholderText('when…')[0]!, { target: { value: 'after standup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    await waitFor(() => expect(closed).toBe(true));
    const call = f.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === 'PUT')!;
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({
      items: [{ taskId: 't1', when: 'after standup' }, { taskId: 't2', when: null }, { taskId: 't3', when: null }],
    });
  });
});
