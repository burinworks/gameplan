# content rules


## The first rule
**No explanatory subtitles.** A heading names the thing; it never describes the action.
- ✗ "New task" + "Create a new task here or ask Claude Code!"
- ✓ "New task"
If a screen needs a sentence to be understood, fix the screen.

## Voice
- Plain, calm, brief. Write like a good colleague's sticky note.
- Second person only where needed ("Pick up where you left off"); the app never says "I" or "we".
- No exclamation marks, no emoji, no jokes, no "Oops", no "Awesome".
- Don't praise or nag. Done shows a check, not "Great job". Late shows "7 days late", not "You're falling behind".

## Casing and punctuation
- Sentence case everywhere: "Needs review", "Paused & archived", "Plan my day".
- No full stops in labels, headings, buttons, chips. Full stops only in multi-sentence text (resume notes, descriptions).
- Ellipsis (…, one character) only for placeholders and for actions that open something that needs more input ("Settings…" in the menu bar).
- `&` allowed in short nav labels; "and" elsewhere.
- Separators: ` · ` (middle dot with spaces) between meta items; ` → ` for change ("Nov 28 → Dec 3"); `↳ ` to prefix the next step / resume note.

## Labels
- Buttons are verbs, 1–3 words: "Approve", "Send back", "Create project", "Restore", "Revert".
- Nav and headings are nouns: "Home", "Inbox", "Updates", "Done this week".
- Never more than 3 words in a button, 4 in a heading.
- Same thing, same word, everywhere:

| Use | Never |
|---|---|
| to-do | microtask, subtask, checklist item |
| task, milestone, project | ticket, epic, story, card |
| area | team, label, category |
| executor: Me · AI · Together | assignee, owner |
| needs review / review | approval, QA |
| Where I left off | handoff, context, notes |
| Inbox / capture | backlog, quick add |
| archive / restore | delete (when it's soft) |
| agent | bot, assistant (in UI); use the agent's name when known |

## Actors
- The human is **You**. Agents are shown by client name: "Claude Code", "Codex", "Cursor", "ChatGPT" — never "AI" generically when the name is known, never "Claude" for a non-Claude agent.
- Actor + time format: `Codex · 2h`, `You · yesterday`.

## Dates and numbers
- Dates only, no times. Short: `Nov 27`; with weekday in headers: `Friday, 27 November`; range: `Nov 28 → Dec 3`; year only when not the current year: `Jan 4, 2027`.
- Relative time for activity: `now`, `5m`, `2h`, `yesterday`, `3d`, then the date.
- Lateness: `1 day late`, `7 days late`. Due: `due today`, `due tomorrow`, then the date.
- Percent with no space: `38%`. Counts are bare numbers after the heading ("At risk 2"), no brackets.
- Progress as to-dos: `3/4 to-dos`.
- Tabular numerals wherever numbers stack.
- "When" hints in My plan are the user's own words, lowercase: "after standup", "before lunch".

## Empty states
One line, `text3`, no illustration, no call-to-action button (the primary action is already on screen).
- Inbox: "Inbox is empty"
- Needs review: "Nothing to review"
- At risk: "Nothing at risk"
- My plan (not planned): show the "Plan my day" button only.
- Search: "No matches for "<query>""

## Errors and conflicts
Say what happened and what to do, in one line. No error codes in the UI (they go to logs).
- "Changed since — reload to see the latest" (revert conflict)
- "Would create a loop" (dependency cycle)
- "Agents can't change dates — ask in chat or drag it yourself" only in Updates when an agent call was refused.
- Can't reach the engine: "Gameplan engine isn't running" + "Restart".

## Agent-written text
Agents write titles, to-dos, resume notes and descriptions. The UI shows them verbatim (descriptions are free-form) but enforces limits: resume note ≤200 chars, one line; titles truncate with ellipsis, full text on hover/pane. Agent text never appears in a heading the app owns.
