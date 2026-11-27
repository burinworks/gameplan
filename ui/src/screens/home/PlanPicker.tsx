import { useMemo, useState } from 'react';
import { useHome, usePlanDay } from '../../api/hooks';
import { Button, Checkbox, Sheet, Swatch } from '../../ui';
import './home.css';

const MAX = 3;

/** Pick up to three open tasks for today, each with an optional "when" in the user's own words. */
export function PlanPicker({ onClose }: { onClose(): void }) {
  const home = useHome();
  const plan = usePlanDay();
  const [picked, setPicked] = useState<string[]>([]);
  const [when, setWhen] = useState<Record<string, string>>({});

  const candidates = useMemo(() => {
    const h = home.data;
    if (!h) return [];
    const seen = new Set<string>();
    const out: { id: string; title: string; projectName: string; color: string | null }[] = [];
    for (const t of [...h.todayTasks, ...h.pickUp.map((p) => p.task), ...h.alsoToday]) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
    return out;
  }, [home.data]);

  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? (p.length < MAX && !p.includes(id) ? [...p, id] : p) : p.filter((x) => x !== id)));

  const submit = () => {
    if (!home.data || picked.length === 0 || plan.isPending) return;
    const items = picked.map((taskId) => ({ taskId, when: when[taskId]?.trim() || null }));
    plan.mutate({ date: home.data.today, items }, { onSuccess: onClose });
  };

  return (
    <Sheet
      title="Plan my day"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" label="Cancel" onClick={onClose} />
          <Button variant="primary" label="Plan" onClick={submit} disabled={picked.length === 0 || plan.isPending} />
        </>
      }
    >
      <ul className="home-pick">
        {candidates.map((t) => {
          const on = picked.includes(t.id);
          const locked = !on && picked.length >= MAX;
          return (
            <li key={t.id} className="home-pick__row">
              <Checkbox checked={on} state={locked ? 'locked' : undefined} label={t.title} onChange={(v) => toggle(t.id, v)} />
              <Swatch color={t.color} />
              <span className="home-pick__text">
                <span className="home-pick__title" dir="auto" title={t.title}>
                  {t.title}
                </span>
                <span className="home-pick__meta" dir="auto">
                  {t.projectName}
                </span>
              </span>
              {on && (
                <input
                  className="home-pick__when"
                  dir="auto"
                  placeholder="when…"
                  aria-label={`When for ${t.title}`}
                  value={when[t.id] ?? ''}
                  onChange={(e) => setWhen((w) => ({ ...w, [t.id]: e.target.value }))}
                />
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
