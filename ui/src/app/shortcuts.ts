import { useEffect, useRef } from 'react';

const isMac = (): boolean => typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent);

function inField(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

/** True when `e` matches a combo like `mod+shift+n`, `mod+1`, `escape`. `mod` = Cmd on macOS, Ctrl elsewhere. */
export function matches(combo: string, e: KeyboardEvent): boolean {
  const parts = combo.toLowerCase().split('+');
  const key = parts[parts.length - 1]!;
  const mods = new Set(parts.slice(0, -1));
  const mac = isMac();
  const wantMod = mods.has('mod');
  const modDown = mac ? e.metaKey : e.ctrlKey;
  const otherDown = mac ? e.ctrlKey : e.metaKey;
  if (wantMod !== modDown || otherDown) return false;
  if (mods.has('shift') !== e.shiftKey || mods.has('alt') !== e.altKey) return false;
  return e.key.toLowerCase() === key;
}

const ALWAYS = new Set(['escape', 'mod+k']);

/**
 * Registers a window keydown shortcut. Events from inputs/textareas are ignored except
 * `escape` and `mod+k`. `when` returning false suppresses the handler.
 */
export function useShortcut(combo: string, handler: (e: KeyboardEvent) => void, opts?: { when?: () => boolean }): void {
  const h = useRef(handler);
  const when = useRef(opts?.when);
  h.current = handler;
  when.current = opts?.when;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!matches(combo, e)) return;
      if (inField(e.target) && !ALWAYS.has(combo.toLowerCase())) return;
      if (when.current && !when.current()) return;
      e.preventDefault();
      h.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo]);
}
