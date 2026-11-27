/** 8x8 rounded project swatch. Always left of a name. */
export function Swatch({ color }: { color: string | null | undefined }) {
  return <span className="gp-swatch" style={{ background: color ?? 'var(--gp-text3)' }} aria-hidden="true" />;
}
