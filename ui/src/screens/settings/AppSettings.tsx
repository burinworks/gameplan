import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '../../api/client';
import { useAgents, useBackup, useBackupNow, usePatchSettings, useSettings } from '../../api/hooks';
import type { PublicSettings } from '../../api/types';
import { errorLine, fmtAgo } from '../../lib/format';
import { applyTheme } from '../../theme';
import { Button, Row, Segmented, Toggle } from '../../ui';
import '../../ui/primitives.css';
import './settings.css';

const ENDPOINT = 'http://127.0.0.1:4747/mcp';
const ACCENTS = ['#2F6BF0', '#111113', '#D9892B', '#3FA796'];

type Client = 'claude-code' | 'codex' | 'cursor' | 'gemini' | 'desktop' | 'chatgpt' | 'other';

/** Connect snippets, copied from README.md "Connect an agent". */
const CONNECT: Record<Client, { label: string; note?: string; snippet: string }> = {
  'claude-code': { label: 'Claude Code', snippet: `claude mcp add --transport http gameplan ${ENDPOINT}` },
  codex: { label: 'Codex', snippet: `codex mcp add gameplan --url ${ENDPOINT}` },
  cursor: { label: 'Cursor', note: 'Add to ~/.cursor/mcp.json', snippet: `{ "mcpServers": { "gameplan": { "url": "${ENDPOINT}" } } }` },
  gemini: { label: 'Gemini CLI', snippet: `gemini mcp add --transport http gameplan ${ENDPOINT}` },
  desktop: {
    label: 'Claude Desktop',
    note: 'In claude_desktop_config.json, bridged with mcp-remote',
    snippet: `{ "mcpServers": { "gameplan": { "command": "npx", "args": ["-y", "mcp-remote", "${ENDPOINT}"] } } }`,
  },
  chatgpt: {
    label: 'ChatGPT',
    note: 'Needs an HTTPS tunnel and an MCP token',
    snippet: `ingress:
  - hostname: gameplan.example.com
    path: ^/mcp
    service: http://127.0.0.1:4747
  - service: http_status:404`,
  },
  other: { label: 'Other', snippet: ENDPOINT },
};
const CLIENTS = (Object.keys(CONNECT) as Client[]).map((value) => ({ value, label: CONNECT[value].label }));

function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const copy = (text: string) => void navigator.clipboard?.writeText(text).catch(() => undefined);

function SettingRow({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="gp-set__row">
      <span className="gp-set__label" dir="auto">
        {label}
      </span>
      <span className="gp-set__control">
        {error && (
          <span className="gp-set__error" role="alert" dir="auto">
            {error}
          </span>
        )}
        {children}
      </span>
    </div>
  );
}

function Mono({ text }: { text: string }) {
  return (
    <div className="gp-set__mono">
      <pre className="gp-set__code">{text}</pre>
      <Button variant="quiet" label="Copy" onClick={() => copy(text)} />
    </div>
  );
}

