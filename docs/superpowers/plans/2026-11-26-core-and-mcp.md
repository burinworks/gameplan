# Gameplan — Plan 1: Core engine + MCP server

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The long-lived engine of Gameplan: a local server that stores Projects › Milestones › Tasks › To-dos with areas, dependencies, attachments, settings and a full activity log; computes progress, health and dashboards; supports revert; and exposes everything over a JSON+SSE API (for the UI in Plan 2) and MCP (for any AI agent). Not a prototype — Plans 2 and 3 build on these interfaces unchanged.

**Architecture:** One Node process. `node:sqlite` (synchronous) with versioned migrations; a `Store` owns every write (validation → transaction → event rows → change notification); pure functions in `derive.ts`; read models in `queries.ts`; Hono serves `/api/*`, `/events` (SSE) and `/mcp` (Streamable HTTP) on `127.0.0.1:4747`.

**Tech Stack:** Node ≥ 24, TypeScript (strict, ESM), `node:sqlite`, Hono + `@hono/node-server`, `@modelcontextprotocol/sdk` ^1.32, `@hono/mcp`, zod ^4, vitest, tsx (same toolchain as `~/Documents/repos/mcp-pipe`).

**Spec:** `~/Documents/repos/second-brain/projects/gameplan/notes/gameplan--design.md` · Mockup: https://claude.ai/artifact/H9CQZ5JJHBetPYAGf9ihTk (every screen's data comes from an endpoint in this plan — see "Screen → engine" below).

## Global Constraints
- Dates are `YYYY-MM-DD` strings, calendar days, `end` inclusive. Event timestamps are ISO datetimes (UTC).
- "Today" = local date in setting `time_zone` (default `Asia/Jerusalem`), via an injectable `Clock`.
- Bind `127.0.0.1` only. Port `GAMEPLAN_PORT` (default `4747`). DB `GAMEPLAN_DB` (default `~/Library/Application Support/Gameplan/gameplan.db`).
- Enums: project status `active|paused|done|dropped`; milestone status `planned|active|done`; task status `todo|doing|done|cancelled`; priority `p1|p2|p3`; executor `manual|ai`; attachment role `context|deliverable`, kind `commit|pr|file|link|note`.
- Every write records ≥1 `events` row with actor `you` (HTTP) or `ai:<mcp client name>` (MCP, `ai:unknown` if absent) and a `label` (entity title at that moment).
- Deletes are soft (`archived_at`); archived rows are excluded from every read, rollup and health computation except the Paused & archived overview and restore.
- Dependencies: finish-to-start, task → task or task → milestone, cross-project allowed, cycles rejected.
- Agent policy comes from settings: `agents_require_reason` (true), `agents_can_archive` (false), `agents_can_create_projects` (true).
- Responses to agents are compact (ids, titles, dates, status, progress); descriptions only from single-entity `get_*`.
- Schema changes only through numbered migrations (`PRAGMA user_version`); never edit an applied migration.

## Review Focus
1. **Dependency cycles** (A→B→A, also inside one `plan_milestone` or `create_task` call) → rejected with an error naming the cycle; nothing written.
2. **Undated tasks** in Today, At risk, conflict checks, timeline spans and cascade → skipped, never crash, never "late".
3. **Cascade into done/cancelled/archived tasks** → not moved; traversal continues through them.
4. **Stale revert** — reverting an event whose entity changed since → refused with `conflict` ("changed since"), nothing written.
5. **Time zone edge** — at 23:30 UTC on Nov 25 with `time_zone=Asia/Jerusalem`, today is `2026-11-26`; changing the setting changes `today` on the next call.

---

