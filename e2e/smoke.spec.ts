import { mkdirSync } from 'node:fs';
import { expect, test as base, type Page } from '@playwright/test';
import { startSeeded, type Seeded } from './seed.js';

const test = base.extend<object, { engine: Seeded }>({
  engine: [
    async ({}, use: (s: Seeded) => Promise<void>) => {
      const s = await startSeeded();
      await use(s);
      await s.stop();
    },
    { scope: 'worker' },
  ],
});

const SHOTS = 'test-results/screens';
mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  const scheme = (await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)) ? 'dark' : 'light';
  await page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png` });
}

/** Console errors and uncaught exceptions seen by the page. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const task = async (engine: Seeded, id: string) => (await (await fetch(`${engine.baseURL}/api/tasks/${id}`)).json()) as { title: string; status: string; start: string; end: string };

/** Streamable HTTP MCP call as a named client: initialize, then tools/call. */
async function mcpCall(baseURL: string, name: string, args: Record<string, unknown>): Promise<void> {
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  const post = (body: unknown, extra: Record<string, string> = {}) => fetch(`${baseURL}/mcp`, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) });
  const init = await post({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'e2e-agent', version: '1.0.0' } },
  });
  expect(init.ok).toBe(true);
  const sid = init.headers.get('mcp-session-id');
  expect(sid).toBeTruthy();
  await init.text();
  const session = { 'mcp-session-id': sid! };
  await (await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, session)).text();
  const res = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }, session);
  const text = await res.text();
  expect(res.ok, text).toBe(true);
  expect(text).not.toContain('"isError":true');
}

test.describe.configure({ mode: 'serial' });

test.describe('smoke', () => {
  test('1 home loads', async ({ page, engine }) => {
    const errors = watchErrors(page);
    await page.goto(engine.baseURL);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByLabel('My plan').getByTestId('plan-row')).toHaveCount(2);
    const review = page.locator('.gp-panel', { has: page.getByRole('heading', { name: 'Needs review' }) });
    await expect(review.locator('.gp-rowitem')).toHaveCount(1);
    await page.waitForLoadState('networkidle');
    await shot(page, 'home');
    expect(errors).toEqual([]);
  });

  test('2 capture, inbox, dismiss', async ({ page, engine }) => {
    await page.goto(engine.baseURL);
    const count = page.getByRole('link', { name: /^Inbox/ }).locator('.gp-nav__count');
    await expect(count).toHaveText('4');
    await page.getByLabel('Capture').fill('Call the accountant');
    await page.getByLabel('Capture').press('Enter');
    await expect(count).toHaveText('5');
    await page.getByRole('link', { name: /^Inbox/ }).click();
    const row = page.locator('.gp-inbox__row', { hasText: 'Call the accountant' });
    await expect(row).toBeVisible();
    await shot(page, 'inbox');
    await row.getByRole('button', { name: 'Dismiss' }).click();
    await expect(count).toHaveText('4');
    await expect(row).toHaveCount(0);
  });

  test('3 review and approve', async ({ page, engine }) => {
    await page.goto(engine.baseURL);
    await page.locator('.gp-rowitem', { hasText: 'Check the figures' }).click();
    const pane = page.getByLabel('Task', { exact: true });
    await expect(pane.getByRole('button', { name: 'Accept' })).toBeVisible();
    await shot(page, 'task-pane');
    await pane.getByRole('button', { name: 'Accept' }).click();
    await expect(pane.locator('.gp-chip', { hasText: /^Done$/ })).toBeVisible();
  });

  test('4 drag a bar, then undo', async ({ page, engine }) => {
    const { dragTask, projectSlug } = engine.ids;
    const before = await task(engine, dragTask);
    await page.goto(`${engine.baseURL}/p/${projectSlug}/timeline`);
    const bar = page.locator(`[data-bar="${dragTask}"]`);
    await expect(bar).toBeVisible();
    await bar.scrollIntoViewIfNeeded();
    await shot(page, 'project-timeline');
    const box = (await bar.boundingBox())!;
    const y = box.y + box.height / 2;
    const x = box.x + box.width / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 16, y, { steps: 4 });
    await page.mouse.move(x + 32, y, { steps: 4 });
    await page.mouse.up();

    const shifted = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    await expect.poll(async () => (await task(engine, dragTask)).start).toBe(shifted(before.start, 2));
    expect((await task(engine, dragTask)).end).toBe(shifted(before.end, 2));

    // reopen the task in the app (no reload: the undo stack lives in the page): the pane shows the moved dates
    await bar.click();
    const pane = page.getByLabel('Task', { exact: true });
    await expect(pane).toBeVisible();
    await expect(pane.getByRole('group', { name: 'Start' }).getByRole('button').first()).toHaveText(/\d/);
    await page.keyboard.press('Escape');
    await expect(pane).toHaveCount(0);
    const mod = (await page.evaluate(() => /mac/i.test(navigator.platform || navigator.userAgent))) ? 'Meta' : 'Control';
    await page.keyboard.press(`${mod}+z`);
    await expect.poll(async () => (await task(engine, dragTask)).start).toBe(before.start);
    expect((await task(engine, dragTask)).end).toBe(before.end);
  });

  test('5 agent write shows live', async ({ page, engine }) => {
    const { dragTask, projectSlug } = engine.ids;
    await page.goto(`${engine.baseURL}/p/${projectSlug}/timeline?task=${dragTask}`);
    const pane = page.getByLabel('Task', { exact: true });
    await expect(pane.getByLabel('Title')).toHaveValue('Interview notes');
    await mcpCall(engine.baseURL, 'update_task', { id: dragTask, title: 'Interview notes, round two' });
    await expect(pane.getByLabel('Title')).toHaveValue('Interview notes, round two');
    await expect(page.locator(`[data-bar="${dragTask}"].is-changed`)).toBeVisible({ timeout: 1500 });
    expect((await task(engine, dragTask)).title).toBe('Interview notes, round two');
  });

  test('6 settings dark theme', async ({ page, engine }) => {
    await page.goto(`${engine.baseURL}/settings`);
    await expect(page.getByLabel('Settings', { exact: true })).toBeVisible();
    await shot(page, 'settings');
    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('7 no horizontal scroll at the minimum window', async ({ page, engine }) => {
    await page.setViewportSize({ width: 1080, height: 680 });
    for (const path of ['/', '/inbox', '/settings', `/p/${engine.ids.projectSlug}/timeline`]) {
      await page.goto(engine.baseURL + path);
      await page.waitForLoadState('networkidle');
      expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(1080);
    }
  });

  test('8 copy guard', async ({ page, engine }) => {
    for (const path of ['/', '/inbox', '/settings', `/p/${engine.ids.projectSlug}/list`]) {
      await page.goto(engine.baseURL + path);
      await page.waitForLoadState('networkidle');
      const bad = await page.evaluate(() => {
        const re = /!|Create a new|here or ask/;
        const hits: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement;
          if (!el || ['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') continue;
          const t = n.textContent ?? '';
          if (re.test(t)) hits.push(t.trim());
        }
        return hits;
      });
      expect(bad, path).toEqual([]);
    }
  });
});
