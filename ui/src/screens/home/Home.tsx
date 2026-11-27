import { useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useCapture, useHome, useSettings, useTimeline } from '../../api/hooks';
import { paths } from '../../app/routes';
import { fmtActor, fmtActorAt, fmtAgo, fmtHeaderDate, fmtRange, fmtTodos } from '../../lib/format';
import { Timeline, type TLRow } from '../../timeline/Timeline';
import { Button, Chip, Field, Icon, Panel, Row } from '../../ui';
import { PlanPicker } from './PlanPicker';
import './home.css';

function addDays(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, day! + n)).toISOString().slice(0, 10);
}

const MAX_CHIPS = 6;

export function Home() {
  const home = useHome();
  const settings = useSettings();
  const capture = useCapture();
  const [, navigate] = useLocation();
  const [text, setText] = useState('');
  const [planning, setPlanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const today = home.data?.today;
  const from = today ? addDays(today, -10) : undefined;
  const to = today ? addDays(today, 45) : undefined;
  const tl = useTimeline(from, to);

  const { rows, byMilestone } = useMemo(() => {
    const byMilestone = new Map<string, string>();
    const rows: TLRow[] = (tl.data ?? []).map((r) => {
      for (const m of r.milestones) byMilestone.set(m.id, r.project.slug);
      return {
        id: r.project.slug,
        label: r.project.name,
        swatch: r.color ?? undefined,
        bars: r.milestones.map((m) => ({
          id: m.id,
          kind: 'milestone' as const,
          label: m.name,
          start: m.start,
          end: m.end,
          color: r.color ?? 'var(--gp-text3)',
          progress: m.progress.pct,
          risk: m.atRisk || m.missed,
          diamond: true,
          draggable: false,
        })),
      };
    });
    return { rows, byMilestone };
  }, [tl.data]);

  if (!home.data || !from || !to) return <section className="home" aria-label="Home" />;
  const h = home.data;
  const now = new Date();
  const open = (project: string, id: string) => navigate(paths.task(project, id));

  const submit = () => {
    const v = text.trim();
    if (!v || capture.isPending) return;
    capture.mutate(v, {
      onSuccess: () => {
        setText('');
        inputRef.current?.focus();
      },
    });
  };

  const overflow = h.doneThisWeek.count - Math.min(h.doneThisWeek.items.length, MAX_CHIPS);

  return (
    <section className="home" aria-label="Home">
      <header className="home__head">
        <h1 className="home__date" dir="auto">
          {fmtHeaderDate(h.today)}
        </h1>
        <div className="home__capture">
          <Field label="Capture" variant="quiet" icon="inbox" submitHint="Add" placeholder="Capture to Inbox…" value={text} onChange={setText} onEnter={submit} inputRef={inputRef} />
        </div>
      </header>

      <div className="home__grid">
        <div className="home__main">
          <section className="gp-panel" aria-label="My plan">
            <div className="home__planhead">
              <h2 className="gp-panel__title">My plan</h2>
              <Button variant="quiet" label="Plan my day" onClick={() => setPlanning(true)} />
            </div>
            {h.plan.map((p) => (
              <div
                key={p.task.id}
                className="gp-rowitem is-clickable"
                data-testid="plan-row"
                role="button"
                tabIndex={0}
                onClick={() => open(p.task.project, p.task.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    open(p.task.project, p.task.id);
                  }
                }}
              >
                <span className="home__badge num" data-testid="plan-n" style={{ ['--badge' as string]: p.task.color ?? 'var(--gp-text3)' }}>
                  {p.n}
                </span>
                <span className="gp-rowitem__text">
                  <span className="gp-rowitem__title" dir="auto" title={p.task.title}>
                    {p.task.title}
                  </span>
                  <span className="gp-rowitem__meta" dir="auto">
                    {p.resume ? `${p.task.projectName} · ↳ ${p.resume.note}` : p.task.projectName}
                  </span>
                </span>
                {p.when && <Chip>{p.when}</Chip>}
              </div>
            ))}

            {h.pickUp.length > 0 && (
              <>
                <h3 className="home__sub">Pick up where you left off</h3>
                {h.pickUp.map((p) => (
                  <Row
                    key={p.task.id}
                    title={p.task.title}
                    meta={`↳ ${p.resume.note}`}
                    swatch={p.task.color}
                    trailing={p.resume.by && p.resume.at ? fmtActorAt(p.resume.by, p.resume.at, now) : undefined}
                    onClick={() => open(p.task.project, p.task.id)}
                    highlightId={p.task.id}
                  />
                ))}
              </>
            )}

            {h.alsoToday.length > 0 && (
              <p className="home__also" dir="auto">
                <span className="home__alsolabel">Also today</span>
                {h.alsoToday.map((t, i) => (
                  <span key={t.id}>
                    {i > 0 && ' · '}
                    <button type="button" className="home__link" onClick={() => open(t.project, t.id)}>
                      {t.title}
                    </button>
                  </span>
                ))}
              </p>
            )}
          </section>
        </div>

        <div className="home__side">
          <Panel title="Needs review" count={h.needsReview.length} countTone="review">
            {h.needsReview.length === 0 ? (
              <p className="home__empty">Nothing to review</p>
            ) : (
              h.needsReview.map((r) => (
                <Row
                  key={r.task.id}
                  title={r.task.title}
                  meta={[r.by ? fmtActor(r.by) : null, fmtTodos(r.todos.done, r.todos.total), fmtAgo(r.at, now)].filter(Boolean).join(' · ')}
                  swatch={r.color}
                  onClick={() => open(r.project, r.task.id)}
                  highlightId={r.task.id}
                />
              ))
            )}
          </Panel>

          <Panel title="At risk" count={h.atRisk.length} countTone="risk">
            {h.atRisk.length === 0 ? (
              <p className="home__empty">Nothing at risk</p>
            ) : (
              h.atRisk.map((r) => (
                <Row key={r.id} title={r.title} meta={r.reasons[0] ?? r.projectName} swatch={r.color} onClick={() => open(r.project, r.id)} highlightId={r.id} />
              ))
            )}
          </Panel>

          {h.rescheduled.length > 0 && (
            <Panel title="Rescheduled" count={h.rescheduled.length}>
              {h.rescheduled.map((r) => (
                <Row
                  key={r.eventId}
                  title={r.task.title ?? ''}
                  meta={`${fmtRange(r.from.end ?? r.from.start, r.to.end ?? r.to.start, h.today)} · ${fmtActor(r.actor)}`}
                  swatch={r.color}
                  onClick={() => open(r.project, r.task.id)}
                  highlightId={r.task.id}
                />
              ))}
            </Panel>
          )}
        </div>
      </div>

      <section className="gp-panel home__done" aria-label="Done this week">
        <h2 className="gp-panel__title">
          Done this week
          <span className="gp-count gp-count--ok num">{h.doneThisWeek.count}</span>
        </h2>
        <div className="home__chips">
          {h.doneThisWeek.items.slice(0, MAX_CHIPS).map((d) => (
            <button key={d.id} type="button" className="home__chipbtn" onClick={() => open(d.project, d.id)} title={d.title}>
              <Chip tone="ok">
                <Icon name="check" size={11} />
                <span dir="auto">{d.title}</span>
              </Chip>
            </button>
          ))}
          {overflow > 0 && <Chip>{`+${overflow}`}</Chip>}
        </div>
      </section>

      <section className="gp-panel home__timeline" aria-label="Timeline">
        <Timeline
          rows={rows}
          from={from}
          to={to}
          today={h.today}
          zoom="week"
          weekStart={settings.data?.week_start === 'sun' ? 'sun' : 'mon'}
          showWeekends={settings.data?.show_weekends ?? true}
          onOpen={(id) => {
            const slug = byMilestone.get(id);
            if (slug) navigate(paths.project(slug));
          }}
          initialScrollToToday
        />
      </section>

      {planning && <PlanPicker onClose={() => setPlanning(false)} />}
    </section>
  );
}
