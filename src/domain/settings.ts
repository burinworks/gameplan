import type { DatabaseSync } from 'node:sqlite';
import { isValidTimeZone } from '../clock.js';
import { GameplanError, isAgent } from './types.js';

export const DEFAULTS = {
  time_zone: 'Asia/Jerusalem',
  week_start: 'mon',
  appearance: 'system',
  accent: '#2F6BF0',
  rescheduled_days: 14,
  show_paused: false,
  show_weekends: true,
  open_at_login: true,
  menu_bar_icon: true,
  agents_require_reason: true,
  agents_need_review: true,
  agents_can_archive: false,
  agents_can_create_projects: true,
  /** When set, /mcp requires `Authorization: Bearer <token>`. Never returned over HTTP. */
  mcp_token: null as string | null,
};

export type Settings = typeof DEFAULTS;
export type SettingsPatch = Partial<Settings>;
export type AgentAction = 'archive' | 'create_project' | 'move_dates';

const ENUMS: Partial<Record<keyof Settings, readonly string[]>> = {
  week_start: ['mon', 'sun'],
  appearance: ['system', 'light', 'dark'],
};

export function getSettings(db: DatabaseSync): Settings {
  const out: Record<string, unknown> = { ...DEFAULTS };
  for (const r of db.prepare('SELECT key, value_json FROM settings').all() as { key: string; value_json: string }[]) {
    if (!(r.key in DEFAULTS)) continue;
    try {
      out[r.key] = JSON.parse(r.value_json);
    } catch {
      /* keep default */
    }
  }
  return out as Settings;
}

/** Validates a patch; throws `invalid` naming the offending key. */
export function validateSettingsPatch(patch: Record<string, unknown>): SettingsPatch {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) throw new GameplanError('invalid', 'settings patch must be an object');
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULTS)) throw new GameplanError('invalid', `unknown setting "${key}" (valid: ${Object.keys(DEFAULTS).join(', ')})`);
    if (key === 'mcp_token') {
      if (value !== null && (typeof value !== 'string' || !/^\S{16,200}$/.test(value)))
        throw new GameplanError('invalid', 'setting "mcp_token" must be null or 16–200 characters without spaces');
      continue;
    }
    const def = DEFAULTS[key as keyof Settings];
    if (typeof value !== typeof def) throw new GameplanError('invalid', `setting "${key}" must be a ${typeof def}`);
    const allowed = ENUMS[key as keyof Settings];
    if (allowed && !allowed.includes(value as string)) throw new GameplanError('invalid', `setting "${key}" must be one of ${allowed.join(', ')}`);
    if (key === 'time_zone' && !isValidTimeZone(value)) throw new GameplanError('invalid', `"${String(value)}" is not a valid IANA time zone`);
    if (key === 'accent' && !/^#[0-9a-fA-F]{6}$/.test(value as string)) throw new GameplanError('invalid', 'setting "accent" must be a #RRGGBB colour');
    if (key === 'rescheduled_days' && (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 365))
      throw new GameplanError('invalid', 'setting "rescheduled_days" must be an integer 1..365');
  }
  return patch as SettingsPatch;
}

/** Settings safe to send over HTTP: the MCP token becomes `mcp_token_set`. */
export function publicSettings(s: Settings): Omit<Settings, 'mcp_token'> & { mcp_token_set: boolean } {
  const { mcp_token, ...rest } = s;
  return { ...rest, mcp_token_set: mcp_token !== null };
}

/** Agent policy. `you` is never restricted. */
export function assertAgentAllowed(settings: Settings, actor: string, action: AgentAction, reason?: string): void {
  if (!isAgent(actor)) return;
  if (action === 'archive' && !settings.agents_can_archive)
    throw new GameplanError('forbidden', 'Agents may not archive (setting agents_can_archive is off). Ask the user to archive it, or to turn the setting on.');
  if (action === 'create_project' && !settings.agents_can_create_projects)
    throw new GameplanError('forbidden', 'Agents may not create projects (setting agents_can_create_projects is off).');
  if (action === 'move_dates' && settings.agents_require_reason && !reason?.trim())
    throw new GameplanError('forbidden', 'A reason is required when an agent moves dates (setting agents_require_reason).');
}
