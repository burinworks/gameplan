import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { StreamableHTTPTransport } from '@hono/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Hono } from 'hono';
import type { Clock } from '../clock.js';
import type { Store } from '../domain/store.js';
import { INSTRUCTIONS, registerTools } from './tools.js';

interface Session {
  transport: StreamableHTTPTransport;
  server: McpServer;
  lastUsed: number;
}

const IDLE_MS = 6 * 60 * 60 * 1000;

/** Mounts MCP Streamable HTTP at /mcp. One McpServer per session, so the actor is the client's own name. */
export function mountMcp(app: Hono, deps: { store: Store; db: DatabaseSync; clock: Clock; version?: string }): () => void {
  const sessions = new Map<string, Session>();

  const sweep = setInterval(() => {
    const cutoff = Date.now() - IDLE_MS;
    for (const [id, s] of sessions)
      if (s.lastUsed < cutoff) {
        sessions.delete(id);
        void s.transport.close().catch(() => {});
      }
  }, 60_000);
  sweep.unref();

  app.all('/mcp', async (c) => {
    const sid = c.req.header('mcp-session-id');
    if (sid) {
      const s = sessions.get(sid);
      if (!s) return c.json({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found — re-initialize' }, id: null }, 404);
      s.lastUsed = Date.now();
      return s.transport.handleRequest(c);
    }
    const server = new McpServer({ name: 'gameplan', version: deps.version ?? '0.1.0' }, { instructions: INSTRUCTIONS });
    registerTools(server, { ...deps, actor: () => `ai:${server.server.getClientVersion()?.name || 'unknown'}` });
    const transport: StreamableHTTPTransport = new StreamableHTTPTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, server, lastUsed: Date.now() });
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    await server.connect(transport);
    return transport.handleRequest(c);
  });

  return () => {
    clearInterval(sweep);
    for (const s of sessions.values()) void s.transport.close().catch(() => {});
    sessions.clear();
  };
}
