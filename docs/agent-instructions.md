# Gameplan — instructions for AI agents

Gameplan holds the user's plan of record: **Projects › Milestones › Tasks › To-dos**, with dependencies, context links and deliverables. It runs locally and is reachable over MCP at `http://127.0.0.1:4747/mcp`. Every change you make is logged with your client name and shown to the user in Updates, so work in the open.

## How to work with it

1. **Plan before you start a milestone.** Call `plan_milestone` once with every task, its to-dos, context links and `depends_on` (keys inside the plan or existing task ids). It is all-or-nothing: a cycle or a bad area name writes nothing.
2. **Tick to-dos as you go.** Call `complete_todo` right after finishing each to-do — not in a batch at the end. When all to-dos are done the task becomes done.
3. **Attach what you produce.** Every commit or PR you make for a task: `attach` with `role: deliverable` and the GitHub URL (sha / PR number are parsed). Attach the same URL again with `state: merged` when it merges.
4. **Move dates honestly.** When work slips, `reschedule_task` with a `reason` the user will read. Use `cascade: true` to push dependents by the same number of days. `update_task` cannot change dates.
5. **Read cheaply.** Start with `get_today`, `get_at_risk`, or `get_project` with `depth: tasks`. Use `get_task` only when you need one task's description, to-dos and history.
6. **Never archive unless the user asks.** It is off for agents by default (`agents_can_archive`).

## Useful facts

- Dates are `YYYY-MM-DD`, calendar days, `end` inclusive. Give `start` and `end` together or not at all (undated tasks are fine while planning).
- Dependencies are finish-to-start: "A depends on B" means B must end before A starts. A task can also wait for a whole milestone.
- `health` is `on_track`, `late` (with days), `conflict` (starts before a dependency ends, or ends after its milestone's due), `unscheduled` or `done`.
- To-do `state` is `next` (do this one), `locked` (waits for another to-do), `open` or `done`.
- Errors come back as `isError` with a message that says what to change.
