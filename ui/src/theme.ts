export interface ThemeSettings {
  appearance: 'system' | 'light' | 'dark';
  accent: string;
}

const DEFAULT_ACCENT = '#2F6BF0';
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Sets data-theme (light | dark) and --gp-accent on the root element. */
export function applyTheme(settings: ThemeSettings, root: HTMLElement = document.documentElement): void {
  const dark = settings.appearance === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches : settings.appearance === 'dark';
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  root.style.setProperty('--gp-accent', HEX.test(settings.accent) ? settings.accent : DEFAULT_ACCENT);
}
