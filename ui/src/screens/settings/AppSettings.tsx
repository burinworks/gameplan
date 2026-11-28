import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '../../api/client';
import { useAgents, useBackup, useBackupNow, useInfo, usePatchSettings, useSettings } from '../../api/hooks';
import type { PublicSettings } from '../../api/types';
import { errorLine, fmtAgo } from '../../lib/format';
import { applyTheme } from '../../theme';
import { useDraft } from '../../lib/draft';
import { Button, Field, Page, Segmented, Toggle } from '../../ui';
import '../../ui/primitives.css';
import './settings.css';

const ENDPOINT = 'http://127.0.0.1:4747/mcp';
const ACCENTS = [
  { name: 'Blue', hex: '#2F6BF0' },
  { name: 'Graphite', hex: '#3a3a3f' },
  { name: 'Amber', hex: '#D9892B' },
  { name: 'Teal', hex: '#3FA796' },
  { name: 'Orchid', hex: '#B66AD0' },
];

/** Folder holding the database file, with the user's home directory shown as ~. */
export function dbFolder(dbPath: string): string {
  const dir = dbPath.replace(/[\\/][^\\/]*$/, '') || dbPath;
  return dir.replace(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)(?=[\\/]|$)/, '~');
}

type Client = 'claude-code' | 'codex' | 'cursor' | 'gemini' | 'desktop' | 'chatgpt' | 'other';

