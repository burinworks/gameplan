import { useRef, useState } from 'react';
import { useCreateMilestone } from '../api/hooks';
import { today } from '../app/today';
import { Button, Field, Segmented } from '../ui';
import { addDays, isDate } from './dates';
import { useCloseTask } from './Pane';
import './task-pane.css';

export function NewMilestone({ slug }: { slug: string }) {
  const close = useCloseTask();
  const create = useCreateMilestone();
  const busy = useRef(false); // set synchronously: mutation state lags a keypress behind
  const [name, setName] = useState('');
  const [due, setDue] = useState('');
  const [status, setStatus] = useState<'planned' | 'active'>('planned');
  const [goal, setGoal] = useState('');

  const dueOk = due === '' || isDate(due);
  const valid = name.trim() !== '' && dueOk;
  const step = (n: number) => setDue(addDays(isDate(due) ? due : today(), n));

  const submit = () => {
    if (!valid || busy.current) return;
    busy.current = true;
    create.mutate(
      {
        slug,
        body: {
          name: name.trim(),
          ...(isDate(due) ? { due } : {}),
          ...(status === 'active' ? { status } : {}),
          ...(goal.trim() ? { description: goal.trim() } : {}),
        },
      },
      { onSettled: () => void (busy.current = false), onSuccess: close },
    );
  };

  return (
    <section
      className="gp-tp"
      aria-label="New milestone"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.defaultPrevented) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <header className="gp-tp__top">
        <h2 className="gp-tp__h2">New milestone</h2>
        <Button variant="icon" icon="close" label="Close" onClick={close} />
      </header>
      <Field label="Name" placeholder="Name…" value={name} onChange={setName} onEnter={submit} autoFocus />
      <section className="gp-tp__sec" aria-label="Details">
        <div className="gp-tp__row">
          <span className="gp-tp__key">Due</span>
          <span className="gp-tp__val gp-tp__stepper">
            <Button variant="icon" icon="minus" label="Due -1 day" onClick={() => step(-1)} />
            <input
              className={`gp-pane__input gp-pane__date num${dueOk ? '' : ' is-invalid'}`}
              aria-label="Due date"
              aria-invalid={!dueOk || undefined}
              placeholder="YYYY-MM-DD"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
            <Button variant="icon" icon="plus" label="Due +1 day" onClick={() => step(1)} />
          </span>
        </div>
        <div className="gp-tp__row">
          <span className="gp-tp__key">Status</span>
          <span className="gp-tp__val">
            <Segmented
              label="Status"
              options={[
                { value: 'planned', label: 'Planned' },
                { value: 'active', label: 'Active' },
              ]}
              value={status}
              onChange={setStatus}
            />
          </span>
        </div>
      </section>
      <section className="gp-tp__sec" aria-label="Goal">
        <h3 className="gp-tp__h">Goal</h3>
        <textarea className="gp-pane__input gp-tp__desc" dir="auto" aria-label="Goal" rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} />
      </section>
      <footer className="gp-tp__foot">
        <Button variant="primary" label="Create milestone" onClick={submit} disabled={!valid} />
      </footer>
    </section>
  );
}
