# UI tokens and fonts


## Font
- **Family:** Inter (400, 500, 600), bundled with the app (no Google Fonts at runtime — local-first). Fallback `system-ui, -apple-system, sans-serif`.
- Features: `font-feature-settings: "cv11", "ss01"`; `font-variant-numeric: tabular-nums` on counts, percents, dates, timeline labels.
- Monospace (MCP token, ids in Settings only): `ui-monospace, "SF Mono", Menlo`, 12px.
- Base: 13px / 1.4, colour `text`.

## Type scale
| Token | Size / line-height | Weight | Tracking | Use |
|---|---|---|---|---|
| `display` | 22 / 28 | 600 | -0.01em | Home date header |
| `title` | 19 / 24 | 600 | -0.01em | Task pane title |
| `heading` | 17 / 22 | 600 | -0.01em | Project title, Settings, sheets |
| `section` | 13 / 18 | 600 | 0 | Panel headings |
| `body` | 13 / 18 | 400 · 500 | 0 | Rows, fields, buttons (500) |
| `small` | 12.5 / 16 | 400 | 0 | Secondary nav |
| `meta` | 12 / 16 | 400 · 500 | 0 | Meta lines, quiet buttons, bar labels (500) |
| `caption` | 11.5 / 15 | 400 | 0 | Chips, sub-lines, actor·time |
| `micro` | 11 / 14 | 500 · 600 | 0 | Counts, sidebar label, week labels, Today (600) |

No other sizes.

## Colour — surfaces
| Token | Light | Dark |
|---|---|---|
| `wall` | `#c9d0d6` | `#1b1d22` |
| `blobA` | `rgba(150,170,230,.75)` | `rgba(84,96,160,.55)` |
| `blobB` | `rgba(150,205,190,.70)` | `rgba(60,120,110,.45)` |
| `win` | `rgba(242,242,245,.58)` | `rgba(38,38,42,.55)` |
| `card` | `rgba(255,255,255,.92)` | `rgba(24,24,27,.92)` |
| `panel` | `rgba(0,0,0,.025)` | `rgba(255,255,255,.035)` |
| `panelSolid` | `#f8f8f9` | `#1e1e21` |
| `aside` | `rgba(0,0,0,.018)` | `rgba(255,255,255,.025)` |
| `sheet` | `rgba(255,255,255,.96)` | `rgba(36,36,40,.94)` |
| `menu` | `rgba(248,248,250,.80)` | `rgba(40,40,44,.78)` |
| `bar` (menu bar strip) | `rgba(246,246,248,.60)` | `rgba(30,30,34,.60)` |
| `scrim` | `rgba(20,20,30,.18)` | `rgba(0,0,0,.35)` |
| `pill` | `#ffffff` | `#3a3a3f` |

## Colour — lines, tints, text
| Token | Light | Dark |
|---|---|---|
| `edge` | `rgba(0,0,0,.10)` | `rgba(255,255,255,.10)` |
| `grid` | `rgba(0,0,0,.06)` | `rgba(255,255,255,.07)` |
| `field` | `rgba(0,0,0,.12)` | `rgba(255,255,255,.14)` |
| `sel` | `rgba(0,0,0,.06)` | `rgba(255,255,255,.08)` |
| `rowSel` | `rgba(0,0,0,.04)` | `rgba(255,255,255,.05)` |
| `weekend` | `rgba(0,0,0,.02)` | `rgba(255,255,255,.025)` |
| `track` | `rgba(0,0,0,.09)` | `rgba(255,255,255,.12)` |
| `arrow` | `rgba(0,0,0,.35)` | `rgba(255,255,255,.38)` |
| `text` | `#1d1d1f` | `#f2f2f4` |
| `text2` | `#66666b` | `#a8a8ae` |
| `text3` | `#6f6f74` | `#9a9aa0` |

`text3` is the contrast floor; don't add a lighter text tone.

