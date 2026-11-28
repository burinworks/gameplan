# Screens

What each screen contains. Layout, components and copy follow [ui-rules](ui-rules.md), [content-rules](content-rules.md) and [ui-tokens](ui-tokens.md).

- **Sidebar**: Home · Search · Projects (`+` new project; each with colour + progress; the open one shows a `…` menu and expands its milestones with due dates, done ones muted) · "Paused & archived" with count · Settings at the bottom.
- **Home**: date heading + capture field (→ Inbox). **Today**: My plan (≤3, each with "when" and its resume note; "Plan my day" picker when empty) · Pick up where you left off · Also today. Side column: **Needs review**, **At risk**, **Rescheduled**. **Done this week** strip. Global timeline: one row per active project, milestone spans with progress, diamond at due, red outline when at risk.
- **Menu bar menu** (tray icon, Plan 3): Capture field at the top (Enter → Inbox, menu stays open for the next item), My plan (3 rows → open the task), Needs review (count), Open Gameplan, Settings…, Quit. No global shortcut.
- **Inbox**: captured items (text, by whom, age); Make task (opens New task pane prefilled) · Add as to-do to… · Dismiss.
- **Project header**: project title is a menu (Settings, Open repository, Open vault note, Archive) · tabs Timeline / List / Updates.
- **Timeline**: grouped by milestone (or area), groups collapse; row = title + end date + conflict dot; bars coloured by area with progress; arrows, red when bad; milestone diamond; weekends shaded; Today line; Day/Week/Month zoom. Drag to move, drag edges to resize (no cascade), drag a bar's end onto another bar/diamond to link. Undo (⌘Z) reverts the last change.
- **List**: grouped by milestone (due · done/total to-dos); columns task (+AI chip, star), area, dates (sortable), to-do bar + x/y, status pill (Done · Review · Doing · To do · Conflict), priority, deliverables count.
- **Updates**: grouped by day; filter All / Agents / You; moves show old → new, reason, and new conflicts in red; commits show sha, PRs number; a plan shows "6 tasks · 28 to-dos · 5 dependencies".
- **Task pane** (right): milestone name, title, chips (status/health, priority, Me/AI/Together, important); in review a bar with Accept / Send back; **Where I left off** (note, by whom, when, edit); Start / End with −/+ one day, Length, Area, After, Blocks; Context (description + linked notes/URLs); To-do (x/y, bar, checklist with next/locked, drag to reorder); Deliverables (commit sha, PR #n + state, files, links).
- **New task / New milestone**: open in the right pane; the draft shows dashed on the timeline. Task: title, milestone, area, start, end, priority, done by, after, to-dos, context. Milestone: name, due (stepper + calendar), status, goal.
- **New project**: sheet — start from Blank / Report / Launch / Research (+ start date), name, colour, areas as toggle chips (AI, Frontend, Backend, Design, QA, + add), first milestone + due, GitHub, vault note.
- **Project settings** (via `…` or title menu): General (name, colour, status), Links (vault, repo, GitHub), New tasks (priority, done by), Areas (reorder, colour, task count, add), Labels, Archive.
- **Paused & archived**: paused — next milestone, progress, paused since, Resume; archived — tasks/milestones summary, Done or Dropped, archived date, Restore.
- **App settings**: General (appearance, accent, week start, time zone, open at login, menu bar icon) · Home (rescheduled window 7/14/30, show paused projects, weekends on timelines) · Agents & MCP (endpoint + copy, connect instructions per agent: Claude Code / Codex / Cursor / Gemini CLI / Claude Desktop / ChatGPT (needs an HTTPS tunnel — local endpoints aren't reachable from ChatGPT) / Other, switch "AI work needs my review" [on], MCP token (required on `/mcp` when set; needed before any tunnel), connected clients + last seen, switches: agents must give a reason to move dates [on], agents can archive [off], agents can create projects [on]) · Data (DB folder, backups + last run + back up now, export JSON / Markdown).
- **Search** (my call, not mocked): ⌘K palette over projects, milestones, tasks, to-dos, attachments; enter opens the item.

## Scheduling rules (UI-relevant)
- Today = local date in the configured time zone (default Asia/Jerusalem). Calendar days, inclusive.
- UI drags never cascade; agents' `reschedule_task` may cascade (dependents shift by the same delta, never earlier, done/cancelled ones stay).

