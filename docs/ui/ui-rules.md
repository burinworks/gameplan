# UI rules


## Layout
- **Window:** radius 16, `win` glass, edge hairline + window shadow. Min size 1080×680; designed at 1440×900.
- **Sidebar:** 232px fixed, padding 16/10, sits on the glass (no card). Order, top to bottom: traffic lights (22px gap below) · Home · Search · Inbox (count) · `Projects` label + `+` · project rows (expanded project shows its milestones nested below it, indented 18px) · Paused & archived (count) · spacer · Settings. Nothing else goes in the sidebar.
- **Card:** fills the rest, inset 8px top/right/bottom, radius 12. Content padding 24/32 top, 32 sides.
- **Task pane:** 344px on the right edge of the card, `aside` tint, 1px `grid` left border, padding 18/20, gap 14. It opens for: a task, a new task, a new milestone. It never stacks; opening another replaces it.
- **Sheets** (centered, 560px wide, radius 16) only for: New project, confirmations that destroy data. Everything else is inline or in the pane.
- **Grid:** 2px base; standard gaps 2 · 4 · 6 · 8 · 10 · 12 · 14 · 16 · 18. Rows 32 (nav), 30 (secondary nav), 26 (controls), 22 (chips).

## Screens and their single job
| Screen | Job | Primary action |
|---|---|---|
| Home | What do I do today | Plan my day |
| Project › Timeline | When and in what order | New task |
| Project › List | Everything, sortable | New task |
| Project › Updates | What changed and who did it | Revert |
| Inbox | Empty it | Triage each item |
| Review | Approve or send back AI work | Approve |
| Paused & archived | Bring things back | Restore |
| Settings (app) | Configure once | — |
| Menu bar menu | Capture and glance | Enter to capture |

One primary (accent-filled) button per view, at most.

## Components

**Nav row** — 32px, radius 8, 16px icon, gap 10, padding 0/10. Default `text2`; current = `sel` fill + `text` + weight 500. Trailing count 11px `text3`, tabular.

**Project swatch** — 8×8, radius 3, project colour. Always left of a project or task name; never alone.

**Buttons**
- Primary: 32px, radius 8, padding 0/14, accent fill, white 500.
- Secondary: 32px, radius 8, `pill` fill + edge hairline, 500.
- Quiet: 26px, radius 7, padding 0/10, inset 1px `field` ring, `text2` 12px 500 (e.g. "Plan my day").
- Icon: 24×24, radius 6, 14px icon, `text2`. Must have `aria-label`.

**Segmented control** — container `sel`, options 26px radius 7 padding 0/12; selected option = `pill` + `0 1px 2px` shadow + 500. Used for tabs (Timeline · List · Updates), zoom (Week · Month), and settings choices. Tabs are never a settings entry — project settings live in the sidebar `…` menu and the title menu.

**Toggle** — 34×20 track radius 10, 16px white knob, 2px inset, knob shadow `0 1px 2px rgba(0,0,0,.25)`. Off = `track`, on = accent. `role="switch"`.

**Field** — 34px, radius 9, `sel` fill, no border; focus = 2px accent ring at 35% alpha. Placeholder `text3`, ends with an ellipsis ("Capture…").

**Chip** — 22–24px, radius 6–7, padding 0/8–9, `sel` fill, 11.5–12px. Used for "when" hints, done-this-week items, executor and area labels.

**Count** — inline after a heading, 500, coloured by meaning: `review` (Needs review), `risk` (At risk), `ok` (Done this week), `text3` (neutral).

**Panel** — radius 12, `panel` tint, padding 12–14/8. Heading 13px 600 at padding 0/10. Rows inside pad 0/10 so text aligns with the heading.

**Two-line row** — title (13px 500, ellipsis) + meta line (12px `text2`, ellipsis, often prefixed `↳ `). Never three lines.

**Checkbox (to-do)** — 16px, radius 5. Done = `ok` check. Locked (blocked by previous to-do) = `text3` outline at 50% + not focusable. In review, checkboxes use `review`.

**Progress** — task pane: 4px bar radius 2, `track` + accent fill. Bars on the timeline show progress as a darker fill of the project colour from the left.

## Timeline
- Day width 16px (Week zoom); weeks marked by 1px `grid` lines with 11px `text3` labels at top 13px.
- Weekends get `weekend` tint columns.
- Bar: 26px, radius 7, row pitch 46px (bar centred). Label 12px 500 inside the bar, left padding 9. Width = days × 16 − 8 (the gap is part of the bar's length).
- Late/conflict bar: 1.5px `risk` ring (box-shadow, no layout shift).
- Milestone: 10px diamond at the bar's end, halo `panelSolid`.
- Dependency: orthogonal path from end of predecessor to start of successor, 1.3px, rounded joins, 7px open chevron; `arrow` normally, `risk` when successor starts before predecessor ends.
- Today: 1.5px accent line from top 34; accent label "Today" 20px radius 6 white 11px 600 centred on it.
- Drag a bar = move; drag an edge = resize; snapping to whole days. Only you can drag — agents change dates through MCP.

## States every component handles
default · hover (`sel` tint, 160ms) · pressed (`sel` ×1.5) · focus-visible (2px accent ring, 2px offset) · disabled (40% opacity, no hover) · selected · loading (skeleton tint `sel`, no spinners under 400ms) · empty (one line, see [content-rules](content-rules.md)) · changed-by-agent (highlight fade).

## Interaction
- Keyboard first: `⌘N` new task (in project) · `⌘⇧N` new project · `⌘K` search · `⌘1–3` tabs · `Esc` closes pane/sheet · `Space` toggles the focused to-do · `↑↓` moves through rows. No global shortcut.
- Edits save on blur/Enter; no Save buttons except in sheets.
- Destructive actions are soft (archive/delete with Undo in place for 6s); permanent delete needs a sheet.
- Agent writes appear live via SSE; never steal focus or move the row the user is editing.
- Capture field (Home header + menu bar menu): Enter sends to Inbox and clears; the field keeps focus; the menu stays open.

## Accessibility
- Text contrast ≥ 4.5:1 on its real surface in both themes (`text3` is the floor — never lighter).
- State is never colour-only: risk adds text ("7 days late"), review adds a count/label, done adds a check.
- Hit targets ≥ 24×24.
- Every icon-only control has `aria-label`; decorative icons `aria-hidden`.
- Titles use `dir="auto"` — Hebrew and English mix in the same list.
- Landmarks: `nav` (sidebar), `main` (card), `aside` (task pane), `role="dialog"` + `aria-modal` (sheets).
- Honour `prefers-reduced-motion`, `prefers-reduced-transparency` (swap glass for solid `panelSolid`/`card`), and `prefers-contrast` (edge alpha ×2).
