import { randomBytes } from 'node:crypto';
import { getSettings } from '../domain/settings.js';
import type { Store } from '../domain/store.js';

/** 32 random bytes, base64url. */
export const newToken = (): string => randomBytes(32).toString('base64url');

/** The MCP token always exists: creates one when none is set. Returns it. */
export function ensureMcpToken(store: Store): string {
  const cur = getSettings(store.db).mcp_token;
  if (cur) return cur;
  const token = newToken();
  store.setSettings({ actor: 'you' }, { mcp_token: token });
  return token;
}

export interface ConnectInfo {
  endpoint: string;
  token: string;
  snippets: { claudeCode: string; codex: string; cursor: string; geminiCli: string; claudeDesktop: string; chatgpt: string; other: string };
}

/** Ready-to-copy connection snippets: each carries the endpoint and the token in its client's own header syntax. */
export function connectInfo(endpoint: string, token: string): ConnectInfo {
  const header = `Authorization: Bearer ${token}`;
  const json = (v: unknown): string => JSON.stringify(v, null, 2);
  return {
    endpoint,
    token,
    snippets: {
      claudeCode: `claude mcp add --transport http gameplan ${endpoint} --header "${header}"`,
      codex: `# ~/.codex/config.toml\n[mcp_servers.gameplan]\nurl = "${endpoint}"\nhttp_headers = { Authorization = "Bearer ${token}" }`,
      cursor: `// ~/.cursor/mcp.json\n${json({ mcpServers: { gameplan: { url: endpoint, headers: { Authorization: `Bearer ${token}` } } } })}`,
      geminiCli: `gemini mcp add --transport http --header "${header}" gameplan ${endpoint}`,
      claudeDesktop: `// claude_desktop_config.json (bridged with mcp-remote)\n${json({ mcpServers: { gameplan: { command: 'npx', args: ['-y', 'mcp-remote', endpoint, '--header', header] } } })}`,
      chatgpt: `ChatGPT connects from the internet, so expose only /mcp over HTTPS (for example a cloudflared tunnel), then add the public URL as a connector with this bearer token.\nURL: https://<your-host>/mcp\nAuthorization: Bearer ${token}`,
      other: `URL: ${endpoint}  (Streamable HTTP)\nHeader: ${header}`,
    },
  };
}
