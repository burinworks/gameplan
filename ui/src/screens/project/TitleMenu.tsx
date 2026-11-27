import { useState } from 'react';
import { useLocation } from 'wouter';
import { useArchive, useProject } from '../../api/hooks';
import { paths } from '../../app/routes';
import { Button, Menu, Sheet, type MenuItem } from '../../ui';

/** The project title; it opens the project menu. */
export function TitleMenu({ slug }: { slug: string }) {
  const [, navigate] = useLocation();
  const project = useProject(slug).data?.project;
  const archive = useArchive();
  const [confirming, setConfirming] = useState(false);

  const gh = project?.github ?? null;
  const repoHref = gh ? (/^https?:\/\//.test(gh) ? gh : `https://github.com/${gh}`) : project?.repo && /^https?:\/\//.test(project.repo) ? project.repo : null;
  const items: MenuItem[] = [{ label: 'Settings', onSelect: () => navigate(paths.projectSettings(slug)) }];
  if (repoHref) items.push({ label: 'Open repository', href: repoHref });
  if (project?.vaultNote) items.push({ label: 'Open vault note', href: `obsidian://open?path=${encodeURIComponent(project.vaultNote)}` });
  items.push({ label: 'Archive', danger: true, onSelect: () => setConfirming(true) });

  const name = project?.name ?? slug;
  return (
    <h1 className="pj-title" dir="auto">
      <Menu align="start" label={name} trigger={<span className="pj-title__text">{name}</span>} items={items} />
      {confirming && project && (
        <Sheet
          title={`Archive ${project.name}?`}
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button variant="secondary" label="Cancel" onClick={() => setConfirming(false)} />
              <Button
                variant="primary"
                label="Archive"
                onClick={() => {
                  archive.mutate({ entity: 'project', id: project.id });
                  setConfirming(false);
                  navigate(paths.home);
                }}
              />
            </>
          }
        >
          <span className="gp-sr">{project.name}</span>
        </Sheet>
      )}
    </h1>
  );
}
