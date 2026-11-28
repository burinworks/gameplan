import type { TodoState } from '../api/types';
import { Icon } from './Icon';

export interface CheckboxProps {
  checked: boolean;
  /** `locked` = blocked by the previous to-do: not focusable, ignores clicks. */
  state?: TodoState;
  tone?: 'ok' | 'review';
  onChange: (v: boolean) => void;
  label: string;
}

export function Checkbox({ checked, state, tone = 'ok', onChange, label }: CheckboxProps) {
  const locked = state === 'locked';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={locked || undefined}
      tabIndex={locked ? -1 : 0}
      className={`gp-check gp-check--${tone}${checked ? ' is-checked' : ''}${locked ? ' is-locked' : ''}`}
      onClick={() => {
        if (!locked) onChange(!checked);
      }}
    >
      {checked && <Icon name="check" size={11} />}
    </button>
  );
}
