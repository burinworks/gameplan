import { useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useProject } from '../../api/hooks';
import { paths, type ProjectTab } from '../../app/routes';
import { usePaneNav } from '../../pane/Pane';
import { Icon, Menu, Page, Segmented, Select } from '../../ui';
import { ListTab } from './ListTab';
import { TimelineTab, type GroupBy } from './TimelineTab';
import { TitleMenu } from './TitleMenu';
import { UpdatesTab, type Actor } from './UpdatesTab';
import './project.css';

const TABS: { value: ProjectTab; label: string }[] = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'list', label: 'List' },
  { value: 'updates', label: 'Updates' },
];

type Zoom = 'day' | 'week' | 'month';
type TimelineZoom = NonNullable<Parameters<typeof TimelineTab>[0]['zoom']>;

export function ProjectScreen({ slug, tab }: { slug: string; tab: ProjectTab }) {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { openNewTask, openNewMilestone } = usePaneNav();
  const project = useProject(slug);
  const [zoom, setZoom] = useState<Zoom>('week');
  const [groupBy, setGroupBy] = useState<GroupBy>('milestone');
  const [actor, setActor] = useState<Actor>('all');

  const firstOpen = project.data?.milestones.find((m) => m.status !== 'done');
  const goTab = (t: ProjectTab) => navigate(paths.project(slug, t) + (search ? `?${search}` : ''));
  const newTask = () => openNewTask(slug, { milestoneId: firstOpen?.id });

  const add = (
    <Menu
      align="end"
      label="New"
      triggerClassName="pj-add"
      trigger={<Icon name="plus" size={16} />}
      items={[
        { label: 'New task', onSelect: newTask },
        { label: 'New milestone', onSelect: () => openNewMilestone(slug) },
      ]}
    />
  );

  const actions =
    tab === 'updates' ? (
      <Segmented
        label="Filter updates"
        options={[
          { value: 'all', label: 'All' },
          { value: 'agents', label: 'Agents' },
          { value: 'you', label: 'You' },
        ]}
        value={actor}
        onChange={setActor}
      />
    ) : (
      <>
        {tab === 'timeline' && (
          <>
            <Select
              label="Group by"
              value={groupBy}
              onChange={(v) => setGroupBy(v === 'area' ? 'area' : 'milestone')}
              options={[
                { value: 'milestone', label: 'Milestone' },
                { value: 'area', label: 'Area' },
              ]}
            />
            <Segmented
              label="Zoom"
              options={[
                { value: 'day', label: 'Day' },
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
              ]}
              value={zoom}
              onChange={setZoom}
            />
          </>
        )}
        {add}
      </>
    );

  return (
    <Page
      className="pj"
      bodyClassName="pj-page"
      label="Project"
      title={<TitleMenu slug={slug} />}
      toolbar={<Segmented label="Project views" options={TABS} value={tab} onChange={goTab} />}
      actions={actions}
    >
      {tab === 'timeline' && <TimelineTab key={slug} slug={slug} zoom={zoom as TimelineZoom} groupBy={groupBy} />}
      {tab === 'list' && <ListTab slug={slug} />}
      {tab === 'updates' && <UpdatesTab slug={slug} actor={actor} />}
    </Page>
  );
}
