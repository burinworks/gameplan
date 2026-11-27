import { useConfigureProject, useOverview, useRestore } from '../../api/hooks';
import { today } from '../../app/today';
import { fmtDate, fmtPct } from '../../lib/format';
import { Button, Chip, Panel, Row } from '../../ui';
import './archive.css';

export function PausedArchived() {
  const ov = useOverview();
  const configure = useConfigureProject();
  const restore = useRestore();
  const now = today();
  const { paused = [], archived = [] } = ov.data ?? {};

  return (
    <section className="pa" aria-label="Paused & archived">
      <Panel title="Paused" count={paused.length}>
        {paused.map((p) => (
          <Row
            key={p.slug}
            swatch={p.color}
            title={p.name}
            meta={p.nextMilestone?.name ?? 'No milestone'}
            trailing={
              <>
                <span className="num">{fmtPct(p.progress.pct)}</span>
                {p.pausedSince && <span>Paused {fmtDate(p.pausedSince, now)}</span>}
                <Button variant="secondary" label="Resume" onClick={() => configure.mutate({ slug: p.slug, patch: { status: 'active' } })} />
              </>
            }
          />
        ))}
      </Panel>
      <Panel title="Archived" count={archived.length}>
        {archived.map((a) => (
          <Row
            key={a.slug}
            swatch={a.color}
            title={a.name}
            meta={`${a.tasks} tasks · ${a.milestones} milestones`}
            trailing={
              <>
                {a.status === 'done' && <Chip tone="ok">Done</Chip>}
                {a.status === 'dropped' && <Chip>Dropped</Chip>}
                {a.archivedAt && <span>{fmtDate(a.archivedAt, now)}</span>}
                <Button
                  variant="secondary"
                  label="Restore"
                  onClick={() => (a.isArchived ? restore.mutate({ entity: 'project', id: a.id }) : configure.mutate({ slug: a.slug, patch: { status: 'active' } }))}
                />
              </>
            }
          />
        ))}
      </Panel>
    </section>
  );
}
