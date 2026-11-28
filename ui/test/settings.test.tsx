import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { describe, expect, it, vi } from 'vitest';
import { useErrorLine } from '../src/api/hooks';
import { AppSettings } from '../src/screens/settings/AppSettings';
import { agentsFixture, settingsFixture } from './fixtures/settings';
import { mockFetch } from './setup';

function Line() {
  return <output data-testid="line">{useErrorLine()}</output>;
}

function setup(refuse = false) {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  let state = { ...settingsFixture };
  const fetchFn = mockFetch({
    '/api/settings': () => state,
    'PATCH /api/settings': ({ body }: { body: Record<string, unknown> }) => {
      if (refuse) return Response.json({ error: { code: 'invalid', message: 'bad value' } }, { status: 400 });
      const { mcp_token, ...rest } = body;
      state = { ...state, ...rest } as typeof state;
      if (mcp_token !== undefined) state.mcp_token_set = mcp_token !== null;
      return state;
    },
    '/api/agents': () => agentsFixture(new Date()),
    '/api/backup': { last: { file: 'gameplan-2026-11-27.json', at: new Date(Date.now() - 3 * 3_600_000).toISOString() } },
    'POST /api/backup': { last: { file: 'gameplan-2026-11-27.json', at: new Date().toISOString() } },
  });
  const { hook } = memoryLocation({ path: '/settings' });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>
        <AppSettings />
        <Line />
      </Router>
    </QueryClientProvider>,
  );
  return fetchFn;
}

const patches = (f: ReturnType<typeof mockFetch>) =>
  f.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH').map(([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>);

describe('AppSettings', () => {
  it('switches appearance to dark and applies the theme', async () => {
    const f = setup();
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('radio', { name: 'Dark' }));
    await waitFor(() => expect(patches(f)).toContainEqual({ appearance: 'dark' }));
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true'));
  });

  it('generates an MCP token, shows it once, then reads Token set', async () => {
    const f = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(patches(f).some((p) => typeof p.mcp_token === 'string')).toBe(true));
    const token = patches(f).find((p) => typeof p.mcp_token === 'string')!.mcp_token as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await screen.findByText(token)).toBeInTheDocument();
    expect(await screen.findByText('Token set')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('removes the token', async () => {
    const f = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Generate' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(patches(f)).toContainEqual({ mcp_token: null }));
    expect(await screen.findByRole('button', { name: 'Generate' })).toBeInTheDocument();
  });

  it('lists connected agents with time and calls', async () => {
    setup();
    const row = (await screen.findAllByText('Codex')).map((n) => n.closest('.gp-set__agent')).find(Boolean) as HTMLElement;
    expect(within(row).getByText('2 h ago')).toBeInTheDocument();
    expect(within(row).getByText('14 calls')).toBeInTheDocument();
  });

  it('shows the connect snippet per client and saves toggles', async () => {
    const f = setup();
    expect(await screen.findByText('claude mcp add --transport http gameplan http://127.0.0.1:4747/mcp')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'ChatGPT' }));
    expect(screen.getByText('Needs an HTTPS tunnel and an MCP token')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('switch', { name: 'Agents can archive' }));
    await waitFor(() => expect(patches(f)).toContainEqual({ agents_can_archive: true }));
  });

  it('backs up now and links exports', async () => {
    const f = setup();
    const link = await screen.findByRole('link', { name: 'JSON' });
    expect(link).toHaveAttribute('href', '/api/export?format=json');
    expect(screen.getByRole('link', { name: 'Markdown' })).toHaveAttribute('href', '/api/export?format=md');
    await userEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    await waitFor(() => expect(f.mock.calls.some(([u, i]) => String(u) === '/api/backup' && (i as RequestInit | undefined)?.method === 'POST')).toBe(true));
  });

  it('a refused write shows one message, not also the shared line', async () => {
    setup(true);
    await userEvent.click(await screen.findByRole('radio', { name: 'Dark' }));
    await screen.findByText('Bad value');
    expect(screen.getByTestId('line')).toBeEmptyDOMElement();
  });

  it('lays out General and Home left, Agents & MCP and Data right, with a running status', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Settings' });
    const cols = document.querySelectorAll('.gp-set__col');
    expect(cols).toHaveLength(2);
    expect(within(cols[0] as HTMLElement).getByRole('heading', { name: 'General' })).toBeInTheDocument();
    expect(within(cols[0] as HTMLElement).getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(within(cols[1] as HTMLElement).getByRole('heading', { name: 'Agents & MCP' })).toBeInTheDocument();
    expect(within(cols[1] as HTMLElement).getByRole('heading', { name: 'Data' })).toBeInTheDocument();
    expect(within(cols[1] as HTMLElement).getByText('Running')).toBeInTheDocument();
  });

  it('offers five accents, graphite included, and saves the chosen one', async () => {
    const f = setup();
    const group = await screen.findByRole('radiogroup', { name: 'Accent' });
    expect(within(group).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(['Blue', 'Graphite', 'Amber', 'Teal', 'Orchid']);
    await userEvent.click(within(group).getByRole('radio', { name: 'Orchid' }));
    await waitFor(() => expect(patches(f)).toContainEqual({ accent: '#B66AD0' }));
  });

  it('time zone is a text input that saves on blur', async () => {
    const f = setup();
    const input = await screen.findByRole('textbox', { name: 'Time zone' });
    expect(input).toHaveValue('Asia/Jerusalem');
    await userEvent.clear(input);
    await userEvent.type(input, 'Europe/Berlin');
    await userEvent.tab();
    await waitFor(() => expect(patches(f)).toContainEqual({ time_zone: 'Europe/Berlin' }));
  });

  it('uses the design copy for Home options', async () => {
    setup();
    expect(await screen.findByRole('radiogroup', { name: 'Rescheduled' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Show weekends on timelines' })).toBeInTheDocument();
    expect(screen.queryByText('Rescheduled window')).toBeNull();
  });

  it('shows the endpoint in a mono field with Copy, and the backup summary', async () => {
    setup();
    const endpoint = await screen.findByText('http://127.0.0.1:4747/mcp');
    expect(within(endpoint.closest('.gp-set__mono') as HTMLElement).getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(await screen.findByText(/Daily · last 30 kept · backed up 3 h ago/)).toBeInTheDocument();
  });
});