export function AppSettings() {
  const settings = useSettings();
  const patch = usePatchSettings();
  const qc = useQueryClient();
  const agents = useAgents();
  const backup = useBackup();
  const backupNow = useBackupNow();
  const [client, setClient] = useState<Client>('claude-code');
  const [shownToken, setShownToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const s = settings.data;
  if (!s) return <section className="gp-set" aria-label="Settings" aria-busy="true" />;

  const save = (key: string, body: Record<string, unknown>, after?: () => void) => {
    setErrors((e) => ({ ...e, [key]: '' }));
    patch.mutate(body, {
      onSuccess: (fresh) => {
        qc.setQueryData(['settings'], fresh);
        after?.();
      },
      onError: (e) => setErrors((prev) => ({ ...prev, [key]: errorLine(e instanceof ApiError ? e : { code: 'internal', message: e.message }) })),
    });
  };
  const set = <K extends keyof PublicSettings>(key: K, value: PublicSettings[K]) => save(key, { [key]: value });
  const toggle = (key: keyof PublicSettings, label: string) => (
    <Toggle checked={s[key] as boolean} label={label} onChange={(v) => set(key, v as never)} />
  );
  const theme = (over: Partial<{ appearance: 'system' | 'light' | 'dark'; accent: string }>) =>
    applyTheme({ appearance: (s.appearance as 'system' | 'light' | 'dark') ?? 'system', accent: s.accent, ...over });

  const generate = () => {
    const token = newToken();
    save('mcp_token', { mcp_token: token }, () => setShownToken(token));
  };

  const zones = (() => {
    const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
    return all.includes(s.time_zone) ? all : [s.time_zone, ...all];
  })();
  const now = new Date();
  const last = backup.data?.last ?? null;
  const c = CONNECT[client];

  return (
    <section className="gp-set" aria-label="Settings">
      <h1 className="gp-set__h1">Settings</h1>

      <section className="gp-set__section" aria-label="General">
        <h2 className="gp-set__h2">General</h2>
        <SettingRow label="Appearance" error={errors.appearance}>
          <Segmented
            label="Appearance"
            value={s.appearance as 'system' | 'light' | 'dark'}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(v) => {
              theme({ appearance: v });
              set('appearance', v);
            }}
          />
        </SettingRow>
        <SettingRow label="Accent" error={errors.accent}>
          <span className="gp-set__swatches" role="radiogroup" aria-label="Accent">
            {ACCENTS.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={s.accent.toLowerCase() === a.toLowerCase()}
                aria-label={a}
                className="gp-set__accent"
                style={{ background: a }}
                onClick={() => {
                  theme({ accent: a });
                  set('accent', a);
                }}
              />
            ))}
          </span>
        </SettingRow>
        <SettingRow label="Week starts" error={errors.week_start}>
          <Segmented
            label="Week starts"
            value={s.week_start as 'mon' | 'sun'}
            options={[
              { value: 'mon', label: 'Monday' },
              { value: 'sun', label: 'Sunday' },
            ]}
            onChange={(v) => set('week_start', v)}
          />
        </SettingRow>
        <SettingRow label="Time zone" error={errors.time_zone}>
          <select className="gp-set__select" aria-label="Time zone" value={s.time_zone} onChange={(e) => set('time_zone', e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Open at login" error={errors.open_at_login}>
          {toggle('open_at_login', 'Open at login')}
        </SettingRow>
        <SettingRow label="Menu bar icon" error={errors.menu_bar_icon}>
          {toggle('menu_bar_icon', 'Menu bar icon')}
        </SettingRow>
      </section>

      <section className="gp-set__section" aria-label="Home">
        <h2 className="gp-set__h2">Home</h2>
        <SettingRow label="Rescheduled window" error={errors.rescheduled_days}>
          <Segmented
            label="Rescheduled window"
            value={String(s.rescheduled_days) as '7' | '14' | '30'}
            options={[
              { value: '7', label: '7 days' },
              { value: '14', label: '14 days' },
              { value: '30', label: '30 days' },
            ]}
            onChange={(v) => set('rescheduled_days', Number(v))}
          />
        </SettingRow>
        <SettingRow label="Show paused projects" error={errors.show_paused}>
          {toggle('show_paused', 'Show paused projects')}
        </SettingRow>
        <SettingRow label="Weekends on timelines" error={errors.show_weekends}>
          {toggle('show_weekends', 'Weekends on timelines')}
        </SettingRow>
      </section>

      <section className="gp-set__section" aria-label="Agents and MCP">
        <h2 className="gp-set__h2">Agents &amp; MCP</h2>
        <SettingRow label="Endpoint">
          <span className="gp-set__endpoint">
            <code className="gp-set__inline">{ENDPOINT}</code>
            <Button variant="quiet" label="Copy" title="Copy endpoint" onClick={() => copy(ENDPOINT)} />
          </span>
        </SettingRow>
        <div className="gp-set__connect">
          <Segmented label="Connect" value={client} options={CLIENTS} onChange={setClient} />
          {c.note && (
            <p className="gp-set__note" dir="auto">
              {c.note}
            </p>
          )}
          <Mono text={c.snippet} />
        </div>
        <SettingRow label="AI work needs my review" error={errors.agents_need_review}>
          {toggle('agents_need_review', 'AI work needs my review')}
        </SettingRow>
        <SettingRow label="MCP token" error={errors.mcp_token}>
          {s.mcp_token_set ? (
            <span className="gp-set__token">
              <span className="gp-set__status">Token set</span>
              <Button variant="quiet" label="Replace" onClick={generate} />
              <Button
                variant="quiet"
                label="Remove"
                onClick={() => save('mcp_token', { mcp_token: null }, () => setShownToken(null))}
              />
            </span>
          ) : (
            <Button variant="secondary" label="Generate" onClick={generate} />
          )}
        </SettingRow>
        {shownToken && (
          <div className="gp-set__connect">
            <Mono text={shownToken} />
          </div>
        )}
        <div className="gp-set__agents">
          <h3 className="gp-set__h3">Connected agents</h3>
          {(agents.data ?? []).map((a) => (
            <Row
              key={a.name}
              title={a.name}
              trailing={
                <>
                  <span>{fmtAgo(a.lastSeen, now)}</span>
                  <span>{`${a.calls} ${a.calls === 1 ? 'call' : 'calls'}`}</span>
                </>
              }
            />
          ))}
          {agents.data?.length === 0 && <p className="gp-set__empty">No agents connected</p>}
        </div>
        <SettingRow label="Agents must give a reason to move dates" error={errors.agents_require_reason}>
          {toggle('agents_require_reason', 'Agents must give a reason to move dates')}
        </SettingRow>
        <SettingRow label="Agents can archive" error={errors.agents_can_archive}>
          {toggle('agents_can_archive', 'Agents can archive')}
        </SettingRow>
        <SettingRow label="Agents can create projects" error={errors.agents_can_create_projects}>
          {toggle('agents_can_create_projects', 'Agents can create projects')}
        </SettingRow>
      </section>

      <section className="gp-set__section" aria-label="Data">
        <h2 className="gp-set__h2">Data</h2>
        <SettingRow label="Backups">
          <span className="gp-set__token">
            <span className="gp-set__status">{last ? fmtAgo(last.at, now) : 'Never'}</span>
            <Button variant="secondary" label="Back up now" onClick={() => backupNow.mutate(undefined, { onSuccess: () => void backup.refetch() })} />
          </span>
        </SettingRow>
        <SettingRow label="Export">
          <span className="gp-set__token">
            <a className="gp-set__link" href="/api/export?format=json" download>
              Export JSON
            </a>
            <a className="gp-set__link" href="/api/export?format=md" download>
              Export Markdown
            </a>
          </span>
        </SettingRow>
      </section>
    </section>
  );
}
