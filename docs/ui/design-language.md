# design language


## Character
**Quiet, glassy, exact.** Gameplan sits open all day next to real work, so it must calm rather than demand. It should feel like a native macOS utility (Notes, Reminders, Arc) — not a SaaS dashboard.

Three words to test any screen against:
1. **Quiet** — the plan is the loudest thing on screen; chrome recedes. No hero banners, no illustrations, no gradients on controls.
2. **Light** — translucent layers, thin hairlines, generous air. Nothing heavier than it needs to be.
3. **Exact** — aligned to a 2px grid, tabular numbers, crisp 0.5px edges. Precision signals the plan can be trusted.

Inspiration: Arc UI's gantt timeline for interaction patterns (bars, dependency arrows, today line). Borrowed ideas, never copied visuals or code.

## Materials (depth model)
Four stacked surfaces, back to front. Each layer is either translucent or near-opaque, never both at once:

| Layer | Token | Role |
|---|---|---|
| Wall | `wall` + two blurred colour blobs | The desktop behind the window (mockup only; in Tauri it's the real desktop through vibrancy) |
| Window | `win`, blur 40 + saturate 1.6 | Frosted glass; holds the sidebar directly |
| Card | `card` (92% opaque) | The content sheet, inset 8px from the window, radius 12 |
| Panel | `panel` (2.5–3.5% tint) | Groupings inside the card; tint, never border |

Floating things (sheets, menus, the menu bar dropdown) are a fifth layer: `sheet`/`menu`, blur 30, a deep shadow, radius 16.

Rules of the model:
- **Separate with tint, not lines.** Panels are a faint fill; hairlines (`edge`, 0.5px) only outline whole surfaces. Inner borders exist only on the task pane (`grid` 1px left border) and the timeline grid.
- **Shadow only for things that float.** The window and sheets cast shadow; nothing inside the card does, except selected segmented-control pills (`0 1px 2px`).
- **Selection is a tint.** Selected nav items, chips and fields use `sel`; never a coloured fill.

## Colour roles
Colour always means something. If a colour can be removed without losing information, remove it.

- **Neutrals** do 95% of the work: three text tones (`text`, `text2`, `text3`), tints, hairlines.
- **Accent** (`#2F6BF0` default, user-selectable) marks *now and primary*: the Today line, the one primary button per view, progress fill in the task pane, focus rings, links.
- **Project colours** identify a project everywhere it appears: the 8px rounded-square swatch, bar tint (16%/22% dark), bar progress fill (26%/34%), milestone diamonds. A project's colour is its name in colour form — never reused for state.
- **State colours** are reserved: `risk` (late, conflict, broken dependency), `ok` (done), `review` (needs your review — purple, so it never reads as accent or risk). They appear on text, rings, counts and checkmarks — never as large fills.

## Shape
- Everything is rounded; radius grows with size (chip 6–7 → row/button 8 → panel/card 12 → window/sheet 16).
- Swatches are rounded squares (radius 3), not circles — circles are reserved for avatars-that-don't-exist and toggle knobs.
- Milestones are 10px diamonds (rotated squares, radius 2) with a 2px halo of `panelSolid` so they cut cleanly through bars.
- Dependency arrows are thin (1.3px), orthogonal with rounded joins, small open chevron heads. Calm when healthy (`arrow`), `risk` when the dependency is violated.

## Type
One family: **Inter** (system-ui fallback). Hierarchy comes from size and weight (400/500/600), not from colour or caps. No all-caps labels, no letter-spaced eyebrows. Display sizes tighten slightly (`-0.01em`). Numbers are tabular wherever they line up.

## Motion
Motion explains change; it never performs.
- Default 160ms ease-out for hover/press/open; 220ms for panes and sheets.
- Things that the AI changed while you watch (via SSE) get a brief highlight: the row's `sel` tint fades out over 1.2s. No toasts for agent activity — Updates tab holds the history.
- Bars move to new dates with a 220ms slide, so a reschedule reads as movement, not a redraw.
- Respect `prefers-reduced-motion`: replace slides with instant changes, keep the highlight fade.

## Light and dark
Both are first-class and designed together (every mockup artboard has a `dark` prop). Dark is not inverted light: tints go up (panel 3.5% vs 2.5%), project fills go up (22/34% vs 16/26%), state colours shift lighter (`risk` #FF7A70 vs #C8322B). Default follows the system.

## What it is not
- Not playful: no emoji in UI chrome, no confetti, no mascots.
- Not dense like Jira: one idea per row, two lines max.
- Not explanatory: the UI never narrates itself (see [content-rules](content-rules.md)).
