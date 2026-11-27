# Gameplan — Plan 1b: Work features (review, resume notes, day plan, inbox, templates)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing engine (Plan 1, done) for people who use AI in their daily work: AI work goes to review before it counts as done; every task carries a one-line "where I left off" note; a daily plan of up to 3 tasks; an inbox for loose items; Done this week; built-in project templates; ticket links (Jira / Linear / GitHub issues). Task descriptions stay free-form.

**Architecture:** Same process and layering as Plan 1. One new migration (`002`) that rebuilds `tasks` and `attachments` (SQLite can't alter CHECK constraints) and adds two tables. New behaviour goes into `Store` (writes + events), `derive.ts`, `queries.ts`, a new `templates.ts`, then HTTP routes and MCP tools.

**Tech Stack:** unchanged (Node 24, TypeScript, `node:sqlite`, Hono, MCP SDK, zod, vitest).

**Why these features:** fragmented work and task switching (González & Mark, CHI 2004; Leroy 2009) → resume notes; plan-making removes the cost of open loops and if-then plans raise follow-through (Masicampo & Baumeister 2011; Gollwitzer & Sheeran 2006) → day plan + inbox; visible progress motivates (Amabile & Kramer 2011) → Done this week; AI output is uneven and people misjudge it (Dell'Acqua et al. 2023; METR 2025) → review before done.

## Global Constraints
- Everything in Plan 1's constraints still holds (dates, time zone, soft deletes, events with actor + label + batch, compact agent responses, migrations only forward).
- Task status `todo|doing|review|done|cancelled`; executor `manual|ai|together`; attachment kind adds `ticket`.
- Agents never set a task to `done` while setting `agents_need_review` is true (default **true**): any agent path that would reach `done` lands on `review`. Only `you` accepts or sends back.
- Resume note: one line, trimmed, ≤ 200 chars, no newlines; stores `resume_at` and `resume_by` (actor).
- Day plan: ≤ 3 tasks per date, open tasks only (`todo|doing`), each with optional `when` text ≤ 40 chars ("after standup").
- New setting `mcp_token` (default `null`): when set, `/mcp` requires `Authorization: Bearer <token>`.

## Review Focus
1. **Agent completion paths** — last to-do ticked by an agent, `update_task {status:'done'}` by an agent, `plan_milestone`/`create_task` with `status:'done'`, and `revert` of a `review_accepted` by an agent → never `done` while `agents_need_review`.
2. **Migration 002 on a populated DB** — every task, attachment, dependency, to-do and event survives with identical ids; `PRAGMA foreign_key_check` is empty afterwards.
3. **Day plan with stale tasks** — a planned task that is later done, archived or moved to review drops out of `home().plan` without errors; the date uses the configured time zone.
4. **Double triage** — triaging an inbox item twice → `conflict`, nothing written.
5. **Revert** — reverting `review_accepted` returns the task to `review`; reverting `review_sent_back` returns it to `review` and restores the previous resume note.

---

### Task 1: Migration 002 + runner support for table rebuilds

**Files:** Create `migrations/002_work.sql`; modify `src/db/open.ts`, `src/domain/types.ts`, `src/export.ts` (`TABLES`). Test `test/db.test.ts`, `test/migration-002.test.ts`.

**Produces:**
- Runner: a migration whose first line is `-- gameplan: foreign_keys=off` runs as `PRAGMA foreign_keys=OFF` → `BEGIN` → sql → `user_version` → `COMMIT` → `PRAGMA foreign_key_check` (any row → throw with the table names) → `PRAGMA foreign_keys=ON`.
- `002_work.sql` (with that header):
  - rebuild `tasks` with `status CHECK IN ('todo','doing','review','done','cancelled')`, `executor CHECK IN ('manual','ai','together')`, new columns `resume_note TEXT`, `resume_at TEXT`, `resume_by TEXT`; copy rows; recreate `tasks_milestone` index.
  - rebuild `attachments` with `kind CHECK IN ('commit','pr','file','link','note','ticket')`; copy rows; keep `UNIQUE(task_id, url)`.
  - `day_plan_items(date TEXT NOT NULL, task_id TEXT NOT NULL REFERENCES tasks(id), ord INTEGER NOT NULL, when_text TEXT, PRIMARY KEY(date, task_id))`
  - `inbox_items(id TEXT PRIMARY KEY, text TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL, triaged_at TEXT, triaged_to_json TEXT, archived_at TEXT)`
- `types.ts`: `TASK_STATUS`, `EXECUTOR`, `ATTACHMENT_KIND` extended; `Task` gets `resumeNote`, `resumeAt`, `resumeBy`; new `DayPlanItem`, `InboxItem` + mappers; `EventKind` adds `review_accepted`, `review_sent_back`, `resume_noted`, `day_planned`, `captured`, `triaged`; `EntityType` adds `'day_plan' | 'inbox'`.
- `TABLES` in `export.ts` adds `day_plan_items`, `inbox_items` (12 tables).

- [ ] **Step 1: Failing tests** — fresh DB: `user_version = 2`, 12 tables, inserting a task with `status='review'` and `executor='together'` works, attachment `kind='ticket'` works. Upgrade test: build a v1 DB from `001_init.sql` only, insert a project/milestone/2 tasks/to-dos/dependency/attachment/events, run `openDb` → same ids and values, new columns null, `foreign_key_check` empty (Review Focus 2). Backup/export tests updated to 12 tables.
- [ ] **Step 2: Run** `npx vitest run test/db.test.ts test/migration-002.test.ts` → FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run** full suite → PASS (existing tests must stay green).
- [ ] **Step 5: Commit** `feat: migration 002 (review status, together, resume notes, day plan, inbox, tickets)`

### Task 2: Review flow

**Files:** modify `src/domain/store.ts`, `src/domain/settings.ts`, `src/domain/derive.ts`, `src/domain/queries.ts`, `src/domain/revert.ts`. Test `test/review.test.ts`.

**Produces:**
- `DEFAULTS.agents_need_review = true`.
- Private `routeStatus(c: WCtx, next: TaskStatus): TaskStatus` — returns `'review'` when `next === 'done'`, actor is an agent and `agents_need_review`; used by `updateTask`, `setTodoDone`'s auto-transition, `createTask`, `planMilestone` and `revert`.
- `setTodoDone`: all to-dos done → `routeStatus('done')`; unticking on a `review` task → `doing`.
- `reviewTask(ctx, id, {decision: 'accept' | 'send_back', note?: string}): Task` — agents → `forbidden` ("only you can review"); task must be in `review` else `invalid`; accept → `done` + event `review_accepted`; send back → `doing` + event `review_sent_back` (reason = note) and, when `note` is given, sets the resume note to it (same batch).
- derive: `Health` adds `'review'` (checked right after done/cancelled; never late or conflict); `isOpen` stays `todo|doing`; rollup counts a `review` task's done to-dos normally, but a task without to-dos counts as done only when `done`. Milestone is complete only when every task is `done|cancelled`.
- revert: `review_accepted` → back to `review`; `review_sent_back` → back to `review` + old resume note; both check "changed since".

- [ ] **Step 1: Failing tests:** `ai:codex` ticks last to-do → task `review`, not `done`; `ai:codex` `updateTask {status:'done'}` → `review`; with `agents_need_review=false` → `done`; `you` ticks last to-do → `done`; `reviewTask` by `ai:codex` → `forbidden`; accept → `done` + `review_accepted`; send back with note → `doing`, resume note = note; untick on review → `doing`; `taskHealth` of a review task with `end` in the past → `review`; revert cases (Review Focus 5); `createTask` by an agent with `status:'done'` → `review` (Review Focus 1).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: review flow for AI work`

### Task 3: Resume notes

**Files:** modify `src/domain/store.ts`, `src/domain/queries.ts`, `src/domain/revert.ts`. Test `test/resume.test.ts`.

**Produces:**
- `setResumeNote(ctx, taskId, note: string | null): Task` — trims; `''` → null (clear); newline or > 200 chars → `invalid`; sets `resume_at = clock.now()`, `resume_by = ctx.actor`; event `resume_noted` with before/after `{note}`. Revertible.
- Task views (`projectTree`, `taskDetail`, MCP `get_task`) include `resume: {note, at, by} | null`.

- [ ] **Step 1: Failing tests:** set by `ai:claude-code` → stored with by/at; multi-line → `invalid`; 201 chars → `invalid`; clear with `''`; revert restores the previous note; `projectTree` exposes `resume`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: resume notes`

### Task 4: Day plan, pick-up list, needs review, done this week

**Files:** modify `src/domain/store.ts`, `src/domain/queries.ts`, `src/domain/revert.ts`. Test `test/home.test.ts`.

**Produces:**
- `planDay(ctx, date: string, items: {taskId: string; when?: string}[]): DayPlanItem[]` — replaces that date's list in order; > 3 items, duplicate ids, non-open or archived task, `when` > 40 chars → `invalid`; event `day_planned` (entity `day_plan`, entity_id = date, before/after = item lists). Revertible.
- `home()` response gains (existing keys unchanged):
  - `plan: [{n, task: TodayTask, when, resume}]` — today's items whose task is still open and unarchived (Review Focus 3).
  - `pickUp: [{task, resume}]` — open tasks with a resume note in shown projects, not in `plan`, newest `resume_at` first, max 5.
  - `alsoToday` — today's dated open tasks not in `plan` or `pickUp` (the old `todayTasks` remains for compatibility).
  - `needsReview: [{task, project, color, by, at, todos: {done, total}}]` — tasks in `review`, oldest first; `by`/`at` from the event that moved it to review.
  - `doneThisWeek: {count, items: [{id, title, project, at}]}` — `status_changed` to `done` or `review_accepted` events since the week start (`week_start` setting, in the configured time zone), newest 10, minus reverted ones.
- `getDayPlan(db, date)`.

- [ ] **Step 1: Failing tests:** plan 3 tasks with `when` → `home().plan` in order with resume notes; a 4th → `invalid`; done task in plan disappears from `plan`; pick-up excludes planned tasks and caps at 5; `needsReview` lists an agent-finished task with `by: 'ai:codex'`; `doneThisWeek` with `week_start='mon'` on Friday 2026-11-27 counts Monday 2026-11-23 onwards and drops a reverted completion.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: day plan, pick-up, needs review, done this week`

### Task 5: Inbox

**Files:** modify `src/domain/store.ts`, `src/domain/queries.ts`, `src/domain/search.ts`, `src/domain/revert.ts`. Test `test/inbox.test.ts`.

**Produces:**
- `capture(ctx, text: string): InboxItem` (trimmed, 1–500 chars; event `captured`).
- `triageInbox(ctx, id, to: {as: 'task'; milestoneId: string; task?: Partial<CreateTaskInput>} | {as: 'todo'; taskId: string} | {as: 'dismiss'}): {item: InboxItem; created?: {entity: 'task' | 'todo'; id: string}}` — one batch: creates the task (title defaults to the item text) or appends a to-do, sets `triaged_at` + `triaged_to_json`; dismiss sets `archived_at`; already triaged/dismissed → `conflict` (Review Focus 4); event `triaged`. Revert archives what was created and re-opens the item.
- `inbox(db): {count, items: [{id, text, by, at}]}` (untriaged, unarchived, newest first). `search` includes inbox items (`type: 'inbox'`).

- [ ] **Step 1: Failing tests:** capture by `you` and `ai:codex`; triage to task → task exists with the text as title, item gone from `inbox()`; triage to to-do; dismiss; second triage → `conflict`; revert a triage; search finds an inbox item.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: inbox capture and triage`

### Task 6: Templates and ticket links

**Files:** create `src/domain/templates.ts`; modify `src/domain/store.ts` (`createProject`, `inferAttachment`). Tests `test/templates.test.ts`, `test/store.test.ts`.

**Produces:**
- `type Template = {id: 'report'|'launch'|'research'; name; areas: {name, color}[]; milestones: {name; offsetDays: number}[]; tasks: {milestone: number; title; area; startOffset: number; days: number; todos: string[]; after?: number[]}[]}` and `TEMPLATES` with the three built-ins:
  - **Report** — areas Research, Data, Writing, Design · milestones Outline (+4), Draft (+11), Final (+32) · 9 tasks (e.g. "Collect sources", "Pull the numbers", "Write the draft", "Review with stakeholder", "Final edit + layout").
  - **Launch** — areas Product, Marketing, Content, QA · milestones Plan (+5), Build (+19), Ready (+26), Launch (+30) · 14 tasks.
  - **Research** — areas Reading, Interviews, Analysis, Writing · milestones Questions (+3), Fieldwork (+17), Findings (+24) · 8 tasks.
- `listTemplates(): {id, name, milestones: number, tasks: number}[]`.
- `createProject` accepts `template?: Template['id']` and `startDate?: string` (default today): areas from the template (merged with given ones), milestones with `due = startDate + offsetDays`, tasks with dates and to-dos, all in one batch with one `planned` event per milestone. `firstMilestone` is ignored when a template is given.
- `inferAttachment`: Jira `/browse/([A-Z][A-Z0-9]+-\d+)` → `ticket`, ref = key; Linear `linear.app/[^/]+/issue/([A-Z][A-Z0-9]*-\d+)` → `ticket`, ref = key; GitHub `github.com/<o>/<r>/issues/(\d+)` → `ticket`, ref `#n`.

- [ ] **Step 1: Failing tests:** `createProject({name:'Q1 board report', template:'report', startDate:'2026-12-07'})` → 4 areas, Outline due `2026-12-11`, Final due `2027-01-08`, 9 tasks, all dated, one batch; `listTemplates()` has 3 entries with counts; Jira/Linear/GitHub-issue urls → `ticket` with the right refs; a GitHub PR url is still `pr`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: project templates and ticket links`

### Task 7: HTTP, MCP, token, docs

**Files:** modify `src/server/app.ts`, `src/mcp/tools.ts`, `src/mcp/http.ts`, `docs/agent-instructions.md`, `README.md`. Tests `test/api.test.ts`, `test/mcp.test.ts`.

**Produces:**
- HTTP: `POST /api/tasks/:id/review` `{decision, note?}` · `PUT /api/tasks/:id/resume` `{note}` · `GET|PUT /api/day-plan/:date` · `GET /api/inbox` · `POST /api/inbox` `{text}` · `POST /api/inbox/:id/triage` · `GET /api/templates`; `GET /api/home` returns the Task 4 shape; `POST /api/projects` accepts `template`, `startDate`.
- MCP (24 → 30 tools): `set_resume_note {task_id, note}` — "Call at the end of every work session on a task: one line on where you stopped and what comes next." · `plan_day {date?, items}` · `capture {text}` — "Put anything loose you notice here instead of creating tasks." · `get_inbox` · `triage {item_id, as, …}` · `list_templates`. `get_today` returns `plan`, `pickUp`, `alsoToday`, `needsReview`. `complete_todo` / `update_task` responses include `"status": "review"` and the note "waiting for the user's review" when routed. `create_project` accepts `template`, `start_date`. There is deliberately no review tool for agents.
- `mcp_token`: when set, `/mcp` without the right `Authorization: Bearer` → 401. `GET /api/settings` never returns the token's value (only `mcp_token_set: true|false`).
- `docs/agent-instructions.md`: plan with `plan_milestone`; tick with `complete_todo`; attach every commit/PR/ticket; finishing a task sends it to review, never claim it's done; end each session with `set_resume_note`; loose ideas → `capture`; dates slip → `reschedule_task` with a reason.
- README "Connect": Claude Code, Codex, Cursor, Gemini CLI, **Claude Desktop** (config entry for an HTTP MCP server), **ChatGPT** (needs a public HTTPS URL: set `mcp_token` first, then a tunnel restricted to the `/mcp` path, e.g. a cloudflared ingress rule with `path: ^/mcp`).

- [ ] **Step 1: Failing tests:** API — agent-free review accept via `POST /review`; `PUT /api/day-plan/2026-11-27` then `GET /api/home` shows the plan; inbox capture → triage; `POST /api/projects {template:'launch'}` → 4 milestones. MCP — `listTools` → 30; `complete_todo` on the last to-do as `codex` returns `status: review`; `set_resume_note` stores `by = ai:codex`; `capture` shows in `get_inbox`; with `mcp_token` set, a client without the header gets 401 and one with it succeeds; `/api/settings` hides the token.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** full suite → PASS; `npm run typecheck` clean.
- [ ] **Step 5: Manual:** restart the launchd agent; in an agent, finish a test task → it shows in `GET /api/home` `needsReview`.
- [ ] **Step 6: Commit** `feat: work features over http and mcp`

---

## UI work this implies (Plan 2 scope)
- **Home:** capture field; My plan (≤3, `when`, resume line, "Plan my day" picker); Pick up where you left off; Also today; side column Needs review / At risk / Rescheduled; Done this week strip; timeline below.
- **Inbox screen** (sidebar entry with count): capture, then Make task (opens New task pane prefilled) · Add as to-do · Dismiss.
- **Task pane:** Where I left off box (edit inline); review bar with Accept / Send back (note) when status is `review`; executor chip Me / AI / Together; ticket chips in context/deliverables.
- **List / Updates:** `Review` status pill (purple); feed rows for sent for review, accepted, sent back, left off at, captured.
- **New project:** Blank / Report / Launch / Research + start date, milestone preview.
- **App settings:** "AI work needs my review" switch; connect tabs incl. Claude Desktop and ChatGPT; MCP token field.
