import { useState, type KeyboardEvent } from 'react';

const PALETTE_SIZE = 8;

/**
 * Token input: type a name and press Enter (or comma) to make a coloured token with an × button;
 * Backspace on an empty input removes the last token. No suggestions list. Duplicates (case-insensitive) are ignored.
 * Props:
 *  - tokens: string[], onChange(tokens)
 *  - label: aria-label of the input (required); placeholder?
 *  - colorFor?(token, index) => CSS colour; defaults to the project palette (--gp-p1..p8) by index
 *  - autoFocus?
 * Each token's remove button is labelled `Remove {token}`.
 * Usage: <TokenField label="Areas" tokens={areas} onChange={setAreas} placeholder="Add an area…" />
 */
export interface TokenFieldProps {
  tokens: string[];
  onChange: (tokens: string[]) => void;
  label: string;
  placeholder?: string;
  colorFor?: (token: string, index: number) => string;
  autoFocus?: boolean;
  /** Tokens for which this returns false render without the × and can't be removed. */
  removable?: (token: string) => boolean;
}

export function TokenField({ tokens, onChange, label, placeholder, colorFor, autoFocus, removable }: TokenFieldProps) {
  const [text, setText] = useState('');
  const colour = (t: string, i: number) => colorFor?.(t, i) ?? `var(--gp-p${(i % PALETTE_SIZE) + 1})`;

  const commit = () => {
    const v = text.trim();
    setText('');
    if (v && !tokens.some((t) => t.toLowerCase() === v.toLowerCase())) onChange([...tokens, v]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && !e.nativeEvent.isComposing) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && text === '' && tokens.length > 0) {
      e.preventDefault();
      onChange(tokens.slice(0, -1));
    }
  };

  return (
    <div className="gp-tokens">
      {tokens.map((t, i) => (
        <span key={t} className="gp-token" aria-disabled={removable && !removable(t) ? true : undefined} style={{ ['--token' as string]: colour(t, i) }}>
          <span className="gp-token__name" dir="auto">
            {t}
          </span>
          {removable && !removable(t) ? null : (
            <button type="button" className="gp-token__x" aria-label={`Remove ${t}`} onClick={() => onChange(tokens.filter((x) => x !== t))}>
              ×
            </button>
          )}
        </span>
      ))}
      <input
        className="gp-tokens__input"
        dir="auto"
        aria-label={label}
        placeholder={tokens.length === 0 ? placeholder : undefined}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
