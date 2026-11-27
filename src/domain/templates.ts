/** Built-in project templates. Offsets are calendar days from the project's start date. */
export interface TemplateTask {
  /** Index into the template's milestones. */
  milestone: number;
  title: string;
  area: string;
  startOffset: number;
  /** Inclusive length: end = start + days − 1. */
  days: number;
  todos: string[];
  /** Indices of earlier tasks in the template that must finish first. */
  after?: number[];
}

export interface Template {
  id: 'report' | 'launch' | 'research';
  name: string;
  areas: { name: string; color: string }[];
  milestones: { name: string; offsetDays: number }[];
  tasks: TemplateTask[];
}

export const TEMPLATES: readonly Template[] = [
  {
    id: 'report',
    name: 'Report',
    areas: [
      { name: 'Research', color: '#2F6BF0' },
      { name: 'Data', color: '#12A594' },
      { name: 'Writing', color: '#8E4EC6' },
      { name: 'Design', color: '#F76B15' },
    ],
    milestones: [
      { name: 'Outline', offsetDays: 4 },
      { name: 'Draft', offsetDays: 11 },
      { name: 'Final', offsetDays: 32 },
    ],
    tasks: [
      { milestone: 0, title: 'Collect sources', area: 'Research', startOffset: 0, days: 2, todos: ['List the questions the report answers', 'Gather past reports and data owners'] },
      { milestone: 0, title: 'Pull the numbers', area: 'Data', startOffset: 0, days: 3, todos: ['Request data exports', 'Check the numbers add up'] },
      { milestone: 0, title: 'Write the outline', area: 'Writing', startOffset: 2, days: 3, todos: ['Draft section headings', 'One-line key message per section'], after: [0] },
      { milestone: 1, title: 'Analyse the numbers', area: 'Data', startOffset: 5, days: 3, todos: ['Find the three main trends', 'Note caveats'], after: [1] },
      { milestone: 1, title: 'Draft charts', area: 'Design', startOffset: 8, days: 3, todos: ['Pick a chart per trend', 'Label axes and sources'], after: [3] },
      { milestone: 1, title: 'Write the draft', area: 'Writing', startOffset: 5, days: 6, todos: ['Write every section', 'Write the summary last'], after: [2] },
      { milestone: 2, title: 'Review with stakeholder', area: 'Writing', startOffset: 12, days: 5, todos: ['Send the draft', 'Collect comments'], after: [5] },
      { milestone: 2, title: 'Revise the draft', area: 'Writing', startOffset: 17, days: 7, todos: ['Work through comments', 'Re-check numbers'], after: [6] },
      { milestone: 2, title: 'Final edit + layout', area: 'Design', startOffset: 24, days: 7, todos: ['Proofread', 'Lay out and export'], after: [7] },
    ],
  },
  {
    id: 'launch',
    name: 'Launch',
    areas: [
      { name: 'Product', color: '#2F6BF0' },
      { name: 'Marketing', color: '#E5484D' },
      { name: 'Content', color: '#8E4EC6' },
      { name: 'QA', color: '#30A46C' },
    ],
    milestones: [
      { name: 'Plan', offsetDays: 5 },
      { name: 'Build', offsetDays: 19 },
      { name: 'Ready', offsetDays: 26 },
      { name: 'Launch', offsetDays: 30 },
    ],
    tasks: [
      { milestone: 0, title: 'Define the goal and audience', area: 'Product', startOffset: 0, days: 2, todos: ['Write the one-line goal', 'Name the target audience'] },
      { milestone: 0, title: 'Scope the release', area: 'Product', startOffset: 2, days: 3, todos: ['List must-haves', 'Cut nice-to-haves'], after: [0] },
      { milestone: 0, title: 'Draft the launch brief', area: 'Marketing', startOffset: 2, days: 3, todos: ['Key message', 'Channels and dates'], after: [0] },
      { milestone: 1, title: 'Build the feature', area: 'Product', startOffset: 6, days: 10, todos: ['Build the core flow', 'Handle edge cases'], after: [1] },
      { milestone: 1, title: 'Write the landing page', area: 'Content', startOffset: 6, days: 6, todos: ['Headline and subhead', 'Feature sections', 'Call to action'], after: [2] },
      { milestone: 1, title: 'Prepare visuals', area: 'Content', startOffset: 12, days: 5, todos: ['Screenshots', 'Social images'], after: [4] },
      { milestone: 1, title: 'Set up analytics', area: 'Product', startOffset: 16, days: 3, todos: ['Define success metrics', 'Add tracking'], after: [3] },
      { milestone: 2, title: 'Test end to end', area: 'QA', startOffset: 20, days: 4, todos: ['Run the test plan', 'Log blockers'], after: [3, 6] },
      { milestone: 2, title: 'Fix launch blockers', area: 'Product', startOffset: 24, days: 3, todos: ['Fix blockers', 'Re-test'], after: [7] },
      { milestone: 2, title: 'Write release notes', area: 'Content', startOffset: 20, days: 3, todos: ['What changed', 'How to try it'], after: [5] },
      { milestone: 2, title: 'Line up channels', area: 'Marketing', startOffset: 20, days: 4, todos: ['Schedule posts', 'Brief partners'], after: [2] },
      { milestone: 3, title: 'Final go/no-go', area: 'Product', startOffset: 27, days: 1, todos: ['Check blockers are closed', 'Decide'], after: [8] },
      { milestone: 3, title: 'Publish and announce', area: 'Marketing', startOffset: 28, days: 1, todos: ['Publish', 'Send announcements'], after: [9, 10, 11] },
      { milestone: 3, title: 'Watch metrics and feedback', area: 'Product', startOffset: 29, days: 2, todos: ['Check metrics', 'Collect feedback'], after: [12] },
    ],
  },
  {
    id: 'research',
    name: 'Research',
    areas: [
      { name: 'Reading', color: '#2F6BF0' },
      { name: 'Interviews', color: '#D6409F' },
      { name: 'Analysis', color: '#12A594' },
      { name: 'Writing', color: '#8E4EC6' },
    ],
    milestones: [
      { name: 'Questions', offsetDays: 3 },
      { name: 'Fieldwork', offsetDays: 17 },
      { name: 'Findings', offsetDays: 24 },
    ],
    tasks: [
      { milestone: 0, title: 'Frame the questions', area: 'Writing', startOffset: 0, days: 2, todos: ['Write the research questions', 'Agree them with the sponsor'] },
      { milestone: 0, title: 'Read prior work', area: 'Reading', startOffset: 0, days: 3, todos: ['Find existing studies', 'Note what is already known'] },
      { milestone: 1, title: 'Recruit participants', area: 'Interviews', startOffset: 4, days: 4, todos: ['Define who to talk to', 'Book sessions'], after: [0] },
      { milestone: 1, title: 'Write the interview guide', area: 'Interviews', startOffset: 4, days: 3, todos: ['Draft questions', 'Pilot with one person'], after: [0, 1] },
      { milestone: 1, title: 'Run interviews', area: 'Interviews', startOffset: 8, days: 8, todos: ['Run sessions', 'Write notes the same day'], after: [2, 3] },
      { milestone: 2, title: 'Synthesize notes', area: 'Analysis', startOffset: 18, days: 3, todos: ['Cluster observations', 'Name the themes'], after: [4] },
      { milestone: 2, title: 'Write findings', area: 'Writing', startOffset: 21, days: 3, todos: ['One page per theme', 'Recommendations'], after: [5] },
      { milestone: 2, title: 'Share and discuss', area: 'Writing', startOffset: 24, days: 1, todos: ['Present findings', 'Record decisions'], after: [6] },
    ],
  },
];

export function listTemplates(): { id: Template['id']; name: string; milestones: number; tasks: number }[] {
  return TEMPLATES.map((t) => ({ id: t.id, name: t.name, milestones: t.milestones.length, tasks: t.tasks.length }));
}

export function templateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