## File Structure
```
package.json  tsconfig.json  vitest.config.ts  README.md
migrations/001_init.sql
src/clock.ts              Clock, zone-aware today, date math
src/ids.ts                newId(prefix), slugify
src/db/open.ts            openDb(path) + migration runner
src/domain/types.ts       rows, inputs, enums, GameplanError
src/domain/store.ts       Store: every write + events + notify
src/domain/reschedule.ts  rescheduleTask (+ cascade)
src/domain/plan.ts        planMilestone (bulk)
src/domain/revert.ts      revert(eventId | batchId)
src/domain/settings.ts    settings defaults/get/set, policy checks
src/domain/derive.ts      pure: progress, to-do state, health, spans
src/domain/queries.ts     read models for every screen
src/domain/search.ts      search(q)
src/export.ts             exportJson, exportMarkdown
src/backup.ts             snapshot, rotate, scheduler, lastBackup
src/server/app.ts         Hono: /api, /events, /mcp
src/server/main.ts        entry
src/mcp/tools.ts          registerTools
docs/agent-instructions.md
scripts/install-launchd.sh
test/**
```

## Screen → engine (what Plan 2 calls)
| Screen | Endpoint / query |
|---|---|
| Sidebar | `GET /api/projects?status=active` (colour, progress, milestones for the open one) · `GET /api/overview` (count) |
| Home | `GET /api/home` (today, at risk, rescheduled) · `GET /api/timeline?from&to` |
| Timeline / List / task pane | `GET /api/projects/:slug` (`projectTree`) |
| Updates | `GET /api/updates?project&since&actor=all\|agents\|you` |
| Drag / steppers / Undo | `POST /api/tasks/:id/reschedule` · `POST /api/events/:id/revert` |
| New task / milestone / project | `POST /api/milestones/:id/tasks` · `POST /api/projects/:slug/milestones` · `POST /api/projects` |
| Project settings | `PATCH /api/projects/:slug` |
| Paused & archived | `GET /api/overview` · `POST /api/restore` · `PATCH /api/projects/:slug {status}` |
| App settings | `GET/PATCH /api/settings` · `GET /api/agents` · `POST /api/backup` · `GET /api/export` |
| Search | `GET /api/search?q` |
| Live refresh | `GET /events` |

---

### Task 1: Scaffold, clock, migrations

