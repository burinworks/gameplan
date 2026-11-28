# Gameplan — instructions for AI agents

Gameplan holds the user's plan of record: **Projects › Milestones › Tasks › To-dos**, with dependencies, context links and deliverables. It runs locally and is reachable over MCP at `http://127.0.0.1:4747/mcp`. Every change you make is logged with your client name and shown to the user in Updates, so work in the open.

## How to work with it

1. **Plan before you start a milestone.** Call `plan_milestone` once with every task, its to-dos, context links and `depends_on` (keys inside the plan or existing task ids). It is all-or-nothing: a cycle or a bad area name writes nothing.
2. **Tick to-dos as you go.** Call `complete_todo` right after finishing each to-do, not in a batch at the end.
3. **Finishing sends work to review.** When you tick the last to-do or set `status: done`, the task goes to `review` and waits for the user. Never tell the user a task is done; tell them it is ready for their review. There is no tool for you to accept a review.
4. **Attach what you produce.** Every commit, PR or ticket for a task: `attach` with the URL (GitHub commits/PRs/issues, Jira and Linear tickets are parsed). Attach the same URL again with `state: merged` when it merges.
5. **Add to the execution log.** End every work session on a task with `set_resume_note`: it appends one line to the task's execution log, saying where you stopped and what comes next. The newest entry shows under "Pick up where you left off". You can only change your own entries; an empty note is ignored.
6. **Capture loose ends.** Ideas, side issues and follow-ups you notice go to the inbox with `capture`, not into new tasks. The user triages them.
7. **Move dates honestly.** When work slips, `reschedule_task` with a `reason` the user will read. Use `cascade: true` to push dependents by the same number of days. `update_task` cannot change dates.
8. **Read cheaply.** Start with `get_today` (plan, pick-up, today, needs review), `get_at_risk`, or `get_project` with `depth: tasks`. Use `get_task` only when you need one task's description, to-dos, execution log and history.
9. **Never archive unless the user asks.** It is off for agents by default (`agents_can_archive`).

## Useful facts

- Dates are `YYYY-MM-DD`, calendar days, `end` inclusive. Give `start` and `end` together or not at all (undated tasks are fine while planning).
- Dependencies are finish-to-start: "A depends on B" means B must end before A starts. A task can also wait for a whole milestone.
- Task `status` is `todo`, `doing`, `review` (waiting for the user), `done` or `cancelled`. `executor` is `manual`, `ai` or `together`.
- `health` is `on_track`, `late` (with days), `conflict` (starts before a dependency ends, or ends after its milestone's due), `unscheduled`, `review` or `done`.
- New projects can start from a template (`list_templates`, then `create_project` with `template` and `start_date`).
- To-do `state` is `next` (do this one), `locked` (waits for another to-do), `open` or `done`.
- Errors come back as `isError` with a message that says what to change.
