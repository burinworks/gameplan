import { useEffect, useRef, useState } from 'react';
import { useSetResume } from '../api/hooks';
import type { TreeTask } from '../api/types';
import { useDraft } from '../lib/draft';
import { fmtActorAt } from '../lib/format';

type Resume = NonNullable<TreeTask['resume']>;

export const RESUME_MAX = 200;
export const RESUME_COUNTER_AT = 180;

export function ResumeBox({ taskId, resume }: { taskId: string; resume: Resume | null }) {
  const setResume = useSetResume();
  const d = useDraft(resume?.note ?? '', (v) => setResume.mutateAsync({ id: taskId, note: v.trim() || null }));
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  return (
    <section className="gp-resume" aria-label="Where I left off">
      <div className="gp-resume__head">
        <span className="gp-resume__label">Where I left off</span>
        {resume?.by && resume.at && <span className="gp-resume__by">{fmtActorAt(resume.by, resume.at, new Date())}</span>}
      </div>
      {editing ? (
        <div className="gp-resume__edit">
          <input
            ref={input}
            className="gp-pane__input"
            dir="auto"
            aria-label="Where I left off"
            maxLength={RESUME_MAX}
            value={d.value}
            onChange={(e) => d.set(e.target.value.replace(/[\r\n]+/g, '').slice(0, RESUME_MAX))}
            onFocus={d.bind.onFocus}
            onBlur={() => {
              d.bind.onBlur();
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                d.bind.onKeyDown(e);
                input.current?.blur();
              } else if (e.key === 'Escape') {
                e.stopPropagation();
                d.bind.onKeyDown(e);
                input.current?.blur();
              }
            }}
          />
          {d.value.length >= RESUME_COUNTER_AT && (
            <span className="gp-resume__count num" aria-live="polite">
              {d.value.length}/{RESUME_MAX}
            </span>
          )}
        </div>
      ) : resume ? (
        <button type="button" className="gp-resume__text" dir="auto" onClick={() => setEditing(true)}>
          {`↳ ${resume.note}`}
        </button>
      ) : (
        <button type="button" className="gp-resume__empty" onClick={() => setEditing(true)}>
          Add where you left off
        </button>
      )}
    </section>
  );
}
