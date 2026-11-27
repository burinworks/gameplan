export type IconName =
  | 'home' | 'search' | 'inbox' | 'plus' | 'archive' | 'settings' | 'more' | 'check' | 'chevron'
  | 'link' | 'commit' | 'pr' | 'file' | 'ticket' | 'star' | 'close' | 'minus';

const PATHS: Record<IconName, string> = {
  home: 'M4 11l8-7 8 7M6 9.5V20h12V9.5',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM16.5 16.5L21 21',
  inbox: 'M3 13l3-8h12l3 8v6H3v-6zM3 13h5l1 3h6l1-3h5',
  plus: 'M12 5v14M5 12h14',
  archive: 'M3 5h18v4H3zM5 9v10h14V9M10 13h4',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevron: 'M9 6l6 6-6 6',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  commit: 'M12 9a3 3 0 100 6 3 3 0 000-6zM3 12h6M15 12h6',
  pr: 'M7 8v8M7 5a2 2 0 100 .01M7 19a2 2 0 100 .01M17 19a2 2 0 100 .01M17 16V9a3 3 0 00-3-3h-2',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5',
  ticket: 'M4 8a2 2 0 002-2h12a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H6a2 2 0 00-2-2v-2a2 2 0 000-4zM10 8v8',
  star: 'M12 4l2.4 5 5.6.7-4.1 3.8 1.1 5.5L12 16.3 7 19l1.1-5.5L4 9.7 9.6 9z',
  close: 'M6 6l12 12M18 6L6 18',
  minus: 'M6 12h12',
};

/** 24-grid line icon, currentColor, decorative (aria-hidden). */
export function Icon({ name, size = 16 }: { name: IconName; size?: 11 | 14 | 16 }) {
  return (
    <svg
      className="gp-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={size <= 14 ? 2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