**Files:** `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `migrations/001_init.sql`, `src/clock.ts`, `src/ids.ts`, `src/db/open.ts`. Tests `test/clock.test.ts`, `test/db.test.ts`.

**Produces:**
- `interface Clock { now(): string; today(tz: string): string }` · `systemClock` · `fixedClock(now: string): Clock` (ISO instant; `today(tz)` still converts)
- `addDays(d, n): string` · `diffDays(a, b): number` (b − a) · `isDate(s): boolean` · `weekday(d): 0..6` (Mon = 0)
- `newId(prefix: 'prj'|'ar'|'ms'|'tk'|'td'|'att'|'dep'|'ev'|'bat'): string` · `slugify(name: string): string` (kebab, ascii)
- `openDb(path: string): DatabaseSync` — creates the dir; `PRAGMA foreign_keys=ON; journal_mode=WAL`; applies `migrations/NNN_*.sql` with number > `user_version` in one transaction each, then sets `user_version`. `':memory:'` supported.

**`001_init.sql` (exact columns):**
- `projects(id PK, slug UNIQUE NOT NULL, name, color, status DEFAULT 'active', status_changed_at, vault_note, repo, github, default_priority DEFAULT 'p2', default_executor DEFAULT 'manual', labels_json DEFAULT '[]', ord, archived_at, created_at)`
- `areas(id PK, project_id FK, name, color, ord, UNIQUE(project_id, name))`
- `milestones(id PK, project_id FK, name, due NULL, status DEFAULT 'planned', description, ord, archived_at, created_at)`
- `tasks(id PK, milestone_id FK, area_id FK NULL, title, description, start NULL, end NULL, status DEFAULT 'todo', priority, executor, important INT DEFAULT 0, labels_json DEFAULT '[]', ord, archived_at, created_at, updated_at)`
- `todos(id PK, task_id FK, title, done INT DEFAULT 0, done_at, ord, after_json DEFAULT '[]', archived_at)`
- `dependencies(id PK, from_task_id FK, to_task_id FK NULL, to_milestone_id FK NULL, created_at, CHECK((to_task_id IS NULL) <> (to_milestone_id IS NULL)))`
- `attachments(id PK, task_id FK, role, kind, title, url, ref, state, actor, at, archived_at, UNIQUE(task_id, url))` + CHECKs on role/kind
- `events(id PK, project_id, entity, entity_id, label, actor, kind, before_json, after_json, reason, batch_id, at)` + indexes `(project_id, at)`, `(batch_id)`
- `settings(key PK, value_json)` · `agent_clients(name PK, first_seen, last_seen, calls INT)`

- [ ] **Step 1: Scaffold** — deps `hono @hono/node-server @hono/mcp @modelcontextprotocol/sdk zod`; dev `typescript tsx vitest @types/node`; scripts `dev`, `test`, `typecheck`, `build`; `"engines": {"node": ">=24"}`, `"type": "module"`.
- [ ] **Step 2: Failing tests** — `addDays('2026-11-30', 1) === '2026-12-01'`; `diffDays('2026-11-12','2026-11-24') === 12`; `isDate('2026-02-30') === false`; `weekday('2026-11-26') === 3`; `fixedClock('2026-11-25T23:30:00Z').today('Asia/Jerusalem') === '2026-11-26'` and `.today('UTC') === '2026-11-25'` (Review Focus 5); `slugify('Learn Studio!') === 'learn-studio'`. DB: fresh `:memory:` has all 10 tables and `user_version = 1`; reopening a file DB doesn't re-run 001; FK and dependency CHECK enforced.
- [ ] **Step 3: Run** `npx vitest run test/clock.test.ts test/db.test.ts` → FAIL.
- [ ] **Step 4: Implement.** `today(tz)` via `Intl.DateTimeFormat('en-CA', {timeZone: tz})`; date math via `Date.UTC` only.
- [ ] **Step 5: Run** → PASS; `npm run typecheck` clean.
- [ ] **Step 6: Commit** `feat: scaffold, clock, migrations`

### Task 2: Store — every write, events, notify

**Files:** `src/domain/types.ts`, `src/domain/store.ts`, `src/domain/settings.ts`. Test `test/store.test.ts`, `test/settings.test.ts`.

**Consumes:** Task 1. **Produces:**
- `type Ctx = { actor: string; reason?: string; batchId?: string }` · `class GameplanError { code: 'not_found'|'invalid'|'conflict'|'forbidden'; message }`
- `class Store { constructor(db, clock); onChange(fn: (e: EventRow) => void): () => void; tx<T>(fn: () => T): T; today(): string }` (today uses setting `time_zone`)
- Settings (`settings.ts`): `DEFAULTS = { time_zone: 'Asia/Jerusalem', week_start: 'mon', appearance: 'system', accent: '#2F6BF0', rescheduled_days: 14, show_paused: false, show_weekends: true, open_at_login: true, menu_bar_icon: true, agents_require_reason: true, agents_can_archive: false, agents_can_create_projects: true }` · `getSettings(db): Settings` · `Store.setSettings(ctx, patch): Settings` (unknown key or wrong type → `invalid`; `time_zone` must be a valid IANA zone) · `assertAgentAllowed(settings, actor, action: 'archive'|'create_project'|'move_dates', reason?)` → `forbidden` with the setting name in the message. `you` is never restricted.
- Projects: `createProject(ctx, {name, slug?, color?, vaultNote?, repo?, github?, areas?: {name, color?}[], firstMilestone?: {name, due?}}): Project` (slug = `slugify(name)`, `-2`, `-3`… on collision; one transaction) · `configureProject(ctx, slug, {name?, color?, status?, vaultNote?, repo?, github?, defaultPriority?, defaultExecutor?, areas?: {id?, name, color?}[], labels?: string[]}): Project` — `status` change sets `status_changed_at`; `areas` is the full ordered list: `id` given → rename/recolour, no id → insert, missing → delete only if no task uses it (else `conflict` naming the tasks); array order = `ord`.
- Milestones: `createMilestone(ctx, slug, {name, due?, status?, description?})` · `updateMilestone(ctx, id, patch)`
- Tasks: `createTask(ctx, milestoneId, TaskInput & {todos?: {title, after?: number[]}[]; after?: string[] /*task ids it waits for*/; links?: {url, title?, kind?}[] /*context*/}): Task` (one transaction; to-dos default linear) · `updateTask(ctx, id, Partial<TaskInput> & {status?, milestoneId?})` (milestone must be in the same project; `start/end` allowed here for `you`)
  - `TaskInput = {title, description?, area?: string, start?: string|null, end?: string|null, priority?, executor?, important?, labels?: string[]}`; omitted priority/executor → project defaults.
- To-dos: `addTodos(ctx, taskId, items)` · `updateTodo(ctx, id, {title?, after?})` · `setTodoDone(ctx, id, done)` (first tick on `todo` task → `doing`; all done → task `done`; untick on `done` task → `doing`)
- `reorder(ctx, entity: 'milestone'|'task'|'todo'|'area'|'project', ids: string[])` — ids must be all siblings of one parent; sets `ord` 0..n
- Dependencies: `addDependency(ctx, fromTaskId, {taskId} | {milestoneId})` · `removeDependency(ctx, id)`
- Attachments: `attach(ctx, taskId, {role, url, title?, kind?, state?}): Attachment` — upsert on `(task_id, url)`; kind/ref inferred: `github.com/<o>/<r>/commit/<sha>` → `commit`, ref = first 7 of sha; `/pull/<n>` → `pr`, ref `#n`; `projects/…` → `note`; `/…`, `~/…`, `file://` → `file`; else `link`; title defaults to ref or last path segment. · `detach(ctx, id)`
- `archive(ctx, entity, id)` (project/milestone cascade to children) · `restore(ctx, entity, id)` (restores the children archived in the same batch)

