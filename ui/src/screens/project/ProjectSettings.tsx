import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'wouter';
import { api } from '../../api/client';
import { useConfigureProject, useProject, useUpdateMilestone } from '../../api/hooks';
import type { ConfigureProjectBody } from '../../api/hooks';
import type { Executor, Priority, ProjectTree } from '../../api/types';
import { paths } from '../../app/routes';
import { today } from '../../app/today';
import { useDraft } from '../../lib/draft';
import { fmtDate } from '../../lib/format';
import { Button, Field, Icon, Page, Segmented } from '../../ui';
import { PALETTE, nextColour, repoFields } from '../../sheets/NewProject';
import { ArchiveProjectSheet } from './ArchiveProjectSheet';
import './project-settings.css';

const PRIORITY: { value: Priority; label: string }[] = [
  { value: 'p1', label: 'P1' },
  { value: 'p2', label: 'P2' },
  { value: 'p3', label: 'P3' },
];
const EXECUTOR: { value: Executor; label: string }[] = [
  { value: 'manual', label: 'Me' },
  { value: 'ai', label: 'AI' },
  { value: 'together', label: 'Together' },
];

type AreaDraft = { id?: string; name: string; color?: string | null };

/** Fallback colour of an area without its own: the palette slot of its position (same as the task pane). */
const areaFallback = (i: number) => `var(--gp-p${(i % 8) + 1})`;

function SettingRow({ label, id, children }: { label: string; id?: string; children: ReactNode }) {
  return (
    <>
      <span className="ps-label" id={id}>
        {label}
      </span>
      <div className="ps-control">{children}</div>
    </>
  );
}

