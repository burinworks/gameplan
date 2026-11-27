import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

/**
 * Local edit buffer for a server-backed field. While focused, server changes don't overwrite the
 * value. Blur or Enter (not Shift+Enter) saves if changed; Esc restores the server value.
 */
export function useDraft<T>(server: T, save: (v: T) => void) {
  const [value, setValue] = useState<T>(server);
  const valueRef = useRef(value);
  const serverRef = useRef(server);
  const saveRef = useRef(save);
  const focused = useRef(false);
  serverRef.current = server;
  saveRef.current = save;

  const set = useCallback((v: T) => {
    valueRef.current = v;
    setValue(v);
  }, []);

  useEffect(() => {
    if (!focused.current) set(server);
  }, [server, set]);

  const commit = useCallback(() => {
    if (!Object.is(valueRef.current, serverRef.current)) saveRef.current(valueRef.current);
  }, []);

  const bind = {
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      commit();
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) commit();
      else if (e.key === 'Escape') set(serverRef.current);
    },
  };
  return { value, set, bind };
}
