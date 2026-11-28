import { useEffect, useRef } from 'react';
import { Button } from './Button';

export const UNDO_MS = 6000; // --gp-undo

/** In-place undo line. Calls onExpire after 6s unless unmounted. */
export function Undo({ message, onUndo, onExpire }: { message: string; onUndo: () => void; onExpire?: () => void }) {
  const expire = useRef(onExpire);
  expire.current = onExpire;
  useEffect(() => {
    const t = setTimeout(() => expire.current?.(), UNDO_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="gp-undo" role="status">
      <span className="gp-undo__msg" dir="auto">
        {message}
      </span>
      <Button variant="quiet" label="Undo" onClick={onUndo} />
    </div>
  );
}
