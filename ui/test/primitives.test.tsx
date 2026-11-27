import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Menu } from '../src/ui/Menu';
import { Button } from '../src/ui/Button';
import { Checkbox } from '../src/ui/Checkbox';
import { Row } from '../src/ui/Row';
import { Segmented } from '../src/ui/Segmented';
import { Sheet } from '../src/ui/Sheet';
import { Toggle } from '../src/ui/Toggle';
import { Undo } from '../src/ui/Undo';

afterEach(() => vi.useRealTimers());

describe('primitives', () => {
  it('icon Button without label reports an error in dev', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Button variant="icon" icon="plus" />);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    render(<Button variant="icon" icon="plus" label="Add" />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('Segmented: arrow-right selects the next option', async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Tabs"
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Tabs' })).toBeInTheDocument();
    screen.getByRole('radio', { name: 'A' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('Toggle is a switch', async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Weekends" />);
    const sw = screen.getByRole('switch', { name: 'Weekends' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('locked Checkbox is not focusable and ignores clicks', () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} state="locked" onChange={onChange} label="Step" />);
    const cb = screen.getByRole('checkbox', { name: 'Step' });
    expect(cb).toHaveAttribute('tabindex', '-1');
    expect(cb).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(cb);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Sheet traps focus and Esc closes', async () => {
    const onClose = vi.fn();
    render(
      <>
        <button>outside</button>
        <Sheet title="Archive x?" onClose={onClose} footer={<button>Archive</button>}>
          <input aria-label="name" />
        </Sheet>
      </>,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('name')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Archive' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText('name')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('Row long title carries the full text and dir=auto', () => {
    const long = 'A very long title '.repeat(10).trim();
    render(<Row title={long} meta="meta" />);
    const t = screen.getByText(long);
    expect(t).toHaveAttribute('title', long);
    expect(t).toHaveAttribute('dir', 'auto');
  });

  it('Undo calls onExpire after 6000ms', () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    render(<Undo message="Archived" onUndo={() => {}} onExpire={onExpire} />);
    act(() => vi.advanceTimersByTime(5999));
    expect(onExpire).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('Menu align start anchors the menu to the trigger left edge', async () => {
    render(<Menu label="Title" trigger={<span>T</span>} items={[{ label: 'One', onSelect: () => {} }]} align="start" />);
    await userEvent.click(screen.getByRole('button', { name: 'Title' }));
    const menu = screen.getByRole('menu');
    expect(menu.style.left).toBe('0px');
    expect(menu.style.right).toBe('');
  });

  it('Menu defaults to end alignment', async () => {
    render(<Menu label="Title" trigger={<span>T</span>} items={[{ label: 'One', onSelect: () => {} }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Title' }));
    expect(screen.getByRole('menu').style.right).not.toBe('');
  });

  it('primitives.css: no raw ring px, and sheet/menu go opaque under reduced transparency', () => {
    const css = readFileSync('ui/src/ui/primitives.css', 'utf8');
    expect(css).not.toMatch(/\b1\.5px|\b2px/);
    const block = css.slice(css.indexOf('prefers-reduced-transparency'));
    expect(block).toMatch(/\.gp-sheet/);
    expect(block).toMatch(/\.gp-menu/);
    expect(block).toMatch(/backdrop-filter: none/);
  });
});
