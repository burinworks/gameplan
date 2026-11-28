import { useRef, useState } from 'react';
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
export function Links({ items, onRemove, variant = 'rows' }: { items: Attachment[]; onRemove?: (id: string) => void; variant?: 'rows' | 'chips' }) {
  return (
    <ul className={`gp-links${variant === 'chips' ? ' gp-links--chips' : ''}`}>
      {items.map((a) => {
        const label = labelOf(a);
        return (
          <li key={a.id} className="gp-links__row">
            <Icon name={ICON[a.kind]} size={variant === 'chips' ? 12 : 14} />
            <a className={`gp-links__label${a.kind === 'commit' ? ' is-mono' : ''}`} href={a.url} target="_blank" rel="noreferrer" dir="auto" title={a.url}>
              {label}
            </a>
            {a.kind === 'link' && variant === 'rows' && <span className="gp-links__host">{host(a.url)}</span>}
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

/** Links not yet saved (New task): the same chips, removable by index. */
export function DraftLinks({ urls, onRemove }: { urls: string[]; onRemove: (i: number) => void }) {
  return (
    <ul className="gp-links gp-links--chips">
      {urls.map((u, i) => (
        <li key={u} className="gp-links__row">
          <Icon name="link" size={12} />
          <span className="gp-links__label" dir="auto" title={u}>
            {host(u)}
          </span>
          <button type="button" className="gp-links__x" aria-label={`Remove ${host(u)}`} onClick={() => onRemove(i)}>
            <Icon name="close" size={11} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A "+ Link" chip that turns into an address input; Enter adds. */
export function AddLink({ onAdd }: { onAdd: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const cancelled = useRef(false);
  if (!open)
    return (
      <button type="button" className="gp-links__add" onClick={() => {
          cancelled.current = false;
          setOpen(true);
        }}>
        <Icon name="plus" size={12} />
        Link
      </button>
    );
  const done = () => {
    const v = url.trim();
    if (v && !cancelled.current) onAdd(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    setUrl('');
    setOpen(false);
  };
  return (
    <input
      className="gp-links__input"
      aria-label="Link address"
      placeholder="Paste a link"
      autoFocus
      value={url}
      onChange={(e) => setUrl(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          done();
        } else if (e.key === 'Escape') {
          e.stopPropagation();
          cancelled.current = true;
          setUrl('');
          setOpen(false);
        }
      }}
    />
  );
}
