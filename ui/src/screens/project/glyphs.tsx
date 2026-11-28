/** Small line glyphs this screen needs that the shared Icon set doesn't have (24-grid, currentColor, decorative). */
type Size = 10 | 12 | 13;

const PATHS = {
  up: 'M12 19V5M6 11l6-6 6 6',
  paperclip: 'M21.4 11.1 12.2 20.3a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5',
  plan: 'M4 6h10M4 12h16M4 18h7',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  commit: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM2 12h6M16 12h6',
  pr: 'M6 3v12M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 21V9a3 3 0 0 0-3-3h-4M13 3l-2 3 2 3M18 15a3 3 0 1 0 0 6',
  check: 'm5 12.5 4.5 4.5L19 7.5',
} as const;

export type GlyphName = keyof typeof PATHS;

export function Glyph({ name, size }: { name: GlyphName; size: Size }) {
  return (
    <svg className="gp-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'up' ? 2.4 : 1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