Validation: dates valid, `start ≤ end`, both or neither; area must exist in the task's project (message lists valid names); self-dependency and cycles (DFS) rejected; `after` to-dos in the same task and acyclic.

Event kinds: `created`, `updated`, `dates_changed` (before/after `{start,end}`), `status_changed`, `todo_done`, `todo_undone`, `reordered`, `dependency_added`, `dependency_removed`, `attached`, `detached`, `archived`, `restored`, `planned`, `settings_changed`, `reverted`. Child writes of one public call share a `batch_id`.

- [ ] **Step 1: Failing tests** (`fixedClock('2026-11-26T09:00:00Z')`, actor `you`):
  - `createProject({name:'Learn Studio', areas:[{name:'AI'},{name:'Design'}], firstMilestone:{name:'Prototype', due:'2027-01-15'}})` → slug `learn-studio`, 2 areas in order, 1 milestone, events share one batch; second project with the same name → `learn-studio-2`.
  - `configureProject` areas `[{id: aiId, name:'ML'}, {name:'QA'}]` with Design unused → AI renamed, Design deleted, QA added, ord 0/1; deleting an area a task uses → `conflict` naming the task.
  - status `paused` sets `status_changed_at`.
  - `createTask` with `todos:[a,b,c]`, `after:[otherTaskId]`, `links:['projects/x/x.md']` → 3 linear to-dos, 1 dependency, 1 context attachment kind `note`, one batch; with a cycle via `after` → `conflict`, nothing written.
  - area from another project → `invalid` listing valid names; `start > end` → `invalid`; only start → `invalid`.
  - to-do ticks: first → task `doing`; all → `done`; untick → `doing`. `after` from another task → `invalid`.
  - `reorder('todo', [c,a,b])` → ord 0,1,2; mixing parents → `invalid`.
  - `attach` commit url → kind `commit`, ref `a1c9e42`; same url again with `state:'merged'` → same row updated, no duplicate; `/pull/48` → `pr`, `#48`.
  - `archive('milestone')` archives its tasks in one batch; `restore('milestone')` brings back exactly those.
  - settings: defaults returned; `setSettings({time_zone:'Mars/Base'})` → `invalid`; `assertAgentAllowed` blocks `ai:x` archive by default, allows `you`.
  - `onChange` gets every event; unsubscribe works.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (every public write in `tx()`; notify after commit). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: store, settings and activity events`

### Task 3: Reschedule with cascade

**Files:** `src/domain/reschedule.ts`. Test `test/reschedule.test.ts`.

**Produces:** `rescheduleTask(store, ctx, taskId, {start, end, reason?, cascade?}): {moved: {id, title, from, to}[]; conflicts: string[]}`

`delta = diffDays(oldEnd, newEnd)`; with `cascade` and `delta > 0`, BFS over task→task dependents: open, dated, unarchived ones shift by `delta`; others stay but traversal continues (Review Focus 2, 3). One batch; each move its own `dates_changed` event (`reason` on the root, `cascade from "<title>"` on the rest). After the move, health of the moved tasks is recomputed and any new conflict reasons go into the root event's `after.conflicts` (Updates shows "now starts before README ends"). Agents without a reason → `forbidden` when `agents_require_reason`.

- [ ] **Step 1: Failing tests:** chain A(11-12..11-24)→B(11-25..11-30)→C(12-01..12-05); A end → 11-27 with cascade → B 11-28..12-03, C 12-04..12-08, 3 events, one batch. Without cascade → only A. B done → B stays, C shifts. B undated → C shifts. A earlier → only A. Move B to start 11-20 (before A ends) → `conflicts` contains "starts before" A. `ai:x` without reason → `forbidden`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: reschedule with cascade and conflict capture`

