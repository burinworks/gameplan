import { useState } from 'react';
import { useReview } from '../api/hooks';
import { fmtActorAt } from '../lib/format';
import { Button, Field } from '../ui';

export function ReviewBar({ taskId, by, at }: { taskId: string; by: string; at: string }) {
  const review = useReview();
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('');
  const sendBack = () => {
    const n = note.trim();
    if (!n) return;
    review.mutate(
      { id: taskId, decision: 'send_back', note: n },
      {
        onSuccess: () => {
          setSending(false);
          setNote('');
        },
      },
    );
  };
  return (
    <section className="gp-review" aria-label="Review">
      <div className="gp-review__head">
        <span className="gp-review__title">Needs review</span>
        <span className="gp-review__by">{fmtActorAt(by, at, new Date())}</span>
      </div>
      <div className="gp-review__actions">
        <Button variant="primary" label="Approve" onClick={() => review.mutate({ id: taskId, decision: 'accept' })} />
        <Button variant="secondary" label="Send back" onClick={() => setSending(true)} />
      </div>
      {sending && <Field label="What needs fixing" placeholder="What needs fixing…" value={note} onChange={setNote} onEnter={sendBack} autoFocus />}
    </section>
  );
}
