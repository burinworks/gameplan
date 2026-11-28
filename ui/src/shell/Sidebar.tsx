import { useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { useInbox, useOverview, useProject, useProjects } from '../api/hooks';
import { paths } from '../app/routes';
import { today } from '../app/today';
import { fmtDate, fmtPct } from '../lib/format';
import { ArchiveProjectSheet } from '../screens/project/ArchiveProjectSheet';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';
import { Menu, type MenuItem } from '../ui/Menu';
import './sidebar.css';

function NavLink({ to, icon, label, count, active, small }: { to: string; icon: IconName; label: string; count?: number; active: boolean; small?: boolean }) {
  return (
    <Link href={to} className={`gp-nav${active ? ' is-current' : ''}${small ? ' gp-nav--small' : ''}`} aria-current={active ? 'page' : undefined}>
      <Icon name={icon} size={small ? 14 : 16} />
      <span className="gp-nav__label">{label}</span>
      {count !== undefined && <span className="gp-nav__count num">{count}</span>}
    </Link>
  );
}

export function Sidebar({ onSearch, onNewProject }: { onSearch: () => void; onNewProject: () => void }) {
  const [loc, navigate] = useLocation();
  const [, projectParams] = useRoute('/p/:slug/:rest*');
  const slug = projectParams?.slug;
  const projects = useProjects('active');
  const inbox = useInbox();
  const overview = useOverview();
  const current = useProject(slug);
  const [confirming, setConfirming] = useState(false);
  const now = today();

  const proj = current.data?.project;
  const gh = proj?.github ?? null;
  const repoHref = gh ? (/^https?:\/\//.test(gh) ? gh : `https://github.com/${gh}`) : proj?.repo && /^https?:\/\//.test(proj.repo) ? proj.repo : null;
  const items: MenuItem[] = [{ label: 'Settings', onSelect: () => slug && navigate(paths.projectSettings(slug)) }];
  if (repoHref) items.push({ label: 'Open repository', href: repoHref });
  if (proj?.vaultNote) items.push({ label: 'Open vault note', href: `obsidian://open?path=${encodeURIComponent(proj.vaultNote)}` });
  items.push({ label: 'Archive', danger: true, onSelect: () => setConfirming(true) });

  return (
    <nav className="gp-sidebar" aria-label="Main">
      <NavLink to={paths.home} icon="home" label="Home" active={loc === paths.home} />
      <button type="button" className="gp-nav" onClick={onSearch}>
        <Icon name="search" />
        <span className="gp-nav__label">Search</span>
      </button>
      <NavLink to={paths.inbox} icon="inbox" label="Inbox" count={inbox.data?.count} active={loc === paths.inbox} />

      <div className="gp-sidebar__head">
        <span className="gp-sidebar__label">Projects</span>
        <Button variant="icon" icon="plus" label="New project" onClick={onNewProject} />
      </div>

      <div className="gp-sidebar__projects">
        {(projects.data ?? []).map((p) => {
          const isCurrent = p.slug === slug;
          return (
            <div key={p.slug}>
              <div className="gp-projrow">
                <Link href={paths.project(p.slug)} className={`gp-nav gp-nav--project${isCurrent ? ' is-current' : ''}`} aria-current={isCurrent ? 'page' : undefined}>
                  <span className="gp-nav__label" dir="auto" title={p.name}>
                    {p.name}
                  </span>
                  <span className="gp-nav__count num">{fmtPct(p.progress.pct)}</span>
                </Link>
                {isCurrent && <Menu trigger={<Icon name="more" size={14} />} label={`${p.name} menu`} items={items} />}
              </div>
              {isCurrent && (
                <ul className="gp-milestones">
                  {p.milestones.map((m) => (
                    <li
                      key={m.id}
                      className={`gp-milestone${m.status === 'done' ? ' is-done' : ''}`}
                      style={{ ['--ms' as string]: m.color ?? 'var(--gp-text3)' }}
                    >
                      <span className="gp-milestone__mark" aria-hidden="true" />
                      <span className="gp-milestone__name" dir="auto" title={m.name}>
                        {m.name}
                      </span>
                      {m.due && <span className="num">{fmtDate(m.due, now)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <NavLink to={paths.archive} icon="archive" label="Paused & archived" count={overview.data?.count} active={loc === paths.archive} small />
      <div className="gp-sidebar__spacer" />
      <NavLink to={paths.settings} icon="settings" label="Settings" active={loc === paths.settings} />

      {confirming && proj && <ArchiveProjectSheet project={proj} onClose={() => setConfirming(false)} />}
    </nav>
  );
}
