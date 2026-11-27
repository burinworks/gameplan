import type { Attachment } from '../api/types';
import { Chip, Icon, type IconName } from '../ui';

const ICON: Record<Attachment['kind'], IconName> = { commit: 'commit', pr: 'pr', file: 'file', link: 'link', note: 'file', ticket: 'ticket' };

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function labelOf(a: Attachment): string {
  if (a.kind === 'commit') return (a.ref ?? a.title ?? a.url).slice(0, 7);
  if (a.kind === 'pr' || a.kind === 'ticket') return a.ref ?? a.title ?? a.url;
  if (a.kind === 'file' || a.kind === 'note') return a.title ?? a.url.replace(/[?#].*$/, '').split('/').pop() ?? a.url;
  return a.title && a.title !== a.url ? a.title : host(a.url);
}

/** Attachment list: icon + label (+ state chip for PRs); `onRemove` adds a remove button per row. */
export function Links({ items, onRemove }: { items: Attachment[]; onRemove?: (id: string) => void }) {
  return (
    <ul className="gp-links">
      {items.map((a) => {
        const label = labelOf(a);
        return (
          <li key={a.id} className="gp-links__row">
            <Icon name={ICON[a.kind]} size={14} />
            <a className={`gp-links__label${a.kind === 'commit' ? ' is-mono' : ''}`} href={a.url} target="_blank" rel="noreferrer" dir="auto" title={a.url}>
              {label}
            </a>
            {a.kind === 'link' && <span className="gp-links__host">{host(a.url)}</span>}
            {a.kind === 'pr' && a.state && <Chip tone={a.state === 'merged' ? 'ok' : 'neutral'}>{a.state}</Chip>}
            {onRemove && (
              <button type="button" className="gp-links__x" aria-label={`Remove ${label}`} onClick={() => onRemove(a.id)}>
                <Icon name="close" size={11} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
