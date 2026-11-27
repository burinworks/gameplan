import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDraft } from '../src/lib/draft';

function Field({ server, save }: { server: string; save: (v: string) => void }) {
  const d = useDraft(server, save);
  return <input aria-label="f" value={d.value} onChange={(e) => d.set(e.target.value)} {...d.bind} />;
}

describe('useDraft', () => {
  it('keeps the local value while focused, saves on blur', () => {
    const save = vi.fn();
    const { rerender } = render(<Field server="one" save={save} />);
    const input = screen.getByLabelText('f') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'abc' } });
    rerender(<Field server="zzz" save={save} />);
    expect(input.value).toBe('abc');
    fireEvent.blur(input);
    expect(save).toHaveBeenCalledWith('abc');
  });

  it('Esc restores the server value and does not save', () => {
    const save = vi.fn();
    render(<Field server="one" save={save} />);
    const input = screen.getByLabelText('f') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('one');
    fireEvent.blur(input);
    expect(save).not.toHaveBeenCalled();
  });

  it('Enter saves, Shift+Enter does not, unchanged does not', () => {
    const save = vi.fn();
    render(<Field server="one" save={save} />);
    const input = screen.getByLabelText('f') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(save).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(save).toHaveBeenCalledWith('x');
  });

  it('follows the server when not focused', () => {
    const { rerender } = render(<Field server="one" save={() => {}} />);
    rerender(<Field server="two" save={() => {}} />);
    expect((screen.getByLabelText('f') as HTMLInputElement).value).toBe('two');
  });

  it('untouched focus: server changes, blur -> no save, shows the new server value', () => {
    const save = vi.fn();
    const { rerender } = render(<Field server="one" save={save} />);
    const input = screen.getByLabelText('f') as HTMLInputElement;
    fireEvent.focus(input);
    rerender(<Field server="zzz" save={save} />);
    fireEvent.blur(input);
    expect(save).not.toHaveBeenCalled();
    expect(input.value).toBe('zzz');
  });

  it('Enter then blur saves once', () => {
    const save = vi.fn();
    render(<Field server="one" save={save} />);
    const input = screen.getByLabelText('f') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(save).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('abc');
  });
});