### Task 4: Derived state + read models

**Files:** `src/domain/derive.ts`, `src/domain/queries.ts`. Tests `test/derive.test.ts`, `test/queries.test.ts`.

**Produces (`derive.ts`, pure):**
- `taskProgress(status, todos): {pct, done, total}` — to-dos → done/total; none → 0/1 or 1/1 by status.
- `rollup(tasks): {pct, done, total}` — units: each to-do 1, task without to-dos 1; cancelled excluded.
- `todoStates(todos): Record<id, 'done'|'next'|'locked'|'open'>` — `locked` if any `after` undone; `next` = first (by ord) undone and unlocked.
- `taskHealth(task, deps: {title, end, open}[], milestoneDue, today): {health: 'done'|'unscheduled'|'late'|'conflict'|'on_track'; reasons: string[]; daysLate?: number}` — order: done/cancelled → `done`; undated → `unscheduled`; end < today → `late` (`"N days late"`); dep end ≥ task start → `conflict` (`"Starts before <title> ends"`); milestoneDue && end > due → `conflict` (`"Ends after <milestone> due"`); else `on_track`.
- `linkIsBad(fromEnd, toStart): boolean` · `milestoneSpan(tasks, due): {start, end}` (earliest dated start → due, or latest end if due null) · `milestoneHealth(...)` (`missed` when due < today and not done).

