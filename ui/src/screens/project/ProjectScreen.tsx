import { useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useProject } from '../../api/hooks';
import { paths, type ProjectTab } from '../../app/routes';
import { usePaneNav } from '../../pane/Pane';
import { Button, Icon, Menu, Segmented } from '../../ui';
import { ListTab } from './ListTab';
import { TimelineTab, type GroupBy } from './TimelineTab';
import { TitleMenu } from './TitleMenu';
import { UpdatesTab } from './UpdatesTab';
import './project.css';

const TABS: { value: ProjectTab; label: string }[] = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'list', label: 'List' },
  { value: 'updates', label: 'Updates' },
];

export function ProjectScreen({ slug, tab }: { slug: string; tab: ProjectTab }) {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { openNewTask, openNewMilestone } = usePaneNav();
  const project = useProject(slug);
  const [zoom, setZoom] = useState<'week' | 'month'>('week');
  const [groupBy, setGroupBy] = useState<GroupBy>('milestone');

  const firstOpen = project.data?.milestones.find((m) => m.status !== 'done');
  const goTab = (t: ProjectTab) => navigate(paths.project(slug, t) + (search ? `?${search}` : ''));

  return (
    <section className="pj" aria-label="Project">
      <header className="pj-head">
        <TitleMenu slug={slug} />
        <Segmented label="Project views" options={TABS} value={tab} onChange={goTab} />
        <div className="pj-head__right">
          {tab === 'timeline' && (
            <>
              <Segmented
                label="Zoom"
                options={[
                  { value: 'week', label: 'Week' },
                  { value: 'month', label: 'Month' },
                ]}
                value={zoom}
                onChange={setZoom}
              />
              <Segmented
                label="Group by"
                options={[
                  { value: 'milestone', label: 'Milestone' },
                  { value: 'area', label: 'Area' },
                ]}
                value={groupBy}
                onChange={setGroupBy}
              />
            </>
          )}
          <Button variant="secondary" label="New task" onClick={() => openNewTask(slug, { milestoneId: firstOpen?.id })} />
          <Menu label="More" trigger={<Icon name="more" size={14} />} items={[{ label: 'New milestone', onSelect: () => openNewMilestone(slug) }]} />
        </div>
      </header>
      {tab === 'timeline' && <TimelineTab slug={slug} zoom={zoom} groupBy={groupBy} />}
      {tab === 'list' && <ListTab slug={slug} />}
      {tab === 'updates' && <UpdatesTab slug={slug} />}
    </section>
  );
}
