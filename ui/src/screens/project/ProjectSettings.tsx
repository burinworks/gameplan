import { useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useConfigureProject, useProject } from '../../api/hooks';
import type { ConfigureProjectBody } from '../../api/hooks';
import type { Executor, Priority } from '../../api/types';
import { paths } from '../../app/routes';
import { useDraft } from '../../lib/draft';
import { Button, Field, Icon, Page, Segmented } from '../../ui';
import { PALETTE } from '../../sheets/NewProject';
import { ArchiveProjectSheet } from './ArchiveProjectSheet';
import './project-settings.css';

type Status = 'active' | 'paused' | 'done' | 'dropped';
const STATUS: { value: Status; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'done', label: 'Done' },
  { value: 'dropped', label: 'Dropped' },
];
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

function SetPanel({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={`ps-panel${className ? ` ${className}` : ''}`} aria-label={title}>
      <h2 className="ps-panel__title">{title}</h2>
      {children}
    </section>
  );
}

/** Text field that saves on blur or Enter when the value changed; a refused save restores the server value. */
function TextSetting({ label, value, onSave, nullable = true }: { label: string; value: string; onSave: (v: string | null) => Promise<unknown>; nullable?: boolean }) {
  const d = useDraft(value, (v) => {
    const t = v.trim();
    // Nothing to send: put the server value back.
    if (t === value || (!t && !nullable)) return Promise.reject(new Error('nothing to save'));
    return onSave(t || null);
  });
  return (
    <div className="ps-text" onBlur={d.bind.onBlur} onFocus={d.bind.onFocus} onKeyDown={(e) => !e.nativeEvent.isComposing && d.bind.onKeyDown(e)}>
      <Field label={label} value={d.value} onChange={d.set} />
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

/** Colour swatches. A colour outside the palette (a template's) shows as an extra selected swatch. */
function ColourSwatches({ value, onChange }: { value: string | null; onChange: (hex: string) => void }) {
  const cur = value?.toLowerCase() ?? '';
  const custom = cur && !PALETTE.some((c) => c.hex.toLowerCase() === cur) ? value : null;
  const all: { name: string; hex: string }[] = [...(custom ? [{ name: 'Current colour', hex: custom }] : []), ...PALETTE];
  return (
    <div className="ps-colors" role="radiogroup" aria-label="Colour">
      {all.map((c) => (
        <button
          key={c.hex}
          type="button"
          role="radio"
          aria-checked={cur === c.hex.toLowerCase()}
          aria-label={c.name}
          title={c.name}
          className="ps-color"
          style={{ background: c.hex, color: c.hex }}
          onClick={() => onChange(c.hex)}
        />
      ))}
    </div>
  );
}

export function ProjectSettings({ slug }: { slug: string }) {
  const proj = useProject(slug);
  const configure = useConfigureProject();
  const [confirming, setConfirming] = useState(false);
  const [newArea, setNewArea] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState<string | null>(null);
  const dragFrom = useRef<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const p = proj.data?.project;
  if (!p) return <section className="gp-page" aria-label="Project settings" />;

  const save = (patch: ConfigureProjectBody) => configure.mutate({ slug, patch });
  const saveAsync = (patch: ConfigureProjectBody) => configure.mutateAsync({ slug, patch });
  const areas: AreaDraft[] = p.areas.map((a) => ({ id: a.id, name: a.name, color: a.color }));
  const saveAreas = (list: AreaDraft[]) => save({ areas: list });
  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= areas.length) return;
    const list = [...areas];
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item!);
    saveAreas(list);
  };
  const rename = (i: number, name: string) => saveAsync({ areas: areas.map((a, k) => (k === i ? { ...a, name } : a)) });
  const addArea = () => {
    const n = (newArea ?? '').trim();
    if (!n) return;
    setNewArea(null);
    saveAreas([...areas, { name: n }]);
  };
  const addLabel = () => {
    const n = (newLabel ?? '').trim();
    setNewLabel(null);
    if (n && !p.labels.includes(n)) save({ labels: [...p.labels, n] });
  };
  const handleKey = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      reorder(i, i - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      reorder(i, i + 1);
    }
  };
  const drop = (e: DragEvent, i: number) => {
    e.preventDefault();
    const from = dragFrom.current;
    dragFrom.current = null;
    setOver(null);
    if (from !== null) reorder(from, i);
  };

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
              <SettingRow label="Colour">
                <ColourSwatches value={p.color} onChange={(hex) => save({ color: hex })} />
              </SettingRow>
              <SettingRow label="Status">
                <Segmented label="Status" options={STATUS} value={p.status} onChange={(status) => save({ status })} />
              </SettingRow>
            </div>
          </SetPanel>

          <SetPanel title="Links">
            <div className="ps-grid">
              <SettingRow label="Vault note">
                <TextSetting label="Vault note" value={p.vaultNote ?? ''} onSave={(v) => saveAsync({ vaultNote: v })} />
              </SettingRow>
              <SettingRow label="Repository">
                <TextSetting label="Repository" value={p.repo ?? ''} onSave={(v) => saveAsync({ repo: v })} />
              </SettingRow>
              <SettingRow label="GitHub">
                <TextSetting label="GitHub" value={p.github ?? ''} onSave={(v) => saveAsync({ github: v })} />
              </SettingRow>
            </div>
          </SetPanel>

          <SetPanel title="New tasks">
            <div className="ps-grid">
              <SettingRow label="Priority">
                <Segmented label="Priority" options={PRIORITY} value={p.defaultPriority} onChange={(defaultPriority) => save({ defaultPriority })} />
              </SettingRow>
              <SettingRow label="Done by">
                <Segmented label="Done by" options={EXECUTOR} value={p.defaultExecutor} onChange={(defaultExecutor) => save({ defaultExecutor })} />
              </SettingRow>
            </div>
          </SetPanel>
        </div>

        <div className="ps-col">
          <SetPanel title="Areas" className="ps-panel--areas">
            <div className="ps-areas">
              {p.areas.map((a, i) => (
                <div
                  className={`ps-area${over === i ? ' is-over' : ''}`}
                  key={a.id}
                  onDragOver={(e) => {
                    if (dragFrom.current === null) return;
                    e.preventDefault();
                    setOver(i);
                  }}
                  onDragLeave={() => setOver((o) => (o === i ? null : o))}
                  onDrop={(e) => drop(e, i)}
                >
                  <button
                    type="button"
                    className="ps-area__handle"
                    draggable
                    aria-label={`Reorder ${a.name}`}
                    title="Drag, or use the arrow keys"
                    onKeyDown={(e) => handleKey(e, i)}
                    onDragStart={(e) => {
                      dragFrom.current = i;
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
                  <span className="ps-area__swatch" style={{ background: a.color ?? p.color ?? 'var(--gp-text3)' }} aria-hidden="true" />
                  <InlineName label={`Area ${a.name}`} value={a.name} onSave={(v) => rename(i, v)} />
                  <span className="ps-area__count num">{a.tasks === 1 ? '1 task' : `${a.tasks} tasks`}</span>
                  <Button
                    variant="icon"
                    icon="close"
                    className="ps-area__delete"
                    label={`Delete ${a.name}`}
                    disabled={a.tasks > 0}
                    title={a.tasks > 0 ? 'Move its tasks to another area first' : undefined}
                    onClick={() => saveAreas(areas.filter((x) => x.id !== a.id))}
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
                  <Field
                    label="New area"
                    value={newArea}
                    onChange={setNewArea}
                    onEnter={addArea}
                    placeholder="New area"
                    submitHint="Add"
                    autoFocus
                  />
                </div>
              )}
            </div>
          </SetPanel>

          <SetPanel title="Labels">
            <div className="ps-labels">
              {p.labels.map((l) => (
                <span className="ps-chip" key={l}>
                  <span dir="auto">{l}</span>
                  <button type="button" className="ps-chip__x" aria-label={`Remove ${l}`} onClick={() => save({ labels: p.labels.filter((x) => x !== l) })}>
                    <Icon name="close" size={10} />
                  </button>
                </span>
              ))}
              {newLabel === null ? (
                <button type="button" className="ps-plus" aria-label="Add label" onClick={() => setNewLabel('')}>
                  <Icon name="plus" size={12} />
                </button>
              ) : (
                <div className="ps-addfield ps-addfield--label">
                  <Field
                    label="New label"
                    value={newLabel}
                    onChange={setNewLabel}
                    onEnter={addLabel}
                    placeholder="New label"
                    submitHint="Add"
                    compact
                    autoFocus
                  />
                </div>
              )}
            </div>
          </SetPanel>

          <section className="ps-panel ps-panel--row" aria-label="Archive">
            <h2 className="ps-panel__title">Archive project</h2>
            <button type="button" className="ps-danger" aria-label="Archive project" onClick={() => setConfirming(true)}>
              Archive
            </button>
          </section>
        </div>
      </div>

      {confirming && <ArchiveProjectSheet project={p} onClose={() => setConfirming(false)} />}
    </Page>
  );
}