**Produces (`queries.ts`, archived excluded unless stated):**
- `projectTree(db, slug, today): ProjectTree` — project (+ settings fields, areas with task counts, labels) · milestones (progress `{pct,done,total}`, span, health, missed) · tasks (area name/colour, progress, health, reasons, daysLate, dependsOn `[{id,title,bad}]`, blocks, todos with state, attachments split into context/deliverables, deliverableCount) · milestone dependencies.
- `listProjects(db, today, status = 'active')` — `{slug, name, color, status, progress, atRisk, milestones: [{id, name, due, status, missed}], nextMilestone}`.
- `overview(db, today)` — `{paused: [{slug, name, color, progress, nextMilestone, pausedSince}], archived: [{slug, name, status, archivedAt, tasks, milestones}], count}` (archived = `archived_at` set).
- `home(db, today, settings)` — `{today, todayTasks: [{id, title, project, color, end, progress, executor}], atRisk: [{id, title, project, color, reasons}], rescheduled: [{task, project, color, from, to, actor, reason, at}]}` (window = `rescheduled_days`; projects `active`, plus `paused` when `show_paused`).
- `timeline(db, today, from, to)` — `[{project, color, milestones: [{id, name, start, due, progress, atRisk}]}]` for active projects, spans clipped to the window.
- `updates(db, {project?, since?, actor?: 'all'|'agents'|'you', limit = 100})` — events newest first, grouped-ready (`day` field), `planned` events carry counts, child `created` events of a `planned` batch are folded into it.

- [ ] **Step 1: Failing tests** — derive: 1/4 to-dos → 25%; rollup {3/4} + {done, none} → 4/5 = 80%; to-dos [done, open, open(after 2nd)] → `done, next, locked`; end 11-19 today 11-26 → late, "7 days late"; dep "README" ends 11-30, task starts 11-27 → conflict "Starts before README ends"; due null → no milestone conflict (Backlog); undated → `unscheduled`. Queries: task 11-20..11-26 in `home.todayTasks` on 11-26, 11-27..11-30 not, undated not; paused project's tasks only when `show_paused`; `overview` lists a paused project with `pausedSince` and an archived one with task/milestone counts; `timeline` span of M4 = earliest task start → due; `updates({actor:'agents'})` only `ai:*`; a plan shows one `planned` row, not N `created` rows; `listProjects` excludes paused.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: derived state and read models for every screen`

### Task 5: plan_milestone

**Files:** `src/domain/plan.ts`. Test `test/plan.test.ts`.

**Produces:**
```ts
type PlanInput = { tasks: Array<TaskInput & { key: string; todos?: {title: string; after?: number[]}[]; dependsOn?: string[] /* keys or task ids */; links?: {url: string; title?: string}[] }>; milestoneDependsOn?: string[] }
planMilestone(store, ctx, milestoneId, plan): { tasks: Record<string, string>; todos: number; dependencies: number }
```
One transaction, one batch; on top of the per-entity events it writes one `planned` event on the milestone with `after = {tasks, todos, dependencies}` (Updates shows "6 tasks · 28 to-dos · 5 dependencies"). Any error → nothing written.

- [ ] **Step 1: Failing tests:** 3 tasks (3/2/2 to-dos, design → implement → test) → 7 to-dos, 2 deps, linear `after`; mutual `dependsOn` → `conflict`, nothing written; unknown area → `invalid`; existing task id from another project in `dependsOn` → accepted; the `planned` event has the counts.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: plan_milestone`

### Task 6: Revert, search, export

**Files:** `src/domain/revert.ts`, `src/domain/search.ts`, `src/export.ts`. Tests `test/revert.test.ts`, `test/search.test.ts`, `test/export.test.ts`.

**Produces:**
- `revert(store, ctx, eventId): {reverted: number}` — reverts the event's whole batch, newest first, by applying the inverse (`dates_changed` → old dates; `updated`/`status_changed` → before fields; `todo_done` ↔ `todo_undone`; `dependency_added` ↔ remove/re-add; `attached` → detach; `archived` ↔ restore; `created`/`planned` → archive what was created; `reordered` → old order). Before applying, each entity's current value must equal the event's `after` → else `conflict` "changed since" and nothing written (Review Focus 4). Writes `reverted` events in a new batch. `settings_changed` and `reverted` are not revertible.
- `search(db, q, limit = 20): {type: 'project'|'milestone'|'task'|'todo'|'attachment', id, title, project, path}[]` — case-insensitive `LIKE` on titles/names/urls, active first.
- `exportJson(db): object` (all tables) · `exportMarkdown(db, slug?): string` — per project: `# name`, `## milestone (due)`, `- [ ] task (start → end)` with to-dos indented.

