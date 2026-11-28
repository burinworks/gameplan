import { useLayoutEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { htmlToMd, mdToHtml } from './markdown';

export interface RichTextProps {
  /** Accessible name. */
  label: string;
  /** Markdown text (the engine's description string). */
  value: string;
  onChange: (md: string) => void;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
}

const exec = (cmd: string, arg?: string) => document.execCommand(cmd, false, arg);

/**
 * Context editor: a contenteditable that grows with its content (at least five lines) and keeps its value as Markdown.
 * Shortcuts: Mod+B bold, Mod+I italic, Mod+K link, Mod+Shift+8 bullet list, "- " at the start of a line starts a list.
 * Pasting always inserts plain text; pasting a URL over a selection makes a link.
 */
export function RichText({ label, value, onChange, placeholder, onFocus, onBlur, onKeyDown }: RichTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<string | null>(null);

  // Mirror outside changes (a save, an agent edit) into the DOM; our own edits are skipped so the caret stays put.
  useLayoutEffect(() => {
    if (!ref.current || last.current === value) return;
    ref.current.innerHTML = mdToHtml(value);
    last.current = value;
  }, [value]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const md = htmlToMd(el);
    if (md === '' && el.innerHTML !== '') el.innerHTML = '';
    last.current = md;
    onChange(md);
  };

  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'b' || k === 'i') {
        e.preventDefault();
        exec(k === 'b' ? 'bold' : 'italic');
        emit();
      } else if (k === 'k') {
        e.preventDefault();
        const url = window.prompt?.('Link address', 'https://');
        if (url && /^(https?:|mailto:)/i.test(url.trim())) {
          exec('createLink', url.trim());
          emit();
        }
      } else if (e.shiftKey && (e.key === '8' || e.key === '*')) {
        e.preventDefault();
        exec('insertUnorderedList');
        emit();
      }
      return;
    }
    if (e.key === ' ' && !e.shiftKey) {
      const sel = window.getSelection();
      const node = sel?.anchorNode;
      if (sel?.isCollapsed && node?.nodeType === 3 && /^[-*]$/.test(node.textContent ?? '') && sel.anchorOffset === 1 && !node.parentElement?.closest('li')) {
        e.preventDefault();
        node.textContent = '';
        exec('insertUnorderedList');
        emit();
      }
    }
  };

  const paste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (/^https?:\/\/\S+$/.test(text.trim()) && window.getSelection()?.toString()) exec('createLink', text.trim());
    else exec('insertText', text);
    emit();
  };

  return (
    <div
      ref={ref}
      className="gp-rich"
      role="textbox"
      aria-multiline="true"
      aria-label={label}
      data-placeholder={placeholder}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      dir="auto"
      onInput={emit}
      onPaste={paste}
      onKeyDown={key}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}
