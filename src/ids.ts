import { randomBytes } from 'node:crypto';

export type IdPrefix = 'prj' | 'ar' | 'ms' | 'tk' | 'td' | 'att' | 'dep' | 'ev' | 'bat';

let last = 0;
let seq = 0;

/** Time-ordered, url-safe id: `<prefix>_<time36><seq><random>`. */
export function newId(prefix: IdPrefix): string {
  const t = Date.now();
  seq = t === last ? seq + 1 : 0;
  last = t;
  const rand = randomBytes(5).toString('hex');
  return `${prefix}_${t.toString(36)}${seq.toString(36).padStart(2, '0')}${rand}`;
}

export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
