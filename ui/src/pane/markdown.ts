/**
 * Tiny Markdown subset for the Context editor: **bold**, *italic*, [text](url), "- " bullet lists, one line per paragraph.
 * The stored value is always plain Markdown text, so agents and exports read it as ordinary text.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SAFE_URL = /^(https?:|mailto:|\/|#)/i;

function inline(s: string): string {
  let out = esc(s);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text: string, url: string) => (SAFE_URL.test(url) ? `<a href="${url}" target="_blank" rel="noreferrer">${text}</a>` : m));
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\*)/g, '$1<em>$2</em>');
  return out;
}

export function mdToHtml(md: string): string {
  if (md === '') return '';
  const lines = md.split('\n');
  let html = '';
  let list = false;
  for (const line of lines) {
    const li = /^[-*] (.*)$/.exec(line);
    if (li) {
      if (!list) html += '<ul>';
      list = true;
      html += `<li>${inline(li[1]!)}</li>`;
      continue;
    }
    if (list) html += '</ul>';
    list = false;
    html += line === '' ? '<div><br></div>' : `<div>${inline(line)}</div>`;
  }
  if (list) html += '</ul>';
  return html;
}

const BLOCK = new Set(['DIV', 'P', 'UL', 'OL', 'LI']);

function walkInline(n: Node): string {
  if (n.nodeType === 3) return n.textContent ?? '';
  if (!(n instanceof HTMLElement)) return '';
  if (n.tagName === 'BR') return '';
  const inner = [...n.childNodes].map(walkInline).join('');
  if (!inner) return '';
  if (n.tagName === 'B' || n.tagName === 'STRONG') return `**${inner}**`;
  if (n.tagName === 'I' || n.tagName === 'EM') return `*${inner}*`;
  if (n.tagName === 'A') return `[${inner}](${n.getAttribute('href') ?? ''})`;
  return inner;
}

/** Serialises the editor's DOM back to Markdown. */
export function htmlToMd(root: HTMLElement): string {
  const lines: string[] = [];
  let run = '';
  const flush = () => {
    if (run !== '') lines.push(run);
    run = '';
  };
  const visit = (n: Node) => {
    if (n instanceof HTMLElement && BLOCK.has(n.tagName)) {
      flush();
      if (n.tagName === 'UL' || n.tagName === 'OL') {
        for (const c of n.children) lines.push(`- ${[...c.childNodes].map(walkInline).join('')}`);
      } else if (n.tagName === 'LI') {
        lines.push(`- ${[...n.childNodes].map(walkInline).join('')}`);
      } else if (n.querySelector('ul,ol,div,p')) {
        [...n.childNodes].forEach(visit);
        flush();
      } else {
        lines.push([...n.childNodes].map(walkInline).join(''));
      }
      return;
    }
    if (n instanceof HTMLElement && n.tagName === 'BR') {
      lines.push(run);
      run = '';
      return;
    }
    run += walkInline(n);
  };
  [...root.childNodes].forEach(visit);
  flush();
  return lines.join('\n').replace(/ /g, ' ').replace(/\s+$/g, '');
}
