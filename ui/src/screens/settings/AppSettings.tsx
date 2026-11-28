import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '../../api/client';
import { useAgents, useBackup, useBackupNow, useInfo, useMcpConnect, usePatchSettings, useRotateToken, useSettings, type McpConnect } from '../../api/hooks';
import type { PublicSettings } from '../../api/types';
import { errorLine, fmtAgo } from '../../lib/format';
import { applyTheme } from '../../theme';
import { useDraft } from '../../lib/draft';
import { Button, Field, Page, Segmented, Sheet, Toggle } from '../../ui';
import '../../ui/primitives.css';
import './settings.css';

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

type Client = keyof McpConnect['snippets'];

/** Client tabs in display order. Snippets come from the engine, with the endpoint and token already filled in. */
const CLIENTS: { value: Client; label: string; note?: string }[] = [
  { value: 'claudeCode', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'geminiCli', label: 'Gemini CLI' },
  { value: 'claudeDesktop', label: 'Claude Desktop' },
  { value: 'chatgpt', label: 'ChatGPT', note: 'Needs an HTTPS tunnel to this Mac' },
  { value: 'other', label: 'Other' },
];

const MIN_PORT = 1024;
const MAX_PORT = 65535;

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

/**
 * The MCP endpoint with its port editable in place. Saves `port` on blur or Enter; the engine keeps listening on
 * the old port until restarted, so a pending change shows a restart note.
 */
function Endpoint({ endpoint, port, configured, onSave }: { endpoint: string; port: number; configured: number; onSave: (p: number) => Promise<boolean> }) {
  const at = endpoint.lastIndexOf(`:${port}`);
  const head = at >= 0 ? endpoint.slice(0, at + 1) : `${endpoint.replace(/\/mcp$/, '')}:`;
  const tail = at >= 0 ? endpoint.slice(at + 1 + String(port).length) : '/mcp';
  const d = useDraft(String(configured), (v) => {
    const n = Number(v.trim());
    if (!Number.isInteger(n) || n < MIN_PORT || n > MAX_PORT) return Promise.reject(new Error('bad port'));
    if (n === configured) return Promise.reject(new Error('nothing to save'));
    return onSave(n).then((ok) => (ok ? true : Promise.reject(new Error('refused'))));
  });
  const n = Number(d.value);
  const invalid = d.value.trim() !== '' && (!Number.isInteger(n) || n < MIN_PORT || n > MAX_PORT);
  return (
    <div className="gp-set__stack">
      <div className="gp-set__mono gp-set__endpoint">
        <span className="gp-set__code">
          {head}
          <input
            className="gp-set__port num"
            aria-label="Port"
            inputMode="numeric"
            aria-invalid={invalid || undefined}
            value={d.value}
            size={5}
            maxLength={5}
            onChange={(e) => d.set(e.target.value.replace(/[^0-9]/g, ''))}
            onFocus={d.bind.onFocus}
            onBlur={d.bind.onBlur}
            onKeyDown={(e) => !e.nativeEvent.isComposing && d.bind.onKeyDown(e)}
          />
          {tail}
        </span>
        <button type="button" className="gp-set__copy" onClick={() => copy(`${head}${configured}${tail}`)}>
          Copy
        </button>
      </div>
      {invalid && <p className="gp-set__note gp-set__note--risk">Use a port from 1024 to 65535</p>}
      {!invalid && configured !== port && <p className="gp-set__note">{`Restart Gameplan to use port ${configured}`}</p>}
    </div>
  );
}

function RotateSheet({ onClose, onRotate, busy }: { onClose: () => void; onRotate: () => void; busy: boolean }) {
  return (
    <Sheet
      title="Rotate the MCP token?"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" label="Cancel" onClick={onClose} />
          <Button variant="primary" label="Rotate token" disabled={busy} onClick={onRotate} />
        </>
      }
    >
      <p className="gp-set__sheet-text">Connected agents stop working until you copy the new connect command into each of them.</p>
    </Sheet>
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
  const connect = useMcpConnect();
  const rotate = useRotateToken();
  const [client, setClient] = useState<Client>('claudeCode');
  const [rotating, setRotating] = useState(false);
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

  const savePort = (port: number) =>
    save('port', { port }, () => {
      void qc.invalidateQueries({ queryKey: ['info'] });
    });
  const doRotate = () =>
    rotate.mutate(undefined, {
      onSuccess: (fresh) => {
        qc.setQueryData(['mcpConnect'], fresh);
        setRotating(false);
      },
    });

  const now = new Date();
  const last = backup.data?.last ?? null;
  const c = CLIENTS.find((x) => x.value === client)!;
  const snippet = connect.data?.snippets[client];

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
              <SettingRow label="Endpoint" error={errors.port}>
                {connect.data && info.data ? (
                  <Endpoint endpoint={connect.data.endpoint} port={info.data.port} configured={info.data.configuredPort ?? info.data.port} onSave={savePort} />
                ) : (
                  <div className="gp-set__mono" />
                )}
              </SettingRow>
              <SettingRow label="Connect">
                <div className="gp-set__connect">
                  <Segmented label="Connect" value={client} options={CLIENTS.map(({ value, label }) => ({ value, label }))} onChange={setClient} />
                </div>
              </SettingRow>
              <span />
              <div className="gp-set__control gp-set__stack">
                {c.note && (
                  <p className="gp-set__note" dir="auto">
                    {c.note}
                  </p>
                )}
                {snippet !== undefined ? <Mono text={snippet} /> : <div className="gp-set__mono" />}
                <div className="gp-set__tokenline">
                  <span>Includes your access token.</span>
                  <button type="button" className="gp-set__link" onClick={() => setRotating(true)}>
                    Rotate token
                  </button>
                </div>
              </div>
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
      {rotating && <RotateSheet busy={rotate.isPending} onClose={() => setRotating(false)} onRotate={doRotate} />}
    </Page>
  );
}
