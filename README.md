# Gameplan

A local engine for the game plan of every project: Projects › Milestones › Tasks › To-dos, with areas, dependencies, attachments and a full activity log. Built for people who work with AI: agent work goes to your review before it counts as done, every task keeps a one-line "where I left off" note, and Home shows your day plan (up to 3 tasks), an inbox for loose items and what got done this week. It serves a JSON + SSE API for the UI and an MCP endpoint any AI agent can use to keep the plan in sync with the work.

- `http://127.0.0.1:4747/api/*` — JSON for the UI
- `http://127.0.0.1:4747/events` — server-sent events, one `change` per write
- `http://127.0.0.1:4747/mcp` — MCP (Streamable HTTP), 30 tools

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

## UI

Build once with `npm run build`, then `npm run dev` serves the app at `http://127.0.0.1:4747/`.

For UI work run `npm run dev` and `npm run dev:ui` together and open `http://localhost:5173` (Vite proxies `/api` and `/events` to the engine).

The engine only answers local hosts (`127.0.0.1`, `localhost`, `[::1]`) and rejects cross-site browser writes; `/mcp` is guarded by the optional token instead.

End-to-end smoke tests (Chromium against a seeded temporary engine, light and dark): `npm run e2e`. Screenshots land in `test-results/screens/`. The first run needs `npx playwright install chromium`.

## Connect an agent

Gameplan creates an MCP token the first time it starts, and every connection command includes it. In the app, App settings › Agents & MCP shows each command ready to copy (`GET /api/mcp/connect` returns the same snippets). "Rotate token" (`POST /api/mcp/token/rotate`) issues a new one; agents then need the new command. The snippets below show the shape; `<token>` is yours.

Claude Code:

```bash
claude mcp add --transport http gameplan http://127.0.0.1:4747/mcp --header "Authorization: Bearer <token>"
```

Codex — in `~/.codex/config.toml`:

```toml
[mcp_servers.gameplan]
url = "http://127.0.0.1:4747/mcp"
http_headers = { Authorization = "Bearer <token>" }
```

Gemini CLI:

```bash
gemini mcp add --transport http --header "Authorization: Bearer <token>" gameplan http://127.0.0.1:4747/mcp
```

Cursor — add to `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "gameplan": { "url": "http://127.0.0.1:4747/mcp", "headers": { "Authorization": "Bearer <token>" } } } }
```

Claude Desktop — its config file takes local (stdio) servers, so bridge with `mcp-remote` in `claude_desktop_config.json`:

```json
{ "mcpServers": { "gameplan": { "command": "npx", "args": ["-y", "mcp-remote", "http://127.0.0.1:4747/mcp", "--header", "Authorization: Bearer <token>"] } } }
```

ChatGPT — it connects from the internet, so a local endpoint isn't reachable. Expose only `/mcp` over HTTPS, for example a cloudflared tunnel with a path-restricted ingress rule:

```yaml
ingress:
  - hostname: gameplan.example.com
    path: ^/mcp
    service: http://127.0.0.1:4747
  - service: http_status:404
```

Then add `https://gameplan.example.com/mcp` as a connector, with the token as a bearer token.

Any other client: point it at `http://127.0.0.1:4747/mcp` (Streamable HTTP) with the `Authorization: Bearer <token>` header. The server sends its usage rules on connect; the same rules are in [docs/agent-instructions.md](docs/agent-instructions.md) for agents that load instructions from a file. Connected clients and their last call show in `GET /api/agents`.

Port 4747 taken? Set the `port` setting (1024–65535, `PATCH /api/settings`) and restart; `GAMEPLAN_PORT` overrides it. `GET /api/info` reports the `port` actually listening and the `configuredPort`.

Agent policy is in app settings (`PATCH /api/settings`): `agents_need_review` (on: agent-finished tasks wait for your review), `agents_require_reason` (on), `agents_can_archive` (off), `agents_can_create_projects` (on). `/mcp` requires `Authorization: Bearer <token>`; `GET /api/settings` only reports `mcp_token_set`.

## Develop

```bash
npm test
```

```bash
npm run typecheck
```

Schema changes go in a new `migrations/NNN_name.sql`; never edit an applied one.
