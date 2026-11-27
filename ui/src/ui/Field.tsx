import type { Ref } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * Single-line text input.
 * Props:
 *  - value, onChange, label (aria-label, required), placeholder, autoFocus, inputRef
 *  - onEnter: called on Enter (not Shift+Enter, not during IME composition)
 *  - variant: 'form' (default; white fill + 1px border, for forms) | 'quiet' (grey `sel` fill, for capture/search)
 *  - compact: 30px high instead of 34px
 *  - icon: leading icon (14px, text3)
 *  - submitHint: text shown at the right edge while the value is non-empty, with a key cap holding the Enter symbol
 *    (e.g. submitHint="Add"). Clicking it calls onSubmit, falling back to onEnter.
 *  - onSubmit: click handler for the submit hint
 * The focus ring is drawn inside the box, so it is never clipped by a scrolling parent.
 * Usage: <Field label="Capture" variant="quiet" icon="inbox" submitHint="Add" value={v} onChange={setV} onEnter={add} />
 */
export interface FieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** aria-label of the input. */
  label: string;
  onEnter?: () => void;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  variant?: 'form' | 'quiet';
  compact?: boolean;
  icon?: IconName;
  submitHint?: string;
  onSubmit?: () => void;
  disabled?: boolean;
}

export function Field({
  value,
  onChange,
  placeholder,
  label,
  onEnter,
  autoFocus,
  inputRef,
  variant = 'form',
  compact,
  icon,
  submitHint,
  onSubmit,
  disabled,
}: FieldProps) {
  const submit = onSubmit ?? onEnter;
  return (
    <div className={`gp-field gp-field--${variant}${compact ? ' gp-field--compact' : ''}`}>
      <div className="gp-field__box">
        {icon && (
          <span className="gp-field__icon">
            <Icon name={icon} size={14} />
          </span>
        )}
        <input
          ref={inputRef}
          className="gp-field__input"
          dir="auto"
          aria-label={label}
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && onEnter) {
              e.preventDefault();
              onEnter();
            }
          }}
        />
        {submitHint && value.trim() !== '' && (
          <button type="button" className="gp-field__hint" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => submit?.()}>
            {submitHint}
            <span className="gp-field__key" aria-hidden="true">
              <Icon name="enter" size={11} />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
