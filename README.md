# Gameplan

A local engine for the game plan of every project: Projects › Milestones › Tasks › To-dos, with areas, dependencies, attachments and a full activity log. It serves a JSON + SSE API for the UI and an MCP endpoint any AI agent can use to keep the plan in sync with the work.

- `http://127.0.0.1:4747/api/*` — JSON for the UI
- `http://127.0.0.1:4747/events` — server-sent events, one `change` per write
- `http://127.0.0.1:4747/mcp` — MCP (Streamable HTTP), 24 tools

Data lives in one SQLite file; daily JSON snapshots (30 kept) go to `backups/` next to it.

## Run

Requires Node ≥ 24.

```bash
npm install
```

```bash
npm run dev
```

Always-on (launchd, starts at login, restarts on crash):

```bash
scripts/install-launchd.sh
```

Remove it with `scripts/install-launchd.sh --uninstall`. Logs: `~/Library/Logs/gameplan.log`.

| Variable | Default |
|---|---|
| `GAMEPLAN_PORT` | `4747` |
| `GAMEPLAN_DB` | `~/Library/Application Support/Gameplan/gameplan.db` |

## Connect an agent

Claude Code:

```bash
claude mcp add --transport http gameplan http://127.0.0.1:4747/mcp
```

Codex:

```bash
codex mcp add gameplan --url http://127.0.0.1:4747/mcp
```

Gemini CLI:

```bash
gemini mcp add --transport http gameplan http://127.0.0.1:4747/mcp
```

Cursor — add to `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "gameplan": { "url": "http://127.0.0.1:4747/mcp" } } }
```

Any other client: point it at `http://127.0.0.1:4747/mcp` (Streamable HTTP). The server sends its usage rules on connect; the same rules are in [docs/agent-instructions.md](docs/agent-instructions.md) for agents that load instructions from a file. Connected clients and their last call show in `GET /api/agents`.

Agent policy is in app settings (`PATCH /api/settings`): `agents_require_reason` (on), `agents_can_archive` (off), `agents_can_create_projects` (on).

## Develop

```bash
npm test
```

```bash
npm run typecheck
```

Schema changes go in a new `migrations/NNN_name.sql`; never edit an applied one.
