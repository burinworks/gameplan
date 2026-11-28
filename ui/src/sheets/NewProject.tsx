import { useState, type KeyboardEvent } from 'react';
import { useLocation } from 'wouter';
import { useCreateProject, useProjects, useSettings, useTemplates, type CreateProjectBody } from '../api/hooks';
import { paths } from '../app/routes';
import { today } from '../app/today';
import { fmtDate } from '../lib/format';
import { Button, DateField, Field, Sheet, TokenField, addDays } from '../ui';
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
          style={{ ['--swatch' as string]: c.hex }}
          onClick={() => onChange(c.hex)}
        />
      ))}
    </div>
  );
}

const BLANK = 'blank';
const FIRST_MILESTONE_DAYS = 14;

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function NewProject({ onClose }: { onClose(): void }) {
  const [, navigate] = useLocation();
  const templates = useTemplates();
  const projects = useProjects('all');
  const settings = useSettings();
  const create = useCreateProject();
  const now = today();

  const [start, setStart] = useState(BLANK);
  const [startDate, setStartDate] = useState(now);
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [areas, setAreas] = useState<string[]>([]);
  const [milestone, setMilestone] = useState('');
  const [due, setDue] = useState(addDays(now, FIRST_MILESTONE_DAYS));
  const [github, setGithub] = useState('');
  const [vault, setVault] = useState('');

  const used = new Set((projects.data ?? []).map((p) => p.color?.toLowerCase()));
  const next = PALETTE.find((c) => !used.has(c.hex.toLowerCase())) ?? PALETTE[(projects.data?.length ?? 0) % PALETTE.length]!;
  const color = chosen ?? next.hex;
  const weekStart = settings.data?.week_start === 'sun' ? 'sun' : 'mon';

  const list = templates.data ?? [];
  const tpl = list.find((t) => t.id === start);
  const tplAreas = tpl?.areas ?? [];
  const cards = [
    { id: BLANK, name: 'Blank', meta: 'Empty project' },
    ...list.map((t) => ({ id: t.id as string, name: t.name, meta: `${plural(t.milestones, 'milestone')} · ${plural(t.tasks, 'task')}` })),
  ];
  const preview = (tpl?.milestoneOffsets ?? []).map((m) => `${m.name} ${fmtDate(addDays(startDate, m.offsetDays), now)}`).join(' · ');

  /** Picking a template prefills its areas and keeps any the user added; going back to Blank drops the template's. */
  const pick = (id: string) => {
    const nextAreas = list.find((t) => t.id === id)?.areas ?? [];
    setAreas((cur) => [...nextAreas, ...cur.filter((a) => !tplAreas.some((t) => same(t, a)) && !nextAreas.some((t) => same(t, a)))]);
    setStart(id);
  };
  const onCardKey = (e: KeyboardEvent<HTMLElement>, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const at = (i + d + cards.length) % cards.length;
    pick(cards[at]!.id);
    e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]')[at]?.focus();
  };
  /** The engine always creates a template's areas, so removing one snaps it back. */
  const changeAreas = (tokens: string[]) => setAreas([...tplAreas, ...tokens.filter((x) => !tplAreas.some((t) => same(t, x)))]);

  const submit = () => {
    const n = name.trim();
    if (!n || create.isPending) return;
    const body: CreateProjectBody = { name: n, color };
    if (vault.trim()) body.vaultNote = vault.trim();
    if (github.trim()) body.github = github.trim();
    const extra = areas.filter((a) => !tplAreas.some((t) => same(t, a))).map((a) => ({ name: a }));
    if (extra.length) body.areas = extra;
    if (tpl) {
      body.template = tpl.id;
      body.startDate = startDate;
    } else if (milestone.trim()) {
      body.firstMilestone = { name: milestone.trim(), due };
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
        <div className="np-cards" role="radiogroup" aria-label="Start from">
          {cards.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={start === c.id}
              tabIndex={start === c.id ? 0 : -1}
              className="np-card"
              onClick={() => pick(c.id)}
              onKeyDown={(e) => onCardKey(e, i)}
            >
              <span className="np-card__name" dir="auto">
                {c.name}
              </span>
              <span className="np-card__meta">{c.meta}</span>
            </button>
          ))}
        </div>

        <div className="np-title">
          <span className="np-title__swatch" aria-hidden="true" style={{ background: color }} />
          <input
            className="np-title__input"
            dir="auto"
            aria-label="Name"
            placeholder="Project name"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && submit()}
          />
        </div>

        <div className="np-grid">
          <span className="np-label">Colour</span>
          <ColorPicker value={color} onChange={setChosen} />

          <span className="np-label np-label--top">Areas</span>
          <TokenField label="Areas" tokens={areas} onChange={changeAreas} placeholder="Add an area…" removable={(a) => !tplAreas.some((t) => same(t, a))} />

          {tpl ? (
            <>
              <span className="np-label">Starts</span>
              <div className="np-start">
                <DateField label="Starts" value={startDate} onChange={setStartDate} required weekStart={weekStart} />
                <span className="np-preview">
                  <span className="np-preview__diamond" aria-hidden="true" style={{ background: color }} />
                  {preview}
                </span>
              </div>
            </>
          ) : (
            <>
              <span className="np-label">First milestone</span>
              <div className="np-pair">
                <Field label="First milestone" value={milestone} onChange={setMilestone} placeholder="Milestone name" />
                <DateField label="First milestone due" value={due} onChange={setDue} required weekStart={weekStart} />
              </div>
            </>
          )}

          <span className="np-label">GitHub</span>
          <Field label="GitHub" value={github} onChange={setGithub} placeholder="owner/repo" />

          <span className="np-label">Vault note</span>
          <Field label="Vault note" value={vault} onChange={setVault} />
        </div>
      </div>
    </Sheet>
  );
}
