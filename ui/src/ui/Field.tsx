import type { Ref } from 'react';

export interface FieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Visually hidden <label> text. */
  label: string;
  onEnter?: () => void;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}

export function Field({ value, onChange, placeholder, label, onEnter, autoFocus, inputRef }: FieldProps) {
  return (
    <label className="gp-field">
      <span className="gp-sr">{label}</span>
      <input
        ref={inputRef}
        className="gp-field__input"
        dir="auto"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
      />
    </label>
  );
}
