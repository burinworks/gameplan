import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

/**
 * Local edit buffer for a server-backed field. While focused, server changes don't overwrite the
 * value. Takes primitives (compared with Object.is). Saves only after the user edited: blur or Enter (not Shift+Enter) saves if changed; Esc restores the server value.
 */
export function useDraft<T>(server: T, save: (v: T) => void) {
  const [value, setValue] = useState<T>(server);
  const valueRef = useRef(value);
  const serverRef = useRef(server);
  const saveRef = useRef(save);
  const focused = useRef(false);
  const dirty = useRef(false); // the user typed since the last save/restore
  const pending = useRef(false); // saved, server hasn't caught up yet
  serverRef.current = server;
  saveRef.current = save;

  const sync = useCallback((v: T) => {
    valueRef.current = v;
    setValue(v);
  }, []);
  const set = useCallback(
    (v: T) => {
      dirty.current = true;
      sync(v);
    },
    [sync],
  );

  useEffect(() => {
    pending.current = false;
    if (!focused.current && !dirty.current) sync(server);
  }, [server, sync]);

  const commit = useCallback(() => {
    if (!dirty.current) return;
    dirty.current = false;
    if (!Object.is(valueRef.current, serverRef.current)) {
      pending.current = true;
      saveRef.current(valueRef.current);
    }
  }, []);

  const bind = {
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      commit();
      if (!dirty.current && !pending.current) sync(serverRef.current);
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) commit();
      else if (e.key === 'Escape') {
        dirty.current = false;
        sync(serverRef.current);
      }
    },
  };
  return { value, set, bind };
}
