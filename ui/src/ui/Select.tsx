import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Menu } from './Menu';

/**
 * Dropdown select (replaces native <select>). A 30px button showing the current option, opening a Menu.
 * Props:
 *  - value, onChange(value)
 *  - options: { value, label, swatch? (CSS colour, 8px square), diamond? (CSS colour, 7px diamond), disabled? }[]
 *  - label: aria-label; the trigger's accessible name is "{label}: {current label}"
 *  - placeholder?: shown when value matches no option
 *  - align?: 'start' (default) | 'end'
 *  - onAdd?: adds a last item "Add new…"; choosing it turns the field into a name input. Enter calls onAdd(name);
 *    when it resolves to a value, that value is selected. Escape (or leaving it empty) cancels.
 *  - addPlaceholder?: placeholder of that name input (default "Name")
 *  - addPopover?: instead of onAdd's inline name input, "Add new…" renders this node (a popover the caller owns,
 *    anchored to the trigger). It gets the trigger element, close(), and select(value) which selects and closes.
 * Usage: <Select label="Status" value={s} onChange={setS} options={[{ value: 'todo', label: 'To do' }]} />
 */
export interface SelectOption {
  value: string;
  label: string;
  swatch?: string;
  diamond?: string;
}

export interface SelectProps {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  label: string;
  placeholder?: string;
  align?: 'start' | 'end';
  onAdd?: (name: string) => Promise<string | void> | string | void;
  addPlaceholder?: string;
  addPopover?: (api: { anchor: HTMLElement; close: () => void; select: (v: string) => void }) => ReactNode;
}

export const ADD_NEW = 'Add new…';

function Marker({ o }: { o: SelectOption }) {
  if (o.swatch) return <span className="gp-select__swatch" style={{ background: o.swatch }} aria-hidden="true" />;
  if (o.diamond) return <span className="gp-select__diamond" style={{ background: o.diamond }} aria-hidden="true" />;
  return null;
}

function AddInput({ label, placeholder, onDone, onAdd }: { label: string; placeholder: string; onDone: (v: string | void) => void; onAdd: NonNullable<SelectProps['onAdd']> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const commit = async () => {
    const n = name.trim();
    if (!n) return onDone();
    if (busy) return;
    setBusy(true);
    try {
      onDone((await onAdd(n)) ?? undefined);
    } catch {
      setBusy(false);
      input.current?.focus();
    }
  };
  return (
    <input
      ref={input}
      className="gp-select gp-select--input"
      dir="auto"
      aria-label={`New ${label.toLowerCase()}`}
      placeholder={placeholder}
      value={name}
      disabled={busy}
      onChange={(e) => setName(e.target.value)}
      onBlur={() => {
        if (!name.trim()) onDone();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          e.stopPropagation(); // not a form "create" shortcut
          void commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onDone();
        }
      }}
    />
  );
}

export function Select({ value, onChange, options, label, placeholder = 'Choose…', align = 'start', onAdd, addPlaceholder = 'Name', addPopover }: SelectProps) {
  const [adding, setAdding] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const anchor = adding && addPopover ? (wrap.current?.querySelector<HTMLElement>('button') ?? null) : null;
  const cur = options.find((o) => o.value === value);
  if (adding && onAdd && !addPopover)
    return (
      <AddInput
        label={label}
        placeholder={addPlaceholder}
        onAdd={onAdd}
        onDone={(v) => {
          setAdding(false);
          if (typeof v === 'string') onChange(v);
        }}
      />
    );
  const menu = (
    <Menu
      label={`${label}: ${cur?.label ?? placeholder}`}
      align={align}
      matchWidth
      triggerClassName="gp-select"
      items={[
        ...options.map((o) => ({
          label: o.label,
          checked: o.value === value,
          leading: <Marker o={o} />,
          onSelect: () => onChange(o.value),
        })),
        ...(onAdd || addPopover ? [{ label: ADD_NEW, leading: <Icon name="plus" size={12} />, onSelect: () => setAdding(true) }] : []),
      ]}
      trigger={
        <>
          {cur && <Marker o={cur} />}
          <span className={`gp-select__label${cur ? '' : ' is-placeholder'}`} dir="auto">
            {cur?.label ?? placeholder}
          </span>
          <span className="gp-select__chev">
            <Icon name="chevronDown" size={12} />
          </span>
        </>
      }
    />
  );
  if (!addPopover) return menu;
  return (
    <span ref={wrap} className="gp-select__wrap">
      {menu}
      {anchor &&
        addPopover({
          anchor,
          close: () => setAdding(false),
          select: (v) => {
            setAdding(false);
            onChange(v);
          },
        })}
    </span>
  );
}