- [ ] **Step 1: Failing tests:** cascade move of 3 tasks then `revert(rootEventId)` → all 3 back, 3 `reverted` events; move then manual edit then revert → `conflict`, unchanged; revert a `planned` event → its tasks archived; revert a to-do tick → unticked and task status back; `search('read')` finds task "README" and attachment `README.md`; `exportMarkdown('mcp-pipe')` contains `## M4 · Launch (2026-12-12)` and `- [x]` for done to-dos.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: revert, search, export`

### Task 7: HTTP API + SSE

**Files:** `src/server/app.ts`, `src/server/main.ts`. Test `test/api.test.ts`.

**Produces:** `createApp({store, db, clock}): Hono`. JSON; errors `{error: {code, message}}` → 404 not_found / 400 invalid / 409 conflict / 403 forbidden. Actor `you`.
- Reads: `GET /api/home` · `/api/timeline?from&to` (default today−10 … today+45) · `/api/projects?status=` · `/api/projects/:slug` · `/api/overview` · `/api/updates?project&since&actor` · `/api/search?q` · `/api/settings` · `/api/agents` (agent_clients) · `/api/export?format=json|md&project=` (download headers) · `/api/backup` (last backup).
- Writes: `POST /api/projects` · `PATCH /api/projects/:slug` · `POST /api/projects/:slug/milestones` · `PATCH /api/milestones/:id` · `POST /api/milestones/:id/tasks` · `PATCH /api/tasks/:id` · `POST /api/tasks/:id/reschedule` · `POST /api/tasks/:id/todos` · `PATCH /api/todos/:id` (`{done}` or `{title, after}`) · `POST /api/reorder` · `POST /api/tasks/:id/attachments` · `DELETE /api/attachments/:id` · `POST /api/dependencies` · `DELETE /api/dependencies/:id` · `POST /api/archive` · `POST /api/restore` · `POST /api/events/:id/revert` · `PATCH /api/settings` · `POST /api/backup` (back up now).
- `GET /events` — SSE `event: change` per store event (data = event JSON); heartbeat every 25 s.
- `main.ts`: env, `openDb`, `Store`, backups (Task 9), `serve` on `127.0.0.1`, log `gameplan listening on http://127.0.0.1:4747 (mcp: /mcp)`.

- [ ] **Step 1: Failing tests** via `app.request()`: create project (with areas + first milestone) → task → `GET /api/home` lists it in `todayTasks`; bad dates → 400; unknown slug → 404; reschedule then `POST /api/events/:id/revert` → dates restored; `PATCH /api/settings {agents_can_archive: true}` persists; `/api/export?format=md` returns `text/markdown`; SSE reader gets `change` after a PATCH.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Manual:** `GAMEPLAN_DB=/tmp/gp.db npm run dev`; `curl -s 127.0.0.1:4747/api/home` → JSON with today's date.
- [ ] **Step 6: Commit** `feat: http api and live events`

### Task 8: MCP tools (agent-agnostic)

**Files:** `src/mcp/tools.ts`; modify `src/server/app.ts`. Test `test/mcp.test.ts`.

**Produces:** `registerTools(server: McpServer, deps: {store, db, clock, actor: () => string}): void`, mounted at `/mcp` with `@hono/mcp` `StreamableHTTPTransport`. Actor = `ai:${clientInfo.name ?? 'unknown'}`. Every call upserts `agent_clients` (first/last seen, calls). `GameplanError` → `isError: true` with the message.

