import './timeline.css';

/** The small picture on a choice: a task bar ("sausage"), a milestone rhombus, or a few project rows. */
export type EmptyVisual = 'task' | 'milestone' | 'project';

export interface EmptyChoice {
  label: string;
  visual: EmptyVisual;
  onClick: () => void;
}

function Visual({ kind }: { kind: EmptyVisual }) {
  if (kind === 'milestone') {
    return (
      <span className="tl-empty-vis" aria-hidden="true">
        <span className="tl-empty-rhombus" />
      </span>
    );
  }
  if (kind === 'task') {
    return (
      <span className="tl-empty-vis" aria-hidden="true">
        <span className="tl-empty-sausage">
          <span className="tl-empty-sausage-fill" />
        </span>
      </span>
    );
  }
  return (
    <span className="tl-empty-vis tl-empty-vis--rows" aria-hidden="true">
      <span className="tl-empty-mini tl-empty-mini--a" />
      <span className="tl-empty-mini tl-empty-mini--b" />
      <span className="tl-empty-mini tl-empty-mini--c" />
    </span>
  );
}

/**
 * Empty timeline prompt: a card laid over the (still drawn) grid with a title, a hint and one or more
 * square choices, each with a small picture of what it makes.
 */
export function TimelineEmpty({ title, hint, choices }: { title: string; hint?: string; choices: EmptyChoice[] }) {
  return (
    <div className="tl-empty" data-timeline-empty>
      <div className="tl-empty-card" role="group" aria-label={title}>
        <p className="tl-empty-title">{title}</p>
        {hint && <p className="tl-empty-hint">{hint}</p>}
        <div className="tl-empty-choices">
          {choices.map((c) => (
            <button key={c.label} type="button" className="tl-empty-choice" onClick={c.onClick}>
              <Visual kind={c.visual} />
              <span className="tl-empty-label">{c.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
