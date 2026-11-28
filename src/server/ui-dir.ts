import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** The built UI dir: GAMEPLAN_UI, else dist/ui (from src/server under tsx, or from dist/src/server when compiled). Undefined unless index.html exists. */
export function resolveUiDir(serverDir: string, env: string | undefined): string | undefined {
  const root = join(serverDir, '..', '..');
  const dir = env ?? (basename(root) === 'dist' ? join(root, 'ui') : join(root, 'dist', 'ui'));
  return existsSync(join(dir, 'index.html')) ? dir : undefined;
}
