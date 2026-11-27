import { useState } from 'react';
import { useLocation } from 'wouter';
import { useCreateProject, useProjects, useTemplates, type CreateProjectBody } from '../api/hooks';
import { paths } from '../app/routes';
import { today } from '../app/today';
import { Button, Field, Segmented, Sheet } from '../ui';
import './new-project.css';

/** Project palette in assignment order (docs/ui/ui-tokens.md). The engine stores hex. */
export const PALETTE = [
  { name: 'Indigo', hex: '#6E7CF5' },
  { name: 'Amber', hex: '#D9892B' },
  { name: 'Teal', hex: '#3FA796' },
  { name: 'Orchid', hex: '#B66AD0' },
  { name: 'Slate', hex: '#7A8B99' },
  { name: 'Coral', hex: '#E0695A' },
  { name: 'Sky', hex: '#5A9BD5' },
  { name: 'Olive', hex: '#9AA04A' },
] as const;

/** Radiogroup of the eight palette swatches. */
export function ColorPicker({ value, onChange }: { value: string | null; onChange: (hex: string) => void }) {
  const cur = value?.toLowerCase();
  return (
    <div className="np-colors" role="radiogroup" aria-label="Colour">
      {PALETTE.map((c) => (
        <button
          key={c.hex}
          type="button"
          role="radio"
          aria-checked={cur === c.hex.toLowerCase()}
          aria-label={c.name}
          title={c.name}
          className="np-color"
          style={{ background: c.hex }}
          onClick={() => onChange(c.hex)}
        />
      ))}
    </div>
  );
}

const DEFAULT_AREAS = ['AI', 'Frontend', 'Backend', 'Design', 'QA'];

export function NewProject({ onClose }: { onClose(): void }) {
  const [, navigate] = useLocation();
  const templates = useTemplates();
  const projects = useProjects('all');
  const create = useCreateProject();

  const [start, setStart] = useState('blank');
  const [startDate, setStartDate] = useState(today());
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [areaNames, setAreaNames] = useState<string[]>(DEFAULT_AREAS);
  const [picked, setPicked] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [newArea, setNewArea] = useState('');
  const [milestone, setMilestone] = useState('');
  const [due, setDue] = useState('');
  const [github, setGithub] = useState('');
  const [vault, setVault] = useState('');

  const used = new Set((projects.data ?? []).map((p) => p.color?.toLowerCase()));
  const next = PALETTE.find((c) => !used.has(c.hex.toLowerCase())) ?? PALETTE[(projects.data?.length ?? 0) % PALETTE.length]!;
  const color = chosen ?? next.hex;

  const tpl = (templates.data ?? []).find((t) => t.id === start);
  const options = [{ value: 'blank', label: 'Blank' }, ...(templates.data ?? []).map((t) => ({ value: t.id as string, label: t.name }))];

  const toggle = (a: string) => setPicked((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]));
  const addArea = () => {
    const n = newArea.trim();
    if (n && !areaNames.some((a) => a.toLowerCase() === n.toLowerCase())) {
      setAreaNames((l) => [...l, n]);
      setPicked((p) => [...p, n]);
    }
    setNewArea('');
    setAdding(false);
  };

  const submit = () => {
    const n = name.trim();
    if (!n || create.isPending) return;
    const body: CreateProjectBody = { name: n, color };
    if (vault.trim()) body.vaultNote = vault.trim();
    if (github.trim()) body.github = github.trim();
    if (tpl) {
      body.template = tpl.id;
      body.startDate = startDate;
    } else {
      const areas = areaNames.filter((a) => picked.includes(a)).map((a) => ({ name: a }));
      if (areas.length) body.areas = areas;
      if (milestone.trim()) body.firstMilestone = { name: milestone.trim(), ...(due ? { due } : {}) };
    }
    create.mutate(body, {
      onSuccess: (p) => {
        navigate(paths.project(p.slug));
        onClose();
      },
    });
  };

  return (
    <Sheet
      title="New project"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" label="Cancel" onClick={onClose} />
          <Button variant="primary" label="Create project" disabled={!name.trim() || create.isPending} onClick={submit} />
        </>
      }
    >
      <div className="np">
        <div className="np-row">
          <span className="np-label">Start from</span>
          <Segmented label="Start from" options={options} value={start} onChange={setStart} />
          {tpl && (
            <span className="np-meta">
              {tpl.milestones} milestones · {tpl.tasks} tasks
            </span>
          )}
        </div>
        {tpl && (
          <div className="np-row">
            <span className="np-label">Start date</span>
            <input className="np-date" type="date" aria-label="Start date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
        )}
        <div className="np-row">
          <span className="np-label">Name</span>
          <Field label="Name" value={name} onChange={setName} onEnter={submit} autoFocus />
        </div>
        <div className="np-row">
          <span className="np-label">Colour</span>
          <ColorPicker value={color} onChange={setChosen} />
        </div>
        {!tpl && (
          <>
            <div className="np-row">
              <span className="np-label">Areas</span>
              <div className="np-chips">
                {areaNames.map((a) => (
                  <button key={a} type="button" className="np-chip" aria-pressed={picked.includes(a)} onClick={() => toggle(a)}>
                    {a}
                  </button>
                ))}
                {adding ? (
                  <span className="np-addfield">
                    <Field label="New area" value={newArea} onChange={setNewArea} onEnter={addArea} autoFocus />
                  </span>
                ) : (
                  <Button variant="quiet" label="Add" onClick={() => setAdding(true)} />
                )}
              </div>
            </div>
            <div className="np-row">
              <span className="np-label">First milestone</span>
              <div className="np-pair">
                <Field label="First milestone" value={milestone} onChange={setMilestone} />
                <input className="np-date" type="date" aria-label="First milestone due" value={due} onChange={(e) => setDue(e.target.value)} />
              </div>
            </div>
          </>
        )}
        <div className="np-row">
          <span className="np-label">GitHub</span>
          <Field label="GitHub" value={github} onChange={setGithub} placeholder="owner/repo" />
        </div>
        <div className="np-row">
          <span className="np-label">Vault note</span>
          <Field label="Vault note" value={vault} onChange={setVault} />
        </div>
      </div>
    </Sheet>
  );
}
