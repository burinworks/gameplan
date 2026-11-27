import type { home, listProjects, milestoneDetail, overview, taskDetail, timeline } from '../../../src/domain/queries';
import type { publicSettings } from '../../../src/domain/settings';
import type { listTemplates } from '../../../src/domain/templates';

export type { Project, Milestone, Task, Todo, Attachment, EventRow, TaskStatus, Executor, Priority, InboxItem } from '../../../src/domain/types';
export type { ProjectTree, TreeTask, TreeMilestone, TreeTodo, LinkRef, UpdateRow } from '../../../src/domain/queries';
export type { SearchHit } from '../../../src/domain/search';
export type { Health, TodoState } from '../../../src/domain/derive';

export type Home = ReturnType<typeof home>;
export type TimelineRows = ReturnType<typeof timeline>;
export type ProjectListItem = ReturnType<typeof listProjects>[number];
export type TaskDetail = ReturnType<typeof taskDetail>;
export type MilestoneDetail = ReturnType<typeof milestoneDetail>;
export type Overview = ReturnType<typeof overview>;
export type PublicSettings = ReturnType<typeof publicSettings>;
export type TemplateInfo = ReturnType<typeof listTemplates>[number];
