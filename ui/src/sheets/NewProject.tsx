import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useCreateProject, useSettings, useTemplates, type CreateProjectBody } from '../api/hooks';
import { paths } from '../app/routes';
import { today } from '../app/today';
import { fmtDate } from '../lib/format';
import { Button, DateField, Field, Sheet, TokenField, addDays } from '../ui';
import './new-project.css';

/** Milestone and area palette in assignment order. Same hex values the engine assigns to new milestones. */
export const PALETTE = [
  { name: 'Indigo', hex: '#6E7CF5' },
  { name: 'Amber', hex: '#D9892B' },
  { name: 'Teal', hex: '#3FA796' },
  { name: 'Orchid', hex: '#B66AD0' },
  { name: 'Slate', hex: '#7A8B99' },
  { name: 'Coral', hex: '#E07A5F' },
  { name: 'Sky', hex: '#4E9BD6' },
  { name: 'Olive', hex: '#9AA24A' },
] as const;

/** First palette colour not in `used` (case-insensitive), else the next one round-robin. */
export function nextColour(used: (string | null | undefined)[]): string {
  const taken = new Set(used.filter(Boolean).map((c) => c!.toLowerCase()));
  return (PALETTE.find((c) => !taken.has(c.hex.toLowerCase())) ?? PALETTE[used.length % PALETTE.length]!).hex;
}

/**
 * One "Repository" value split into the engine's two fields: GitHub `owner/repo` or a github.com URL goes to
 * `github`, anything else (another host, a local path) to `repo`. Empty clears both.
 */
export function repoFields(value: string): { github: string | null; repo: string | null } {
  const v = value.trim();
  if (!v) return { github: null, repo: null };
  const isGithub = /^[\w.-]+\/[\w.-]+$/.test(v) || /^https?:\/\/(www\.)?github\.com\//i.test(v);
  return isGithub ? { github: v, repo: null } : { github: null, repo: v };
}

const BLANK = 'blank';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** 16px line glyph per template; unknown templates get a stack. */
function TemplateGlyph({ id }: { id: string }) {
  const paths: Record<string, ReactNode> = {
    blank: <path d="M12 8v8M8 12h8M5 5h14v14H5z" />,
    report: <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 15h5M10 18h3" />,
    launch: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
    research: <path d="M10.5 4a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM15.5 15.5L20 20" />,
  };
  return (
    <svg className="np-card__glyph" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {paths[id] ?? <path d="M4 8l8-4 8 4-8 4zM4 12l8 4 8-4M4 16l8 4 8-4" />}
    </svg>
  );
}

function Row({ label, top, children }: { label: string; top?: boolean; children: ReactNode }) {
  return (
    <>
      <span className={`np-label${top ? ' np-label--top' : ''}`}>{label}</span>
      <div className="np-control">{children}</div>
    </>
  );
}

export function NewProject({ onClose }: { onClose(): void }) {
  const [, navigate] = useLocation();
  const templates = useTemplates();
  const settings = useSettings();
  const create = useCreateProject();
  const now = today();

  const [start, setStart] = useState(BLANK);
  const [startDate, setStartDate] = useState(now);
  const [name, setName] = useState('');
  const [areas, setAreas] = useState<string[]>([]);
  const [repository, setRepository] = useState('');
  const weekStart = settings.data?.week_start === 'sun' ? 'sun' : 'mon';

  const list = templates.data ?? [];
  const tpl = list.find((t) => t.id === start);
  const tplAreas = tpl?.areas ?? [];
  const cards = [
    { id: BLANK, name: 'Blank', meta: ['Empty project', 'Add your own'] },
    ...list.map((t) => ({ id: t.id as string, name: t.name, meta: [plural(t.milestones, 'milestone'), plural(t.tasks, 'task')] })),
  ];
  const preview = (tpl?.milestoneOffsets ?? []).map((m, i) => ({ name: m.name, date: fmtDate(addDays(startDate, m.offsetDays), now), color: PALETTE[i % PALETTE.length]!.hex }));
  const valid = name.trim().length > 0;

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
    const body: CreateProjectBody = { name: n };
    const r = repoFields(repository);
    if (r.github) body.github = r.github;
    if (r.repo) body.repo = r.repo;
    const extra = areas.filter((a) => !tplAreas.some((t) => same(t, a))).map((a) => ({ name: a }));
    if (extra.length) body.areas = extra;
    if (tpl) {
      body.template = tpl.id;
      body.startDate = startDate;
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
          <Button variant="primary" className="np-create" label="Create project" disabled={!valid || create.isPending} onClick={submit} />
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
              aria-label={c.name}
              aria-describedby={`np-meta-${c.id}`}
              tabIndex={start === c.id ? 0 : -1}
              className="np-card"
              onClick={() => pick(c.id)}
              onKeyDown={(e) => onCardKey(e, i)}
            >
              <span className="np-card__head">
                <TemplateGlyph id={c.id} />
                <span className="np-card__name" dir="auto">
                  {c.name}
                </span>
              </span>
              <span className="np-card__meta" id={`np-meta-${c.id}`}>
                {c.meta.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </span>
            </button>
          ))}
        </div>

        <input
          className="np-name"
          dir="auto"
          aria-label="Name"
          placeholder="Project name"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && submit()}
        />

        <div className="np-grid">
          <Row label="Areas" top>
            <TokenField label="Areas" tokens={areas} onChange={changeAreas} placeholder="Add an area…" removable={(a) => !tplAreas.some((t) => same(t, a))} />
          </Row>

          {tpl && (
            <Row label="Starts" top>
              <div className="np-start">
                <DateField label="Starts" value={startDate} onChange={setStartDate} required weekStart={weekStart} />
                <ul className="np-preview" aria-label="Milestones">
                  {preview.map((m) => (
                    <li key={m.name} className="np-preview__item">
                      <span className="np-preview__diamond" aria-hidden="true" style={{ background: m.color }} />
                      <span dir="auto">{m.name}</span>
                      <span className="np-preview__date num">{m.date}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Row>
          )}

          <Row label="Repository">
            <Field label="Repository" value={repository} onChange={setRepository} onEnter={submit} placeholder="owner/repo or URL" />
          </Row>
        </div>
      </div>
    </Sheet>
  );
}
