"use client";

import { Fragment, useRef, type ReactNode, type RefObject } from "react";

/* ---------- Showing formatted text ---------- */

const BLANK = /\[[^\]\n]{2,80}\]/g;

function inline(text: string, key: string): ReactNode[] {
  // **bold**, _italic_, and [blanks] that still need filling in.
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*\n]+\*\*|_[^_\n]+_|\[[^\]\n]{2,80}\])/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) out.push(<strong key={`${key}b${i}`}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("_")) out.push(<em key={`${key}i${i}`}>{token.slice(1, -1)}</em>);
    else out.push(<mark key={`${key}m${i}`} className="rounded bg-gold-300/60 px-0.5">{token}</mark>);
    last = match.index + token.length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Renders plain text with light formatting: paragraphs, line breaks, bullet
 * and numbered lists, bold and italics. Built from React elements only, so
 * nothing a person types can run as code.
 */
export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let i = 0;
  let n = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const bullet = /^\s*[-*•]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const test = ordered ? numbered : bullet;
      const items: string[] = [];
      while (i < lines.length && test.test(lines[i])) {
        items.push(lines[i].replace(test, ""));
        i++;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={n++} className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5`}>
          {items.map((item, j) => (
            <li key={j}>{inline(item, `${n}-${j}`)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !bullet.test(lines[i]) && !numbered.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={n++}>
        {para.map((l, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(l, `${n}-${j}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className={`space-y-2.5 ${className}`}>{blocks}</div>;
}

export const countBlanks = (text: string) => (text.match(BLANK) ?? []).length;

/* ---------- Writing formatted text ---------- */

function apply(el: HTMLTextAreaElement, onChange: (v: string) => void, kind: "bold" | "italic" | "bullets" | "numbers") {
  const { selectionStart: a, selectionEnd: b, value } = el;
  let next = value;
  let caret = b;
  if (kind === "bold" || kind === "italic") {
    const mark = kind === "bold" ? "**" : "_";
    const chosen = value.slice(a, b) || (kind === "bold" ? "bold text" : "italic text");
    next = value.slice(0, a) + mark + chosen + mark + value.slice(b);
    caret = a + mark.length + chosen.length + mark.length;
  } else {
    const start = value.lastIndexOf("\n", a - 1) + 1;
    const endBreak = value.indexOf("\n", b);
    const end = endBreak === -1 ? value.length : endBreak;
    const lines = value.slice(start, end).split("\n");
    const done = lines.map((l, i) => (kind === "bullets" ? `- ${l.replace(/^\s*([-*]|\d+[.)])\s+/, "")}` : `${i + 1}. ${l.replace(/^\s*([-*]|\d+[.)])\s+/, "")}`));
    next = value.slice(0, start) + done.join("\n") + value.slice(end);
    caret = start + done.join("\n").length;
  }
  onChange(next);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(caret, caret);
  });
}

export function FormatBar({ target, onChange }: { target: RefObject<HTMLTextAreaElement | null>; onChange: (v: string) => void }) {
  const button = "rounded border border-line bg-paper px-2 py-1 text-[13px] hover:bg-mist";
  const run = (kind: "bold" | "italic" | "bullets" | "numbers") => () => target.current && apply(target.current, onChange, kind);
  return (
    <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Formatting">
      <button type="button" className={`${button} font-bold`} onClick={run("bold")}>Bold</button>
      <button type="button" className={`${button} italic`} onClick={run("italic")}>Italic</button>
      <button type="button" className={button} onClick={run("bullets")}>Bullet list</button>
      <button type="button" className={button} onClick={run("numbers")}>Numbered list</button>
    </div>
  );
}

/**
 * A text box with a formatting bar that highlights every [blank] still left
 * in the text, so a template is never sent half filled in.
 */
export function Composer({
  value,
  onChange,
  placeholder,
  label,
  minRows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const blanks = countBlanks(value);
  const shared = "col-start-1 row-start-1 w-full whitespace-pre-wrap break-words rounded-md border px-3 py-2 text-sm leading-[1.55] [font-family:inherit]";
  // The same text sits behind the box with only the blanks painted.
  const painted: ReactNode[] = [];
  let last = 0;
  value.replace(BLANK, (m, offset: number) => {
    painted.push(value.slice(last, offset));
    painted.push(<mark key={offset} className="rounded bg-gold-300/80 text-transparent">{m}</mark>);
    last = offset + m.length;
    return m;
  });
  painted.push(value.slice(last));
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <FormatBar target={ref} onChange={onChange} />
        {blanks > 0 && (
          <span className="rounded-full bg-gold-100 px-2.5 py-0.5 text-[13px] font-medium text-gold-700" role="status">
            {blanks} blank{blanks === 1 ? "" : "s"} left to fill in
          </span>
        )}
      </div>
      <div className="grid rounded-md bg-paper">
        <div aria-hidden className={`${shared} pointer-events-none border-transparent text-transparent`}>
          {painted}
          {"\n"}
        </div>
        <textarea
          ref={ref}
          aria-label={label}
          rows={minRows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${shared} resize-none overflow-hidden border-line bg-transparent text-ink placeholder:text-faint focus:border-pine focus:outline-none focus:ring-1 focus:ring-pine`}
        />
      </div>
    </div>
  );
}
