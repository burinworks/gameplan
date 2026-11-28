import { useState } from 'react';
import { useLocation } from 'wouter';
import { useProject } from '../../api/hooks';
import { paths } from '../../app/routes';
import { Icon, Menu, type MenuItem } from '../../ui';
import { ArchiveProjectSheet } from './ArchiveProjectSheet';

/** The project title as a menu button with a chevron; it goes inside the page heading. */
export function TitleMenu({ slug }: { slug: string }) {
  const [, navigate] = useLocation();
  const project = useProject(slug).data?.project;
  const [confirming, setConfirming] = useState(false);

  const gh = project?.github ?? null;
  const repoHref = gh ? (/^https?:\/\//.test(gh) ? gh : `https://github.com/${gh}`) : project?.repo && /^https?:\/\//.test(project.repo) ? project.repo : null;
  const items: MenuItem[] = [{ label: 'Settings', onSelect: () => navigate(paths.projectSettings(slug)) }];
  if (repoHref) items.push({ label: 'Open repository', href: repoHref });
  if (project?.vaultNote) items.push({ label: 'Open vault note', href: `obsidian://open?path=${encodeURIComponent(project.vaultNote)}` });
  items.push({ label: 'Archive', danger: true, onSelect: () => setConfirming(true) });

  const name = project?.name ?? slug;
  return (
    <>
      <Menu
        align="start"
        label={name}
        triggerClassName="pj-title"
        trigger={
          <>
            <span className="pj-title__text" dir="auto" title={name}>
              {name}
            </span>
            <span className="pj-title__chev">
              <Icon name="chevronDown" size={12} />
            </span>
          </>
        }
        items={items}
      />
      {confirming && project && <ArchiveProjectSheet project={project} onClose={() => setConfirming(false)} />}
    </>
  );
}
