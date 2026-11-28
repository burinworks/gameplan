import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCreateMilestone, useSettings } from '../api/hooks';
import type { ProjectTree } from '../api/types';
import { today } from '../app/today';
import { PALETTE, nextColour } from '../sheets/NewProject';
import { Button, DateField, Segmented } from '../ui';
import { addDays } from './dates';
import './milestone-popover.css';

/** Two weeks after the project's last milestone due date; never before tomorrow. */
export function suggestedDue(tree: ProjectTree | undefined): string {
  const tomorrow = addDays(today(), 1);
  const last = (tree?.milestones ?? [])
    .map((m) => m.due)
    .filter((d): d is string => !!d)
    .sort()
    .pop();
  const d = addDays(last ?? today(), 14);
  return d < tomorrow ? tomorrow : d;
}

export interface MilestonePopoverProps {
  slug: string;
  tree: ProjectTree | undefined;
  /** The element the popover hangs under (the Milestone select's trigger). */
  anchor: HTMLElement;
  onClose: () => void;
  /** Called with the new milestone's id once it exists (the popover closes itself after). */
  onCreated: (id: string) => void;
}

/**
 * Create-a-milestone popover for the New task / task pane Milestone select. Rendered in a fixed layer on
 * document.body (like the date calendar) so the scrolling pane never clips it.
 */
export function MilestonePopover({ slug, tree, anchor, onClose, onCreated }: MilestonePopoverProps) {
  const create = useCreateMilestone();
  const qc = useQueryClient();
  const settings = useSettings();
  const weekStart = settings.data?.week_start === 'sun' ? 'sun' : 'mon';
  const busy = useRef(false); // set synchronously: mutation state lags a keypress behind
  const pop = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [colour, setColour] = useState<string | null>(null);
  const [status, setStatus] = useState<'planned' | 'active'>('planned');
  const [error, setError] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const due = picked ?? suggestedDue(tree);
  const defaultColour = useMemo(() => nextColour((tree?.milestones ?? []).map((m) => m.color)), [tree]);
  const chosen = colour ?? defaultColour;

  const place = () => {
    const r = anchor.getBoundingClientRect();
    const el = pop.current;
    const h = el?.offsetHeight ?? 0;
    const gap = 6;
    const edge = 8;
    const width = Math.max(r.width, 320);
    const below = r.bottom + gap;
    const top = h && below + h > window.innerHeight - edge ? Math.max(edge, r.top - gap - h >= edge ? r.top - gap - h : window.innerHeight - edge - h) : below;
    const left = Math.max(edge, Math.min(r.right - width, window.innerWidth - edge - width)); // right edges meet
    setPos((p) => (p && p.top === top && p.left === left && p.width === width ? p : { top, left, width }));
  };
  useLayoutEffect(place); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const again = () => place();
    window.addEventListener('scroll', again, true);
    window.addEventListener('resize', again);
    return () => {
      window.removeEventListener('scroll', again, true);
      window.removeEventListener('resize', again);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => nameRef.current?.focus(), [pos !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      // The date calendar is its own fixed layer; clicking in it is still inside this popover.
      if (!pop.current?.contains(t) && !anchor.contains(t) && !t.closest?.('.gp-date__pop')) onClose();
    };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [anchor, onClose]);

  const valid = name.trim() !== '';
  const submit = () => {
    if (!valid || busy.current) return;
    busy.current = true;
    setError('');
    create.mutate(
      { slug, body: { name: name.trim(), due, color: chosen, status } },
      {
        onSettled: () => void (busy.current = false),
        onSuccess: (m) => {
          void qc.invalidateQueries({ queryKey: ['project', slug] });
          onCreated(m.id);
        },
        onError: (e) => setError(e instanceof Error && e.message ? e.message : 'Could not create the milestone.'),
      },
    );
  };
  const cancel = () => {
    onClose();
    anchor.focus();
  };

  return createPortal(
    <div
      ref={pop}
      className="gp-mp"
      role="dialog"
      aria-label="New milestone"
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width: pos?.width, visibility: pos ? 'visible' : 'hidden' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancel();
        } else if (e.key === 'Enter' && !e.nativeEvent.isComposing && !(e.target instanceof HTMLButtonElement)) {
          e.preventDefault();
          e.stopPropagation();
          submit();
        }
      }}
    >
      <label className="gp-mp__row">
        <span className="gp-mp__key">Name</span>
        <input ref={nameRef} className="gp-pane__input" dir="auto" aria-label="Milestone name" placeholder="e.g. Beta release" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="gp-mp__row">
        <span className="gp-mp__key">Due</span>
        <DateField label="Milestone due" value={due} onChange={setPicked} required min={addDays(today(), 1)} weekStart={weekStart} />
      </div>
      <div className="gp-mp__row">
        <span className="gp-mp__key">Colour</span>
        <div className="gp-mp__colours" role="radiogroup" aria-label="Colour">
          {PALETTE.map((c) => (
            <button
              key={c.hex}
              type="button"
              role="radio"
              aria-checked={c.hex.toLowerCase() === chosen.toLowerCase()}
              aria-label={c.name}
              title={c.name}
              className="gp-mp__colour"
              style={{ background: c.hex }}
              onClick={() => setColour(c.hex)}
            />
          ))}
        </div>
      </div>
      <div className="gp-mp__row">
        <span className="gp-mp__key">Status</span>
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
      {error && (
        <p className="gp-mp__error" role="alert">
          {error}
        </p>
      )}
      <div className="gp-mp__foot">
        <Button variant="secondary" label="Cancel" onClick={cancel} />
        <Button variant="primary" label="Create milestone" onClick={submit} disabled={!valid} />
      </div>
    </div>,
    document.body,
  );
}
