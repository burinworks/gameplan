import { useConfigureProject, useOverview, useRestore } from '../../api/hooks';
import { today } from '../../app/today';
import { fmtDate, fmtPct } from '../../lib/format';
import { Button, Chip, EmptyState, Page } from '../../ui';
import './archive.css';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export function PausedArchived() {
  const ov = useOverview();
  const configure = useConfigureProject();
  const restore = useRestore();
  const now = today();
  const { paused = [], archived = [] } = ov.data ?? {};
  const loaded = ov.data !== undefined;

  return (
    <Page title="Paused & archived" label="Paused & archived" className="pa" bodyClassName="pa__body">
      <section className={`pa__section${loaded && paused.length === 0 ? ' pa__section--empty' : ''}`} aria-label="Paused">
        <h2 className="pa__heading">Paused · {paused.length}</h2>
        {loaded && paused.length === 0 ? (
          <div className="pa__panel">
            <EmptyState icon="archive" title="Nothing paused" hint="Pause a project from its settings to park it here until you are ready to resume." />
          </div>
        ) : (
          paused.map((p) => (
            <div key={p.slug} className="pa__row pa__row--paused">
              <div className="pa__cell pa__name">
                <span className="pa__swatch" style={{ background: p.color ?? undefined }} />
                <span className="pa__strong" dir="auto">
                  {p.name}
                </span>
              </div>
              <div className="pa__cell pa__next">
                <span className="pa__diamond" style={{ background: p.color ?? undefined }} />
                <span className="pa__ellipsis" dir="auto">
                  {p.nextMilestone?.name ?? 'No milestone'}
                </span>
              </div>
              <div className="pa__cell pa__progress">
                <span className="pa__bar">
                  <span className="pa__bar-fill" style={{ width: `${p.progress.pct}%`, background: p.color ?? undefined }} />
                </span>
                <span className="pa__pct num">{fmtPct(p.progress.pct)}</span>
              </div>
              <span className="pa__when">{p.pausedSince ? `Paused ${fmtDate(p.pausedSince, now)}` : ''}</span>
              <Button variant="secondary" className="pa__btn" label="Resume" onClick={() => configure.mutate({ slug: p.slug, patch: { status: 'active' } })} />
            </div>
          ))
        )}
      </section>

      <section className={`pa__section pa__section--archived${loaded && archived.length === 0 ? ' pa__section--empty' : ''}`} aria-label="Archived">
        <h2 className="pa__heading">Archived · {archived.length}</h2>
        {loaded && archived.length === 0 ? (
          <div className="pa__panel">
            <EmptyState icon="archive" title="Nothing archived" hint="Projects you archive show up here, and you can restore them any time." />
          </div>
        ) : (
          archived.map((a) => (
            <div key={a.slug} className="pa__row pa__row--archived">
              <div className="pa__cell pa__name pa__name--muted">
                <span className="pa__swatch pa__swatch--muted" />
                <span className="pa__medium" dir="auto">
                  {a.name}
                </span>
              </div>
              <span className="pa__summary num">{`${plural(a.tasks, 'task')} · ${plural(a.milestones, 'milestone')}`}</span>
              <span>
                {a.status === 'done' && (
                  <Chip tone="ok" dot>
                    Done
                  </Chip>
                )}
                {a.status === 'dropped' && <Chip dot>Dropped</Chip>}
              </span>
              <span className="pa__when">{a.archivedAt ? `Archived ${fmtDate(a.archivedAt, now)}` : ''}</span>
              <Button
                variant="quiet"
                className="pa__btn"
                label="Restore"
                onClick={() => (a.isArchived ? restore.mutate({ entity: 'project', id: a.id }) : configure.mutate({ slug: a.slug, patch: { status: 'active' } }))}
              />
            </div>
          ))
        )}
      </section>
    </Page>
  );
}
