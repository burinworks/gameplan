import { ROW_PITCH, arrowPath } from '../lib/timeline';

export interface ArrowPos {
  x: number;
  w: number;
  y: number;
}

export interface ArrowLink {
  fromId: string;
  toId: string;
  bad: boolean;
}

const CHEVRON = 7;

/** Dependency arrows, drawn in plane coordinates (x from the first day, y from the first row). */
export function Arrows({
  links,
  pos,
  width,
  height,
  pitch = ROW_PITCH,
  pending,
}: {
  links: ArrowLink[];
  pos: Map<string, ArrowPos>;
  width: number;
  height: number;
  /** Row pitch, for routing a link between bars on the same line. */
  pitch?: number;
  pending?: { fromId: string; x: number; y: number; target: string | null } | null;
}) {
  const from = pending ? pos.get(pending.fromId) : undefined;
  return (
    <svg className="tl-arrows" width={width} height={height} aria-hidden="true">
      {links.map((l) => {
        const a = pos.get(l.fromId);
        const b = pos.get(l.toId);
        if (!a || !b) return null;
        const stroke = l.bad ? 'var(--gp-risk)' : 'var(--gp-arrow)';
        const tipX = b.x - 2;
        return (
          <g key={`${l.fromId}>${l.toId}`} data-link={`${l.fromId}>${l.toId}`} data-bad={l.bad || undefined}>
            <path
              d={arrowPath({ x2: a.x + a.w, y: a.y }, { x1: b.x, y: b.y }, pitch)}
              stroke={stroke}
              strokeWidth={1.3}
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d={`M${tipX - CHEVRON * 0.7} ${b.y - CHEVRON / 2} L${tipX} ${b.y} L${tipX - CHEVRON * 0.7} ${b.y + CHEVRON / 2}`}
              stroke={stroke}
              strokeWidth={1.3}
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        );
      })}
      {pending && from && (
        <line
          className="tl-link-preview"
          x1={from.x + from.w}
          y1={from.y}
          x2={pending.x}
          y2={pending.y}
          stroke="var(--gp-accent)"
          strokeWidth={1.3}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
