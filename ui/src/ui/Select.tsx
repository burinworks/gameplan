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
}

function Marker({ o }: { o: SelectOption }) {
  if (o.swatch) return <span className="gp-select__swatch" style={{ background: o.swatch }} aria-hidden="true" />;
  if (o.diamond) return <span className="gp-select__diamond" style={{ background: o.diamond }} aria-hidden="true" />;
  return null;
}

export function Select({ value, onChange, options, label, placeholder = 'Choose…', align = 'start' }: SelectProps) {
  const cur = options.find((o) => o.value === value);
  return (
    <Menu
      label={`${label}: ${cur?.label ?? placeholder}`}
      align={align}
      matchWidth
      triggerClassName="gp-select"
      items={options.map((o) => ({
        label: o.label,
        checked: o.value === value,
        leading: <Marker o={o} />,
        onSelect: () => onChange(o.value),
      }))}
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
}
