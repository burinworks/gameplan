import type { PublicSettings } from '../../src/api/types';

export const settingsFixture: PublicSettings = {
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
  mcp_token_set: false,
};

export const agentsFixture = (now: Date) => [
  { name: 'Codex', firstSeen: new Date(now.getTime() - 9 * 86_400_000).toISOString(), lastSeen: new Date(now.getTime() - 2 * 3_600_000).toISOString(), calls: 14 },
  { name: 'Claude Code', firstSeen: new Date(now.getTime() - 20 * 86_400_000).toISOString(), lastSeen: new Date(now.getTime() - 5 * 60_000).toISOString(), calls: 120 },
];

export const searchHits: Record<string, { type: string; id: string; title: string; project: string; path: string }[]> = {
  npm: [
    { type: 'project', id: 'p1', title: 'npm release', project: 'npm-release', path: 'npm release' },
    { type: 'task', id: 't9', title: 'Publish npm package', project: 'npm-release', path: 'npm release › Ship › Publish npm package' },
  ],
};
