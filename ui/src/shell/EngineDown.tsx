import { useEffect, useState } from 'react';
import { useEngineUp } from '../api/live';
import './engine-down.css';

export function EngineDown() {
  const up = useEngineUp();
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (up) {
      setLate(false);
      return;
    }
    const t = setTimeout(() => setLate(true), 2000);
    return () => clearTimeout(t);
  }, [up]);
  if (up || !late) return null;
  return (
    <div className="gp-engine-down" role="alert">
      <span>Gameplan engine isn't running</span>
      <button type="button" onClick={() => location.reload()}>
        Restart
      </button>
    </div>
  );
}
