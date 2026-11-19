"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { errorMessage } from "@/lib/format";

/* ---------- Notices (success and error messages) ---------- */

type Notice = { id: number; text: string; tone: "ok" | "error" };
const NoticeContext = createContext<(text: string, tone?: "ok" | "error") => void>(() => {});

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Notice[]>([]);
  const push = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list, { id, text, tone }]);
    setTimeout(() => setItems((list) => list.filter((n) => n.id !== id)), tone === "error" ? 8000 : 3500);
  }, []);
  return (
    <NoticeContext.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2" role="status" aria-live="polite">
        {items.map((n) => (
          <div
            key={n.id}
            className={`rounded-md border px-4 py-3 text-sm shadow-lg ${
              n.tone === "error" ? "border-clay bg-clay-50 text-clay" : "border-pine bg-paper text-ink"
            }`}
          >
            {n.text}
          </div>
        ))}
      </div>
    </NoticeContext.Provider>
  );
}

export const useNotice = () => useContext(NoticeContext);

/** Runs a save, shows what happened, and reports whether it worked. */
export function useAct() {
  const notice = useNotice();
  const [busy, setBusy] = useState(false);
  const act = useCallback(
    async (work: () => Promise<unknown>, done?: string): Promise<boolean> => {
      setBusy(true);
      try {
        await work();
        if (done) notice(done);
        return true;
      } catch (e) {
        notice(errorMessage(e), "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [notice],
  );
  return { act, busy };
}

/* ---------- Buttons ---------- */

const buttonStyles = {
  primary: "bg-pine text-white hover:bg-pine-dark border-pine",
  quiet: "bg-paper text-ink hover:bg-mist border-line",
  gold: "bg-gold-100 text-gold-700 hover:bg-gold-300/50 border-gold-300",
  danger: "bg-paper text-clay hover:bg-clay-50 border-clay/40",
  ghost: "bg-transparent text-pine hover:bg-pine-50 border-transparent",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: keyof typeof buttonStyles;
  small?: boolean;
};

export function Button({ tone = "quiet", small, className = "", ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        small ? "px-2.5 py-1 text-[13px]" : "px-3.5 py-2 text-sm"
      } ${buttonStyles[tone]} ${className}`}
    />
  );
}

export function LinkButton({
  href,
  tone = "quiet",
  small,
  children,
  external,
}: {
  href: string;
  tone?: keyof typeof buttonStyles;
  small?: boolean;
  children: ReactNode;
  external?: boolean;
}) {
  const cls = `inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors ${
    small ? "px-2.5 py-1 text-[13px]" : "px-3.5 py-2 text-sm"
  } ${buttonStyles[tone]}`;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

/** Opens only http(s) links, in a new tab, without leaking where the user came from. */
export function SafeLink({ href, children, className = "" }: { href?: string | null; children: ReactNode; className?: string }) {
  if (!href || !/^https?:\/\//i.test(href)) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`text-pine underline underline-offset-2 hover:text-pine-dark ${className}`}>
      {children}
    </a>
  );
}

/* ---------- Form fields ---------- */

const inputCls =
  "w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-pine focus:outline-none focus:ring-1 focus:ring-pine";

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-soft">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`${inputCls} min-h-[4.5rem] ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

/* ---------- Layout pieces ---------- */

export function PageTitle({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[1.9rem] leading-tight text-ink">{title}</h1>
        <span className="swash" aria-hidden />
        {sub && <p className="mt-2 max-w-2xl text-sm text-soft">{sub}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  aside,
  children,
  className = "",
  tone,
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "private" | "shared";
}) {
  const edge = tone === "private" ? "border-l-4 border-l-ink" : tone === "shared" ? "border-l-4 border-l-gold-500" : "";
  return (
    <section className={`rounded-lg border border-line bg-paper ${edge} ${className}`}>
      {(title || aside) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          {title && <h2 className="text-[1.05rem] text-ink">{title}</h2>}
          {aside}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const badgeTones = {
  neutral: "bg-mist text-soft border-line",
  gold: "bg-gold-50 text-gold-700 border-gold-300",
  pine: "bg-pine-50 text-pine border-pine/20",
  clay: "bg-clay-50 text-clay border-clay/30",
  moss: "bg-moss-50 text-moss border-moss/30",
  ink: "bg-ink text-white border-ink",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof badgeTones }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

/** Marks who can see a block: only Tamika, or the client too. */
export function Visibility({ who }: { who: "private" | "shared" }) {
  return who === "private" ? <Badge tone="ink">Only you see this</Badge> : <Badge tone="gold">Client can see this</Badge>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-line bg-mist/60 px-4 py-6 text-center text-sm text-soft">{children}</p>;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return <p className="p-8 text-sm text-soft">{label}&hellip;</p>;
}

export function Meter({ used, total, label }: { used: number; total: number; label?: string }) {
  return (
    <div className="flex items-center gap-2" title={label}>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: Math.min(total, 12) }).map((_, i) => (
          <span key={i} className={`h-2.5 w-5 rounded-sm ${i < used ? "bg-gold-500" : "bg-line"}`} />
        ))}
      </div>
      <span className="text-xs text-soft">
        {used} of {total} used
      </span>
    </div>
  );
}

export function Bar({ value, max, tone = "gold" }: { value: number; max: number; tone?: "gold" | "pine" | "clay" }) {
  const width = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const color = tone === "pine" ? "bg-pine" : tone === "clay" ? "bg-clay" : "bg-gold-500";
  return (
    <div className="h-2.5 w-full rounded-sm bg-mist">
      <div className={`h-2.5 rounded-sm ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}

/* ---------- Dialog ---------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] rounded-lg border border-line bg-paper p-0 text-ink shadow-2xl ${wide ? "max-w-3xl" : "max-w-lg"}`}
    >
      {open && (
        <>
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-lg">{title}</h2>
            <button type="button" onClick={onClose} className="rounded px-2 py-1 text-sm text-soft hover:bg-mist" aria-label="Close">
              Close
            </button>
          </div>
          <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
        </>
      )}
    </dialog>
  );
}

/* ---------- Tabs ---------- */

export function Tabs({ tabs, value, onChange }: { tabs: { key: string; label: string; count?: number }[]; value: string; onChange: (key: string) => void }) {
  return (
    <div className="no-print mb-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium ${
            value === t.key ? "border-gold-500 text-ink" : "border-transparent text-soft hover:text-ink"
          }`}
        >
          {t.label}
          {t.count ? <span className="ml-1.5 rounded-full bg-clay px-1.5 text-[11px] text-white">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-soft">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children || <span className="text-faint">Not recorded</span>}</dd>
    </div>
  );
}
