import { useState } from 'react';
import { useReview } from '../api/hooks';
import { fmtActor, fmtAgo } from '../lib/format';
import { Button, Field } from '../ui';

export function ReviewBar({ taskId, by, at }: { taskId: string; by: string; at: string }) {
  const review = useReview();
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('');
  const ago = fmtAgo(at, new Date());
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
      <span className="gp-review__title">{`${fmtActor(by)} finished this · ${ago}${/^\d+[mhd]$/.test(ago) ? ' ago' : ''}`}</span>
      <div className="gp-review__actions">
        <Button variant="primary" className="gp-review__accept" label="Accept" onClick={() => review.mutate({ id: taskId, decision: 'accept' })} />
        <Button variant="secondary" className="gp-review__back" label="Send back" onClick={() => setSending(true)} />
      </div>
      {sending && <Field label="What needs fixing" placeholder="What needs fixing…" value={note} onChange={setNote} onEnter={sendBack} autoFocus />}
    </section>
  );
}
