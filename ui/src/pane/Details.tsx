import { useQueryClient } from '@tanstack/react-query';
import type { KeyboardEvent, ReactNode } from 'react';
import { useConfigureProject } from '../api/hooks';
import type { Executor, Priority, ProjectTree } from '../api/types';
import { executorLabel } from '../lib/format';
import { Icon, Menu, type MenuItem, type SelectOption } from '../ui';

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'p1', label: 'P1' },
  { value: 'p2', label: 'P2' },
  { value: 'p3', label: 'P3' },
];
export const EXECUTORS: { value: Executor; label: string }[] = [
  { value: 'manual', label: executorLabel('manual') },
  { value: 'ai', label: executorLabel('ai') },
  { value: 'together', label: executorLabel('together') },
];

const PALETTE = ['--gp-p1', '--gp-p2', '--gp-p3', '--gp-p4', '--gp-p5', '--gp-p6', '--gp-p7', '--gp-p8'];

/** Area options for a Select: a "None" entry, then each area with its swatch. */
export function areaOptions(areas: ProjectTree['project']['areas']): SelectOption[] {
  return [{ value: '', label: 'None' }, ...areas.map((a, i) => ({ value: a.name, label: a.name, swatch: a.color ?? `var(${PALETTE[i % PALETTE.length]})` }))];
}

/** Milestone options for a Select: each milestone with its colour diamond. */
export function milestoneOptions(tree: ProjectTree | undefined): SelectOption[] {
  return (tree?.milestones ?? []).map((m) => ({ value: m.id, label: m.name, diamond: m.color ?? 'var(--gp-text3)' }));
}

/** "Add new…" handler for the Area select. Resolves to the value to select. */
export function useAddNew(slug: string, tree: ProjectTree | undefined) {
  const configure = useConfigureProject();
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ['project', slug] });
  return {
    area: async (name: string) => {
      // The whole list is sent: never from a project that has not loaded (it would drop the existing areas).
      if (!tree) throw new Error('project not loaded');
      const areas = tree.project.areas;
      const same = areas.find((a) => a.name.toLowerCase() === name.toLowerCase());
      if (same) return same.name;
      await configure.mutateAsync({ slug, patch: { areas: [...areas.map((a) => ({ id: a.id, name: a.name })), { name }] } });
      refresh();
      return name;
    },
  };
}

/** One label + value row of the details grid. */
export function Row({ label, children, top }: { label: string; children: ReactNode; top?: boolean }) {
  return (
    <>
      <span className={`gp-tp__key${top ? ' is-top' : ''}`}>{label}</span>
      <div className="gp-tp__val">{children}</div>
    </>
  );
}

/** A dependency target: another task, or a milestone being done. */
export interface DepTarget {
  kind: 'task' | 'milestone';
  id: string;
  title: string;
  color?: string | null;
}

export interface Dep extends DepTarget {
  /** Removal key (the dependency id, or the target id for drafts). */
  key: string;
  bad?: boolean;
}

export const depLabel = (d: { kind: 'task' | 'milestone'; title: string }) => (d.kind === 'milestone' ? `${d.title} done` : d.title);

/**
 * What a task can depend on, grouped by milestone: "<milestone> done" (except the task's own milestone, which would
 * be a loop) followed by that milestone's tasks.
 */
export function depTargets(tree: ProjectTree | undefined, self: { taskId?: string; milestoneId?: string }, taken: Set<string>): (DepTarget & { group: string })[] {
  const out: (DepTarget & { group: string })[] = [];
  for (const m of tree?.milestones ?? []) {
    if (m.id !== self.milestoneId && !taken.has(m.id)) out.push({ kind: 'milestone', id: m.id, title: m.name, color: m.color, group: m.id });
    for (const t of m.tasks) if (t.id !== self.taskId && !taken.has(t.id)) out.push({ kind: 'task', id: t.id, title: t.title, color: m.color, group: m.id });
  }
  return out;
}

function DepMark({ d }: { d: DepTarget }) {
  return d.kind === 'milestone' ? (
    <span className="gp-tp__dep-dia" style={{ background: d.color ?? undefined }} aria-hidden="true" />
  ) : (
    <span className="gp-tp__dep-bar" style={{ background: d.color ?? undefined }} aria-hidden="true" />
  );
}

/** Menu items for a list of targets: milestone rows carry a diamond, task rows an indent and a small bar. */
export function depItems(targets: (DepTarget & { group: string })[], onAdd: (t: DepTarget) => void): MenuItem[] {
  return targets.map((t) => ({
    label: depLabel(t),
    leading: <span className={`gp-tp__dep-lead${t.kind === 'task' ? ' is-task' : ''}`}>{<DepMark d={t} />}</span>,
    onSelect: () => onAdd(t),
  }));
}

/**
 * A chip per dependency (removable with ×) and a "+" that opens the targets that can still be added.
 * `addLabel` names the "+" button (e.g. "Add dependency").
 */
export function DepChips({ deps, onRemove, items, addLabel }: { deps: Dep[]; onRemove: (key: string) => void; items: MenuItem[]; addLabel: string }) {
  return (
    <div className="gp-tp__deps">
      {deps.map((d) => (
        <span key={d.key} className={`gp-tp__dep${d.bad ? ' is-bad' : ''}`}>
          <DepMark d={d} />
          <span className="gp-tp__dep-title" dir="auto" title={depLabel(d)}>
            {depLabel(d)}
          </span>
          <button type="button" className="gp-tp__dep-x" aria-label={`Remove ${depLabel(d)}`} onClick={() => onRemove(d.key)}>
            <Icon name="close" size={10} />
          </button>
        </span>
      ))}
      {items.length > 0 && (
        <Menu
          label={addLabel}
          align="start"
          triggerClassName="gp-tp__plus"
          trigger={
            <>
              <Icon name="plus" size={12} />
              Add
            </>
          }
          items={items}
        />
      )}
    </div>
  );
}

/** Grows a textarea to its content. */
export const fitHeight = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

/** The title field: a filled, wrapping text field. Enter commits (no line breaks). */
export function TitleField({ value, onChange, onKeyDown, onFocus, onBlur, autoFocus, label = 'Title', placeholder = 'Task name' }: { value: string; onChange: (v: string) => void; onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void; onFocus?: () => void; onBlur?: () => void; autoFocus?: boolean; label?: string; placeholder?: string }) {
  return (
    <textarea
      className="gp-tp__title"
      dir="auto"
      aria-label={label}
      placeholder={placeholder}
      rows={1}
      value={value}
      autoFocus={autoFocus}
      ref={(el) => fitHeight(el)}
      onInput={(e) => fitHeight(e.currentTarget)}
      onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, ' '))}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  );
}
