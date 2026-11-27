import { useEffect, useState, type ReactNode } from 'react';
import { useConfigureProject, useProject } from '../../api/hooks';
import type { ConfigureProjectBody } from '../../api/hooks';
import type { Executor, Priority } from '../../api/types';
import { Button, Chip, Field, Panel, Segmented, Swatch } from '../../ui';
import { ColorPicker } from '../../sheets/NewProject';
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

function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ps-row">
      <span className="ps-label">{label}</span>
      <div className="ps-control">{children}</div>
    </div>
  );
}

/** Text field that saves on blur when the value changed. */
function TextSetting({ label, value, onSave, nullable = true }: { label: string; value: string; onSave: (v: string | null) => void; nullable?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    const t = v.trim();
    if (t === value) return;
    if (!t && !nullable) return setV(value);
    onSave(t || null);
  };
  return (
    <div onBlur={commit}>
      <Field label={label} value={v} onChange={setV} onEnter={commit} />
    </div>
  );
}

export function ProjectSettings({ slug }: { slug: string }) {
  const proj = useProject(slug);
  const configure = useConfigureProject();
  const [confirming, setConfirming] = useState(false);
  const [newArea, setNewArea] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const p = proj.data?.project;
  if (!p) return <section aria-label="Project settings" />;

  const save = (patch: ConfigureProjectBody) => configure.mutate({ slug, patch });
  const areas: AreaDraft[] = p.areas.map((a) => ({ id: a.id, name: a.name, color: a.color }));
  const saveAreas = (list: AreaDraft[]) => save({ areas: list });
  const move = (i: number, d: -1 | 1) => {
    const list = [...areas];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    saveAreas(list);
  };
  const rename = (i: number, name: string | null) => {
    if (!name) return;
    saveAreas(areas.map((a, k) => (k === i ? { ...a, name } : a)));
  };
  const addArea = () => {
    const n = newArea.trim();
    if (!n) return;
    setNewArea('');
    saveAreas([...areas, { name: n }]);
  };
  const addLabel = () => {
    const n = newLabel.trim();
    setNewLabel('');
    if (n && !p.labels.includes(n)) save({ labels: [...p.labels, n] });
  };

  return (
    <section className="ps" aria-label="Project settings">
      <h1 className="ps-title" dir="auto">
        <Swatch color={p.color} />
        {p.name}
      </h1>

      <Panel title="General">
        <SettingRow label="Name">
          <TextSetting label="Name" value={p.name} nullable={false} onSave={(v) => v && save({ name: v })} />
        </SettingRow>
        <SettingRow label="Colour">
          <ColorPicker value={p.color} onChange={(hex) => save({ color: hex })} />
        </SettingRow>
        <SettingRow label="Status">
          <Segmented label="Status" options={STATUS} value={p.status} onChange={(status) => save({ status })} />
        </SettingRow>
      </Panel>

      <Panel title="Links">
        <SettingRow label="Vault note">
          <TextSetting label="Vault note" value={p.vaultNote ?? ''} onSave={(v) => save({ vaultNote: v })} />
        </SettingRow>
        <SettingRow label="Repository">
          <TextSetting label="Repository" value={p.repo ?? ''} onSave={(v) => save({ repo: v })} />
        </SettingRow>
        <SettingRow label="GitHub">
          <TextSetting label="GitHub" value={p.github ?? ''} onSave={(v) => save({ github: v })} />
        </SettingRow>
      </Panel>

      <Panel title="New tasks">
        <SettingRow label="Default priority">
          <Segmented label="Default priority" options={PRIORITY} value={p.defaultPriority} onChange={(defaultPriority) => save({ defaultPriority })} />
        </SettingRow>
        <SettingRow label="Default executor">
          <Segmented label="Default executor" options={EXECUTOR} value={p.defaultExecutor} onChange={(defaultExecutor) => save({ defaultExecutor })} />
        </SettingRow>
      </Panel>

      <Panel title="Areas">
        {p.areas.map((a, i) => (
          <div className="ps-area" key={a.id}>
            <Swatch color={a.color ?? p.color} />
            <div className="ps-area__name">
              <TextSetting label={`Area ${a.name}`} value={a.name} nullable={false} onSave={(v) => rename(i, v)} />
            </div>
            <span className="ps-area__count num">{a.tasks === 1 ? '1 task' : `${a.tasks} tasks`}</span>
            <span className="ps-area__up">
              <Button variant="icon" icon="chevron" label={`Move ${a.name} up`} disabled={i === 0} onClick={() => move(i, -1)} />
            </span>
            <Button variant="icon" icon="chevron" label={`Move ${a.name} down`} disabled={i === p.areas.length - 1} onClick={() => move(i, 1)} />
            <Button
              variant="icon"
              icon="close"
              label={`Delete ${a.name}`}
              disabled={a.tasks > 0}
              title={a.tasks > 0 ? 'Move its tasks to another area first' : undefined}
              onClick={() => saveAreas(areas.filter((x) => x.id !== a.id))}
            />
          </div>
        ))}
        <div className="ps-add">
          <Field label="New area" value={newArea} onChange={setNewArea} onEnter={addArea} placeholder="New area" />
          <Button variant="secondary" label="Add area" onClick={addArea} disabled={!newArea.trim()} />
        </div>
      </Panel>

      <Panel title="Labels">
        <div className="ps-labels">
          {p.labels.map((l) => (
            <span className="ps-label-chip" key={l}>
              <Chip>{l}</Chip>
              <Button variant="icon" icon="close" label={`Remove ${l}`} onClick={() => save({ labels: p.labels.filter((x) => x !== l) })} />
            </span>
          ))}
        </div>
        <div className="ps-add">
          <Field label="New label" value={newLabel} onChange={setNewLabel} onEnter={addLabel} placeholder="New label" />
          <Button variant="secondary" label="Add label" onClick={addLabel} disabled={!newLabel.trim()} />
        </div>
      </Panel>

      <Panel title="Archive">
        <div className="ps-archive">
          <Button variant="secondary" className="ps-danger" label="Archive project" onClick={() => setConfirming(true)} />
        </div>
      </Panel>

      {confirming && <ArchiveProjectSheet project={p} onClose={() => setConfirming(false)} />}
    </section>
  );
}