| tool (24) | maps to |
|---|---|
| `list_projects {status?}` · `get_project {slug, depth?: milestones\|tasks\|full}` · `get_milestone {id}` · `get_task {id}` | queries (`get_task`: description, to-dos with state, attachments, deps, last 10 events) |
| `get_today` · `get_at_risk` · `get_updates {since?, project?}` · `search {q}` | queries |
| `create_project` (gated by `agents_can_create_projects`) · `configure_project` · `create_milestone` · `update_milestone` | Store |
| `plan_milestone {milestone_id, tasks, milestone_depends_on?}` | planMilestone — "Plan a whole milestone in one call before work starts." |
| `create_task` (with todos/after/links) · `update_task` (no dates → "use reschedule_task") | Store |
| `reschedule_task {id, start, end, reason, cascade?}` | rescheduleTask (reason required by policy) |
| `add_todos` · `complete_todo {id, done?}` — "Call as soon as you finish a to-do." | Store |
| `add_dependency` · `remove_dependency` | Store |
| `attach {task_id, role, url, title?, state?}` — "Attach every commit/PR you make for a task as a deliverable." · `detach {id}` | Store |
| `archive` (gated by `agents_can_archive`) · `restore` | Store |

- [ ] **Step 1: Failing tests** (SDK `Client` + `InMemoryTransport`, client name `codex`): `listTools` → 24; `plan_milestone` then `get_project` shows tasks; `complete_todo` → event actor `ai:codex`, `agent_clients` row with calls ≥ 2; `archive` → `isError` naming `agents_can_archive`, allowed after the setting flips; `reschedule_task` without reason → `isError`; `update_task` with `start` → `isError` mentioning `reschedule_task`; HTTP test: server on port 0, `StreamableHTTPClientTransport` → `get_today` succeeds.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Manual:** register in two agents — `claude mcp add --transport http gameplan http://127.0.0.1:4747/mcp` and Codex's equivalent (README) — ask each "list my gameplan projects"; both appear in `GET /api/agents`.
- [ ] **Step 6: Commit** `feat: mcp tools with agent policy`

### Task 9: Backups, always-on, agent instructions

**Files:** `src/backup.ts`, `scripts/install-launchd.sh`, `docs/agent-instructions.md`, `README.md`; modify `src/server/main.ts`. Test `test/backup.test.ts`.

**Produces:** `snapshot(db, dir, clock, force = false): string` (`gameplan-YYYY-MM-DD.json` = `exportJson`; skips if today's exists unless `force`) · `rotate(dir, keep = 30)` · `startBackups(db, dir, clock): () => void` (on start + every 6 h) · `lastBackup(dir): {file, at} | null`. Dir = `<db dir>/backups`.

- [ ] **Step 1: Failing tests:** two snapshots same day → one file; `force` → overwritten; 32 files + rotate → 30 newest; `lastBackup` returns the newest; snapshot has all 10 tables.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5:** `install-launchd.sh` → `~/Library/LaunchAgents/dev.gameplan.server.plist` (`RunAtLoad`, `KeepAlive`, `node dist/server/main.js`, log `~/Library/Logs/gameplan.log`), `launchctl bootstrap`. Plan 3 replaces it.
- [ ] **Step 6:** `docs/agent-instructions.md` — agent-neutral: plan with `plan_milestone` before starting; `complete_todo` right after each to-do; `attach` every commit/PR; `reschedule_task` with a reason when dates slip; read cheaply (`get_today`, `get_project depth=tasks`); never archive unless asked. README: install, run, connect commands for Claude Code, Codex, Cursor, Gemini CLI, env vars.
- [ ] **Step 7: Verify:** `npm test` green, `npm run typecheck` clean, launchd agent serves `/api/home` after login.
- [ ] **Step 8: Commit** `feat: backups, launchd agent, agent instructions`

---

## Next plans
- **Plan 2 — UI** (React + Vite, served by this server): every mockup screen, wired to the endpoints in "Screen → engine"; live via `/events`; Undo = revert of the last own event.
- **Plan 3 — Tauri shell:** tray app, autostart, Node single-executable sidecar; reads `open_at_login` / `menu_bar_icon`; opens repo/vault paths; replaces launchd.
- **After Plan 3 — Gameplan skill:** grows from `docs/agent-instructions.md`.
