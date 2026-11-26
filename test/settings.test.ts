import { describe, expect, it } from 'vitest';
import { assertAgentAllowed, DEFAULTS, getSettings } from '../src/domain/settings.js';
import { expectCode, setup, YOU } from './helpers.js';

describe('settings', () => {
  it('returns defaults', () => {
    const { db } = setup();
    expect(getSettings(db)).toEqual(DEFAULTS);
  });

  it('validates and persists patches', () => {
    const { store, db } = setup();
    expectCode(() => store.setSettings(YOU, { time_zone: 'Mars/Base' }), 'invalid');
    expectCode(() => store.setSettings(YOU, { nope: 1 } as never), 'invalid', 'nope');
    expectCode(() => store.setSettings(YOU, { show_paused: 'yes' } as never), 'invalid');
    const s = store.setSettings(YOU, { time_zone: 'UTC', agents_can_archive: true });
    expect(s.time_zone).toBe('UTC');
    expect(getSettings(db).agents_can_archive).toBe(true);
  });

  it('today follows time_zone on the next call', () => {
    const { store } = setup('2026-11-25T23:30:00Z');
    expect(store.today()).toBe('2026-11-26');
    store.setSettings(YOU, { time_zone: 'UTC' });
    expect(store.today()).toBe('2026-11-25');
  });

  it('gates agents, never you', () => {
    expectCode(() => assertAgentAllowed(DEFAULTS, 'ai:x', 'archive'), 'forbidden', 'agents_can_archive');
    expect(() => assertAgentAllowed(DEFAULTS, 'you', 'archive')).not.toThrow();
    expectCode(() => assertAgentAllowed(DEFAULTS, 'ai:x', 'move_dates'), 'forbidden', 'agents_require_reason');
    expect(() => assertAgentAllowed(DEFAULTS, 'ai:x', 'move_dates', 'slipped')).not.toThrow();
    expectCode(() => assertAgentAllowed({ ...DEFAULTS, agents_can_create_projects: false }, 'ai:x', 'create_project'), 'forbidden', 'agents_can_create_projects');
  });
});