/** Connect snippets, copied from README.md "Connect an agent". */
const CONNECT: Record<Client, { label: string; note?: string; snippet: string }> = {
  'claude-code': { label: 'Claude Code', snippet: `claude mcp add --transport http gameplan ${ENDPOINT}` },
  codex: { label: 'Codex', snippet: `codex mcp add gameplan --url ${ENDPOINT}` },
  cursor: { label: 'Cursor', snippet: `{ "mcpServers": { "gameplan": { "url": "${ENDPOINT}" } } }` },
  gemini: { label: 'Gemini CLI', snippet: `gemini mcp add --transport http gameplan ${ENDPOINT}` },
  desktop: {
    label: 'Claude Desktop',
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

/** Label cell plus control cell of a panel grid. */
function SettingRow({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <>
      <span className="gp-set__label" dir="auto">
        {label}
      </span>
      <div className="gp-set__control">
        {error && (
          <span className="gp-set__error" role="alert" dir="auto">
            {error}
          </span>
        )}
        {children}
      </div>
    </>
  );
}

function SetPanel({ title, aside, label, children }: { title: string; aside?: ReactNode; label?: string; children: ReactNode }) {
  return (
    <section className="gp-set__panel" aria-label={label ?? title}>
      <div className="gp-set__head">
        <h2 className="gp-set__h2">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Mono({ text }: { text: string }) {
  return (
    <div className={`gp-set__mono${text.includes('\n') ? ' is-multi' : ''}`}>
      <pre className="gp-set__code">{text}</pre>
      <button type="button" className="gp-set__copy" onClick={() => copy(text)}>
        Copy
      </button>
    </div>
  );
}

/** Text setting that saves on blur or Enter; a refused save restores the server value. */
function TextSetting({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => Promise<unknown> }) {
  const d = useDraft(value, (v) => {
    const t = v.trim();
    return t && t !== value ? onSave(t) : Promise.reject(new Error('nothing to save'));
  });
  return (
    <div className="gp-set__text" onBlur={d.bind.onBlur} onFocus={d.bind.onFocus} onKeyDown={(e) => !e.nativeEvent.isComposing && d.bind.onKeyDown(e)}>
      <Field label={label} value={d.value} onChange={d.set} />
    </div>
  );
}

/** "2 min ago" style, longer than the shared short form. */
function agoLong(iso: string, now: Date): string {
  const min = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`;
  const short = fmtAgo(iso, now);
  return short === 'yesterday' ? 'Yesterday' : short;
}

export function AppSettings() {
  const settings = useSettings();
  const patch = usePatchSettings({ inlineError: true });
  const qc = useQueryClient();
  const agents = useAgents();
  const backup = useBackup();
  const backupNow = useBackupNow();
  const info = useInfo();
  const [client, setClient] = useState<Client>('claude-code');
  const [shownToken, setShownToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const s = settings.data;
  if (!s) return <section className="gp-page" aria-label="Settings" aria-busy="true" />;

  /** Resolves true when the write went through, false when it was refused (the error is shown inline). */
  const save = (key: string, body: Record<string, unknown>, after?: () => void): Promise<boolean> => {
    setErrors((e) => ({ ...e, [key]: '' }));
    return patch.mutateAsync(body).then(
      (fresh) => {
        qc.setQueryData(['settings'], fresh);
        after?.();
        return true;
      },
      (e: Error) => {
        applyTheme({ appearance: (s.appearance as 'system' | 'light' | 'dark') ?? 'system', accent: s.accent });
        setErrors((prev) => ({ ...prev, [key]: errorLine(e instanceof ApiError ? e : { code: 'internal', message: e.message }) }));
        return false;
      },
    );
  };
  const set = <K extends keyof PublicSettings>(key: K, value: PublicSettings[K]) => void save(key, { [key]: value });
  const toggle = (key: keyof PublicSettings, label: string) => (
    <Toggle checked={s[key] as boolean} label={label} onChange={(v) => set(key, v as never)} />
  );
  const theme = (over: Partial<{ appearance: 'system' | 'light' | 'dark'; accent: string }>) =>
    applyTheme({ appearance: (s.appearance as 'system' | 'light' | 'dark') ?? 'system', accent: s.accent, ...over });

  const generate = () => {
    const token = newToken();
    void save('mcp_token', { mcp_token: token }, () => setShownToken(token));
  };

  const now = new Date();
  const last = backup.data?.last ?? null;
  const c = CONNECT[client];

  return (
    <Page title="Settings" label="Settings" roomy padded bodyClassName="gp-set">
      <div className="gp-set__cols">
        <div className="gp-set__col">
          <SetPanel title="General">
            <div className="gp-set__grid">
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
                      key={a.hex}
                      type="button"
                      role="radio"
                      aria-checked={s.accent.toLowerCase() === a.hex.toLowerCase()}
                      aria-label={a.name}
                      title={a.name}
                      className="gp-set__accent"
                      style={{ background: a.hex, color: a.hex }}
                      onClick={() => {
                        theme({ accent: a.hex });
                        set('accent', a.hex);
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
                <TextSetting
                  label="Time zone"
                  value={s.time_zone}
                  onSave={(v) => save('time_zone', { time_zone: v }).then((ok) => (ok ? true : Promise.reject(new Error('refused'))))}
                />
              </SettingRow>
              <SettingRow label="Open at login" error={errors.open_at_login}>
                {toggle('open_at_login', 'Open at login')}
              </SettingRow>
              <SettingRow label="Menu bar icon" error={errors.menu_bar_icon}>
                {toggle('menu_bar_icon', 'Menu bar icon')}
              </SettingRow>
            </div>
          </SetPanel>

          <SetPanel title="Home">
            <div className="gp-set__grid">
              <SettingRow label="Rescheduled" error={errors.rescheduled_days}>
                <Segmented
                  label="Rescheduled"
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
              <SettingRow label="Show weekends on timelines" error={errors.show_weekends}>
                {toggle('show_weekends', 'Show weekends on timelines')}
              </SettingRow>
            </div>
          </SetPanel>
        </div>

        <div className="gp-set__col">
          <SetPanel
            title="Agents & MCP"
            label="Agents and MCP"
            aside={
              <span className="gp-set__running">
                <span className="gp-set__dot" aria-hidden="true" />
                Running
              </span>
            }
          >
            <div className="gp-set__grid gp-set__grid--narrow">
              <SettingRow label="Endpoint">
                <Mono text={ENDPOINT} />
              </SettingRow>
              <SettingRow label="Connect">
                <div className="gp-set__connect">
                  <Segmented label="Connect" value={client} options={CLIENTS} onChange={setClient} />
                </div>
              </SettingRow>
              <span />
              <div className="gp-set__control">
                {c.note && (
                  <p className="gp-set__note" dir="auto">
                    {c.note}
                  </p>
                )}
                <Mono text={c.snippet} />
              </div>
              <SettingRow label="MCP token" error={errors.mcp_token}>
                {s.mcp_token_set ? (
                  <span className="gp-set__token">
                    <span className="gp-set__status">Token set</span>
                    <Button variant="quiet" label="Replace" onClick={generate} />
                    <Button variant="quiet" label="Remove" onClick={() => void save('mcp_token', { mcp_token: null }, () => setShownToken(null))} />
                  </span>
                ) : (
                  <Button variant="secondary" label="Generate" onClick={generate} />
                )}
              </SettingRow>
              {shownToken && (
                <>
                  <span />
                  <div className="gp-set__control">
                    <Mono text={shownToken} />
                  </div>
                </>
              )}
            </div>

            <div className="gp-set__agents" aria-label="Connected agents">
              {(agents.data ?? []).map((a, i) => (
                <div className="gp-set__agent" key={a.name}>
                  <span className="gp-set__avatar" style={{ background: `var(--gp-p${(i % 8) + 1})` }} aria-hidden="true">
                    {a.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="gp-set__agent-name" dir="auto">
                    {a.name}
                  </span>
                  <span className="gp-set__meta">{`${a.calls} ${a.calls === 1 ? 'call' : 'calls'}`}</span>
                  <span className="gp-set__meta">{agoLong(a.lastSeen, now)}</span>
                </div>
              ))}
              {agents.data?.length === 0 && <p className="gp-set__empty">No agents connected</p>}
            </div>

            <div className="gp-set__grid gp-set__grid--split">
              <SettingRow label="AI work needs my review" error={errors.agents_need_review}>
                {toggle('agents_need_review', 'AI work needs my review')}
              </SettingRow>
              <SettingRow label="Agents must give a reason when moving dates" error={errors.agents_require_reason}>
                {toggle('agents_require_reason', 'Agents must give a reason to move dates')}
              </SettingRow>
              <SettingRow label="Agents can archive" error={errors.agents_can_archive}>
                {toggle('agents_can_archive', 'Agents can archive')}
              </SettingRow>
              <SettingRow label="Agents can create projects" error={errors.agents_can_create_projects}>
                {toggle('agents_can_create_projects', 'Agents can create projects')}
              </SettingRow>
            </div>
          </SetPanel>

          <SetPanel title="Data">
            <div className="gp-set__grid">
              {info.data?.dbPath && (
                <SettingRow label="Database">
                  <code className="gp-set__path">{dbFolder(info.data.dbPath)}</code>
                </SettingRow>
              )}
              <SettingRow label="Backups">
                <div className="gp-set__backups">
                  <span className="gp-set__summary">{`Daily · last 30 kept · ${last ? `backed up ${agoLong(last.at, now).toLowerCase()}` : 'none yet'}`}</span>
                  <button type="button" className="gp-set__btn" onClick={() => backupNow.mutate(undefined, { onSuccess: () => void backup.refetch() })}>
                    Back up now
                  </button>
                </div>
              </SettingRow>
              <SettingRow label="Export">
                <span className="gp-set__token">
                  <a className="gp-set__btn" href="/api/export?format=json" download>
                    JSON
                  </a>
                  <a className="gp-set__btn" href="/api/export?format=md" download>
                    Markdown
                  </a>
                </span>
              </SettingRow>
            </div>
          </SetPanel>
        </div>
      </div>
    </Page>
  );
}