## Colour — meaning
| Token | Light | Dark | Use |
|---|---|---|---|
| `accent` | `#2F6BF0` | `#2F6BF0` | Today, primary button, focus, progress, links (`#1F4FC0` hover) |
| `risk` | `#C8322B` | `#FF7A70` | Late, conflict, broken dependency |
| `ok` | `#1F8A4C` | `#5FC48A` | Done |
| `review` | `#7448D6` | `#B79CFF` | Needs review |
| `onAccent` | `#ffffff` | `#ffffff` | Text on accent / numbered plan badges |

Accent choices offered in Settings: `#2F6BF0` (blue, default) · `#111113` (graphite) · `#D9892B` (amber) · `#3FA796` (teal).

## Project palette
Assigned in order on project creation, user-changeable. Bar tint = colour at 16% (dark 22%); bar progress = 26% (dark 34%).

`#6E7CF5` indigo · `#D9892B` amber · `#3FA796` teal · `#B66AD0` orchid · `#7A8B99` slate · `#E0695A` coral · `#5A9BD5` sky · `#9AA04A` olive

(First five are from the design; last three extend it, to be checked against `risk`/`review` for confusion in Plan 2.)

## Spacing
2px base. Allowed: `2 4 6 8 10 12 14 16 18 20 22 24 28 32`. Common: row gap 10 · panel gap 12–14 · card padding 32 · pane padding 20.

## Size
| Token | Value | Use |
|---|---|---|
| `row` | 32 | Nav rows, buttons, dense list rows |
| `rowSm` | 30 | Secondary nav, title-menu button |
| `field` | 34 | Inputs |
| `control` | 26 | Segmented, quiet buttons, bars |
| `chip` | 22 | Chips, plan number badge |
| `iconBtn` | 24 | Icon buttons |
| `icon` | 16 / 14 / 11 | Nav / inline / chip check |
| `swatch` | 8 | Project swatch |
| `diamond` | 10 | Milestone |
| `sidebar` | 232 | Sidebar width |
| `pane` | 344 | Task pane width |
| `sheetW` | 560 | Sheet width |
| `day` | 16 | Timeline day width (Week) |
| `rowPitch` | 46 | Timeline row height |

Icons: 24-grid line icons, stroke 1.8 (2 at ≤14px), round caps and joins, `currentColor`.

## Radius
`2` diamond · `3` swatch · `5` checkbox · `6` chip, icon button, Today label · `7` control, bar · `8` row, button · `9` field · `10` toggle track · `12` card, panel · `16` window, sheet · `50%` knob.

## Shadow and edges
| Token | Value |
|---|---|
| `hairline` | `0 0 0 0.5px var(--gp-edge)` |
| `window` | `hairline, 0 30px 80px rgba(0,0,0,.28)` |
| `sheet` | `hairline, 0 24px 64px rgba(0,0,0,.24)` |
| `pill` | `0 1px 2px rgba(0,0,0,.08)` |
| `knob` | `0 1px 2px rgba(0,0,0,.25)` |
| `fieldRing` | `inset 0 0 0 1px var(--gp-field)` |
| `riskRing` | `0 0 0 1.5px var(--gp-risk)` |
| `focus` | `0 0 0 2px var(--gp-card), 0 0 0 4px rgba(47,107,240,.35)` |
| `diamondHalo` | `0 0 0 2px var(--gp-panelSolid)` |

## Blur
`win` `blur(40px) saturate(1.6)` · `sheet`/`menu`/`bar` `blur(30px)` · web-shell wall blobs 90–100px. In Tauri use native vibrancy for the window and CSS backdrop-filter only for sheets/menus. With `prefers-reduced-transparency`: no blur, `win` → `panelSolid`, `card` → opaque.

## Motion
| Token | Value | Use |
|---|---|---|
| `fast` | 160ms `cubic-bezier(.2,.8,.2,1)` | Hover, press, toggles |
| `pane` | 220ms same curve | Pane, sheet, bar move |
| `highlight` | 1200ms ease-out | Agent-change fade |
| `undo` | 6s | Undo window after soft delete |

## Layering (z-index)
`base 0` · `timeline overlay 10` (today line, arrows) · `pane 20` · `menu 40` · `sheet 50` (+ scrim) · `tooltip 60`.
