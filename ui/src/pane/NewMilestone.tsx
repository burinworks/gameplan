import { useEffect, useMemo, useRef, useState } from 'react';
import { useCreateMilestone, useProject, useSettings } from '../api/hooks';
import { today } from '../app/today';
import { Button, DateField, Segmented } from '../ui';
import { addDays } from './dates';
import { setDraftMilestone } from './draftBar';
import { useCloseTask } from './Pane';
import './task-pane.css';

export function NewMilestone({ slug }: { slug: string }) {
  const close = useCloseTask();
  const create = useCreateMilestone();
  const tree = useProject(slug).data;
  const settings = useSettings();
  const busy = useRef(false); // set synchronously: mutation state lags a keypress behind
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [status, setStatus] = useState<'planned' | 'active'>('planned');
  const [goal, setGoal] = useState('');

  // Never empty: two weeks after the last milestone's due date (at the earliest, tomorrow).
  const suggested = useMemo(() => {
    const tomorrow = addDays(today(), 1);
    const last = (tree?.milestones ?? [])
      .map((m) => m.due)
      .filter((d): d is string => !!d)
      .sort()
      .pop();
    const d = last ? addDays(last, 14) : addDays(today(), 14);
    return d < tomorrow ? tomorrow : d;
  }, [tree]);
  const due = picked ?? suggested;
  const valid = name.trim() !== '';

  // The timeline may draw the milestone while the pane is open.
  useEffect(() => {
    setDraftMilestone({ name: name.trim(), due });
  }, [name, due]);
  useEffect(() => () => setDraftMilestone(null), []);

  const submit = () => {
    if (!valid || busy.current) return;
    busy.current = true;
    create.mutate(
      {
        slug,
        body: {
          name: name.trim(),
          due,
          ...(status === 'active' ? { status } : {}),
          ...(goal.trim() ? { description: goal.trim() } : {}),
        },
      },
      { onSettled: () => void (busy.current = false), onSuccess: close },
    );
  };

  return (
    <section
      className="gp-tp gp-tp--form"
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
      <input
        className="gp-tp__title-input"
        dir="auto"
        aria-label="Name"
        placeholder="Milestone name"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <section className="gp-tp__grid gp-tp__grid--due" aria-label="Details">
        <span className="gp-tp__key">Due</span>
        <DateField label="Due" value={due} onChange={setPicked} required inlineCalendar weekStart={settings.data?.week_start === 'sun' ? 'sun' : 'mon'} />
        <span className="gp-tp__key">Status</span>
        <div className="gp-tp__val">
          <Segmented
            label="Status"
            options={[
              { value: 'planned', label: 'Planned' },
              { value: 'active', label: 'Active' },
            ]}
            value={status}
            onChange={setStatus}
          />
        </div>
        <span className="gp-tp__key is-top">Goal</span>
        <textarea className="gp-pane__input gp-tp__goal" dir="auto" aria-label="Goal" rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} />
      </section>
      <footer className="gp-tp__foot gp-tp__foot--form">
        <Button variant="secondary" label="Cancel" onClick={close} />
        <Button variant="primary" label="Create milestone" onClick={submit} disabled={!valid} />
      </footer>
    </section>
  );
}
