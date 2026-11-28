import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveUiDir } from '../src/server/ui-dir.js';

describe('resolveUiDir', () => {
  const repo = mkdtempSync(join(tmpdir(), 'gp-repo-'));
  mkdirSync(join(repo, 'ui'));
  writeFileSync(join(repo, 'ui', 'index.html'), 'source');
  mkdirSync(join(repo, 'dist', 'ui'), { recursive: true });
  writeFileSync(join(repo, 'dist', 'ui', 'index.html'), 'built');

  it('uses dist/ui from src/server (tsx), never the source ui/', () => {
    expect(resolveUiDir(join(repo, 'src', 'server'), undefined)).toBe(join(repo, 'dist', 'ui'));
  });
  it('uses dist/ui from dist/src/server (compiled)', () => {
    expect(resolveUiDir(join(repo, 'dist', 'src', 'server'), undefined)).toBe(join(repo, 'dist', 'ui'));
  });
  it('honours GAMEPLAN_UI and requires index.html', () => {
    expect(resolveUiDir('/x/src/server', join(repo, 'dist', 'ui'))).toBe(join(repo, 'dist', 'ui'));
    expect(resolveUiDir('/x/src/server', join(repo, 'nope'))).toBeUndefined();
  });
});
