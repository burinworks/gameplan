import type { ReactNode } from 'react';
import type { ProjectTree } from '../api/types';
import { Icon, Menu, type SelectOption } from '../ui';

const PALETTE = ['--gp-p1', '--gp-p2', '--gp-p3', '--gp-p4', '--gp-p5', '--gp-p6', '--gp-p7', '--gp-p8'];

/** Area options for a Select: a "None" entry, then each area with its swatch. */
export function areaOptions(areas: ProjectTree['project']['areas']): SelectOption[] {
  return [{ value: '', label: 'None' }, ...areas.map((a, i) => ({ value: a.name, label: a.name, swatch: a.color ?? `var(${PALETTE[i % PALETTE.length]})` }))];
}

/** One label + value row of the details grid (`76px 1fr`). */
export function Row({ label, children, top }: { label: string; children: ReactNode; top?: boolean }) {
  return (
    <>
      <span className={`gp-tp__key${top ? ' is-top' : ''}`}>{label}</span>
      <div className="gp-tp__val">{children}</div>
    </>
  );
}

export interface Dep {
  key: string;
  title: string;
  bad?: boolean;
}

/** "After": a chip per dependency (removable) and a 26px "+" that opens the list of tasks that can still be added. */
export function AfterRow({ deps, onRemove, candidates, onAdd }: { deps: Dep[]; onRemove: (key: string) => void; candidates: { id: string; title: string }[]; onAdd: (id: string) => void }) {
  return (
    <div className="gp-tp__deps">
      {deps.map((d) => (
        <span key={d.key} className={`gp-tp__dep${d.bad ? ' is-bad' : ''}`}>
          <span className="gp-tp__dep-title" dir="auto" title={d.title}>
            {d.title}
          </span>
          <button type="button" className="gp-links__x" aria-label={`Remove ${d.title}`} onClick={() => onRemove(d.key)}>
            <Icon name="close" size={11} />
          </button>
        </span>
      ))}
      {candidates.length > 0 && (
        <Menu
          label="Add dependency"
          align="start"
          triggerClassName="gp-tp__plus"
          trigger={<Icon name="plus" size={12} />}
          items={candidates.map((t) => ({ label: t.title, onSelect: () => onAdd(t.id) }))}
        />
      )}
    </div>
  );
}