function SetPanel({ title, className, aside, children }: { title: string; className?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className={`ps-panel${className ? ` ${className}` : ''}`} aria-label={title}>
      <div className="ps-panel__head">
        <h2 className="ps-panel__title">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Text field that saves on blur or Enter when the value changed; a refused save restores the server value. */
function TextSetting({
  label,
  value,
  onSave,
  nullable = true,
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (v: string | null) => Promise<unknown>;
  nullable?: boolean;
  placeholder?: string;
}) {
  const d = useDraft(value, (v) => {
    const t = v.trim();
    // Nothing to send: put the server value back.
    if (t === value || (!t && !nullable)) return Promise.reject(new Error('nothing to save'));
    return onSave(t || null);
  });
  return (
    <div className="ps-text" onBlur={d.bind.onBlur} onFocus={d.bind.onFocus} onKeyDown={(e) => !e.nativeEvent.isComposing && d.bind.onKeyDown(e)}>
      <Field label={label} value={d.value} onChange={d.set} placeholder={placeholder} />
    </div>
  );
}

/** An area name that looks like plain text until hovered or focused, then edits in place. */
function InlineName({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => Promise<unknown> }) {
  const d = useDraft(value, (v) => {
    const t = v.trim();
    return !t || t === value ? Promise.reject(new Error('nothing to save')) : onSave(t);
  });
  return (
    <input
      className="ps-area__input"
      dir="auto"
      aria-label={label}
      value={d.value}
      onChange={(e) => d.set(e.target.value)}
      onFocus={d.bind.onFocus}
      onBlur={d.bind.onBlur}
      onKeyDown={(e) => !e.nativeEvent.isComposing && d.bind.onKeyDown(e)}
    />
  );
}

/**
 * A colour swatch button that opens a palette popover (fixed layer, never clipped).
 * A colour outside the palette shows as an extra "Current colour" swatch first.
 */
export function ColourButton({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const open = pos !== null;
  const cur = value.toLowerCase();
  const custom = cur.startsWith('#') && !PALETTE.some((c) => c.hex.toLowerCase() === cur) ? value : null;
  const all: { name: string; hex: string }[] = [...(custom ? [{ name: 'Current colour', hex: custom }] : []), ...PALETTE];

  const close = (refocus = true) => {
    setPos(null);
    if (refocus) btn.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const radios = pop.current?.querySelectorAll<HTMLElement>('[role="radio"]');
    (pop.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? radios?.[0])?.focus();
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setPos(null);
    };
    const away = () => setPos(null);
    document.addEventListener('mousedown', down);
    window.addEventListener('resize', away);
    return () => {
      document.removeEventListener('mousedown', down);
      window.removeEventListener('resize', away);
    };
  }, [open]);

  const toggle = () => {
    if (open) return close();
    const r = btn.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left - 8 });
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const els = [...(pop.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])];
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      els[(i + (e.key === 'ArrowRight' ? 1 : -1) + els.length) % els.length]?.focus();
    } else if (e.key === 'Tab') close(false);
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="ps-swatch"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Change colour"
        style={{ ['--swatch' as string]: value }}
        onClick={toggle}
      />
      {open &&
        createPortal(
          <div ref={pop} className="ps-pop" role="dialog" aria-label={label} style={{ top: pos.top, left: pos.left }} onKeyDown={onKeyDown}>
            <div className="ps-pop__grid" role="radiogroup" aria-label="Colour">
              {all.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  role="radio"
                  aria-checked={cur === c.hex.toLowerCase()}
                  aria-label={c.name}
                  title={c.name}
                  className="ps-pop__swatch"
                  style={{ ['--swatch' as string]: c.hex }}
                  onClick={() => {
                    if (cur !== c.hex.toLowerCase()) onChange(c.hex);
                    close();
                  }}
                />
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function ProjectSettings({ slug }: { slug: string }) {
  const proj = useProject(slug);
  const configure = useConfigureProject();
  const updateMilestone = useUpdateMilestone();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [newArea, setNewArea] = useState<string | null>(null);
  const dragFrom = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const now = today();

  const p = proj.data?.project;
  if (!p) return <section className="gp-page" aria-label="Project settings" />;
  const milestones = proj.data?.milestones ?? [];

  const save = (patch: ConfigureProjectBody) => configure.mutate({ slug, patch });
  const saveAsync = (patch: ConfigureProjectBody) => configure.mutateAsync({ slug, patch });

  /**
   * Area edits always start from the server's current list, never the cached one, so a quick second edit or an
   * agent's change in between can't drop an area. Edits run one after another.
   */
  const editAreas = (change: (list: AreaDraft[]) => AreaDraft[] | null): Promise<unknown> => {
    const run = queue.current.then(async () => {
      const fresh = await qc.fetchQuery({ queryKey: ['project', slug], queryFn: () => api<ProjectTree>('GET', `/api/projects/${encodeURIComponent(slug)}`), staleTime: 0 });
      const next = change(fresh.project.areas.map((a) => ({ id: a.id, name: a.name, color: a.color })));
      if (!next) return;
      await saveAsync({ areas: next });
      await qc.invalidateQueries({ queryKey: ['project', slug] });
    });
    queue.current = run.catch(() => undefined);
    return run;
  };
  const quiet = (pr: Promise<unknown>) => void pr.catch(() => undefined);
  const move = (id: string, toId: string | null, delta = 0) =>
    quiet(
      editAreas((list) => {
        const from = list.findIndex((a) => a.id === id);
        const to = toId ? list.findIndex((a) => a.id === toId) : from + delta;
        if (from < 0 || to < 0 || to >= list.length || from === to) return null;
        const [item] = list.splice(from, 1);
        list.splice(to, 0, item!);
        return list;
      }),
    );
  const rename = (id: string, name: string) => editAreas((list) => list.map((a) => (a.id === id ? { ...a, name } : a)));
  const recolour = (id: string, color: string) => quiet(editAreas((list) => list.map((a) => (a.id === id ? { ...a, color } : a))));
  const removeArea = (id: string) => quiet(editAreas((list) => list.filter((a) => a.id !== id)));
  const addArea = () => {
    const n = (newArea ?? '').trim();
    if (!n) return;
    setNewArea(null);
    quiet(editAreas((list) => (list.some((a) => a.name.toLowerCase() === n.toLowerCase()) ? null : [...list, { name: n, color: nextColour(list.map((a) => a.color)) }])));
  };

  const handleKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      move(id, null, e.key === 'ArrowUp' ? -1 : 1);
    }
  };
  const drop = (e: DragEvent, id: string) => {
    e.preventDefault();
    const from = dragFrom.current;
    dragFrom.current = null;
    setOver(null);
    if (from !== null && from !== id) move(from, id);
  };

  /** One Repository value: GitHub owner/repo or URL, or any other repository address. */
  const repoShown = p.github ?? p.repo ?? '';
  const saveRepo = (v: string | null) => {
    const r = repoFields(v ?? '');
    if (r.github) return saveAsync(p.github === null && p.repo ? { github: r.github, repo: null } : { github: r.github });
    if (r.repo) return saveAsync({ repo: r.repo, github: null });
    return saveAsync({ github: null, repo: null });
  };

  // Done and dropped are engine-only states; the UI treats anything not active as parked.
  const active = p.status === 'active';

  return (
    <Page
      label="Project settings"
      padded
      title={
        <>
          <Link className="ps-crumb" href={paths.project(slug)} dir="auto">
            {p.name}
          </Link>
          <span className="ps-crumb__sep" aria-hidden="true">
            <Icon name="chevron" size={14} />
          </span>
          <span>Settings</span>
        </>
      }
    >
      <div className="ps-cols">
        <div className="ps-col">
          <SetPanel title="General">
            <div className="ps-grid">
              <SettingRow label="Name">
                <TextSetting label="Name" value={p.name} nullable={false} onSave={(v) => (v ? saveAsync({ name: v }) : Promise.reject(new Error('empty name')))} />
              </SettingRow>
              <SettingRow label="Status">
                <div className="ps-status">
                  <span className={`ps-state${active ? '' : ' is-paused'}`}>
                    <span className="ps-state__dot" aria-hidden="true" />
                    {active ? 'Active' : 'Paused'}
                  </span>
                  <span className="ps-status__actions">
                    <button type="button" className="ps-btn" onClick={() => save({ status: active ? 'paused' : 'active' })}>
                      {active ? 'Pause' : 'Resume'}
                    </button>
                    <button type="button" className="ps-btn ps-btn--danger" aria-label="Archive project" onClick={() => setConfirming(true)}>
                      Archive
                    </button>
                  </span>
                </div>
              </SettingRow>
              <SettingRow label="Priority">
                <Segmented label="Priority" options={PRIORITY} value={p.defaultPriority} onChange={(defaultPriority) => save({ defaultPriority })} />
              </SettingRow>
              <SettingRow label="Done by">
                <Segmented label="Done by" options={EXECUTOR} value={p.defaultExecutor} onChange={(defaultExecutor) => save({ defaultExecutor })} />
              </SettingRow>
            </div>
            <p className="ps-hint">Priority and Done by are the defaults for new tasks.</p>
          </SetPanel>

          <SetPanel title="Links">
            <div className="ps-grid">
              <SettingRow label="Repository">
                <TextSetting label="Repository" value={repoShown} placeholder="owner/repo or URL" onSave={saveRepo} />
              </SettingRow>
            </div>
          </SetPanel>
        </div>

        <div className="ps-col">
          <SetPanel title="Milestones" className="ps-panel--list">
            {milestones.length === 0 ? (
              <p className="ps-empty">No milestones yet. Add one from the timeline.</p>
            ) : (
              <ul className="ps-list" aria-label="Milestones">
                {milestones.map((m) => (
                  <li key={m.id} className={`ps-item${m.status === 'done' ? ' is-done' : ''}`}>
                    <ColourButton label={`Colour of ${m.name}`} value={m.color ?? PALETTE[0].hex} onChange={(color) => updateMilestone.mutate({ id: m.id, patch: { color } })} />
                    <span className="ps-item__name" dir="auto" title={m.name}>
                      {m.name}
                    </span>
                    <span className="ps-item__meta num">{m.due ? fmtDate(m.due, now) : 'No date'}</span>
                    <span className="ps-item__count num">{m.tasks.length === 1 ? '1 task' : `${m.tasks.length} tasks`}</span>
                    <span className="ps-item__end" aria-hidden="true" />
                  </li>
                ))}
              </ul>
            )}
          </SetPanel>

          <SetPanel title="Areas" className="ps-panel--list">
            <div className="ps-areas">
              {p.areas.map((a, i) => (
                <div
                  className={`ps-area${over === a.id ? ' is-over' : ''}`}
                  key={a.id}
                  onDragOver={(e) => {
                    if (dragFrom.current === null) return;
                    e.preventDefault();
                    setOver(a.id);
                  }}
                  onDragLeave={() => setOver((o) => (o === a.id ? null : o))}
                  onDrop={(e) => drop(e, a.id)}
                >
                  <button
                    type="button"
                    className="ps-area__handle"
                    draggable
                    aria-label={`Reorder ${a.name}`}
                    title="Drag, or use the arrow keys"
                    onKeyDown={(e) => handleKey(e, a.id)}
                    onDragStart={(e) => {
                      dragFrom.current = a.id;
                      e.dataTransfer.effectAllowed = 'move';
                      const row = e.currentTarget.parentElement;
                      if (row) e.dataTransfer.setDragImage(row, 0, 0);
                    }}
                    onDragEnd={() => {
                      dragFrom.current = null;
                      setOver(null);
                    }}
                  >
                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="9" cy="6" r="1.6" />
                      <circle cx="15" cy="6" r="1.6" />
                      <circle cx="9" cy="12" r="1.6" />
                      <circle cx="15" cy="12" r="1.6" />
                      <circle cx="9" cy="18" r="1.6" />
                      <circle cx="15" cy="18" r="1.6" />
                    </svg>
                  </button>
                  <ColourButton label={`Colour of ${a.name}`} value={a.color ?? areaFallback(i)} onChange={(hex) => recolour(a.id, hex)} />
                  <InlineName label={`Area ${a.name}`} value={a.name} onSave={(v) => rename(a.id, v)} />
                  <span className="ps-item__count num">{a.tasks === 1 ? '1 task' : `${a.tasks} tasks`}</span>
                  <Button
                    variant="icon"
                    icon="close"
                    className="ps-area__delete"
                    label={`Delete ${a.name}`}
                    disabled={a.tasks > 0}
                    title={a.tasks > 0 ? 'Move its tasks to another area first' : undefined}
                    onClick={() => removeArea(a.id)}
                  />
                </div>
              ))}
              {newArea === null ? (
                <button type="button" className="ps-addrow" onClick={() => setNewArea('')}>
                  <Icon name="plus" size={14} />
                  Add area
                </button>
              ) : (
                <div className="ps-addfield">
                  <Field label="New area" value={newArea} onChange={setNewArea} onEnter={addArea} placeholder="New area" submitHint="Add" autoFocus />
                </div>
              )}
            </div>
          </SetPanel>
        </div>
      </div>

      {confirming && <ArchiveProjectSheet project={p} onClose={() => setConfirming(false)} />}
    </Page>
  );
}

