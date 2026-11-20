"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Composer } from "@/components/rich";
import type { FieldDef } from "@/components/worksheet";
import { Button, Field, Input, Select, TextArea, useAct } from "@/components/ui";

export function AddService({ onClose }: { onClose: () => void }) {
  const add = useMutation(api.library.addService);
  const { act, busy } = useAct();
  const [v, setV] = useState({ name: "", kind: "package" as "single" | "package" | "monthly", price: "", priceNote: "", sessionsIncluded: "1", sessionMinutes: "60", durationWeeks: "", supportTerms: "", description: "" });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((old) => ({ ...old, [k]: e.target.value }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await act(
          () =>
            add({
              name: v.name,
              kind: v.kind,
              priceCents: Math.round(Number(v.price || 0) * 100),
              priceNote: v.priceNote || `$${Number(v.price || 0)}`,
              sessionsIncluded: Number(v.sessionsIncluded),
              sessionMinutes: Number(v.sessionMinutes),
              durationWeeks: v.durationWeeks ? Number(v.durationWeeks) : undefined,
              supportTerms: v.supportTerms,
              description: v.description,
            }),
          "Service added",
        );
        if (ok) onClose();
      }}
    >
      <Field label="Name" className="sm:col-span-2"><Input required value={v.name} onChange={set("name")} maxLength={120} /></Field>
      <Field label="Type">
        <Select value={v.kind} onChange={(e) => setV((old) => ({ ...old, kind: e.target.value as typeof v.kind }))}>
          <option value="single">One session</option>
          <option value="package">Package of sessions</option>
          <option value="monthly">Monthly cycle</option>
        </Select>
      </Field>
      <Field label="Price (dollars)"><Input required type="number" min="0" step="0.01" value={v.price} onChange={set("price")} /></Field>
      <Field label="Price as shown" hint="Leave blank to show the plain price."><Input value={v.priceNote} onChange={set("priceNote")} placeholder="$450" /></Field>
      <Field label="Sessions included"><Input type="number" min="1" value={v.sessionsIncluded} onChange={set("sessionsIncluded")} /></Field>
      <Field label="Minutes per session"><Input type="number" min="5" value={v.sessionMinutes} onChange={set("sessionMinutes")} /></Field>
      <Field label="Length in weeks" hint="Leave blank for no end date."><Input type="number" min="0" value={v.durationWeeks} onChange={set("durationWeeks")} /></Field>
      <Field label="What it is" className="sm:col-span-2"><TextArea value={v.description} onChange={set("description")} maxLength={800} /></Field>
      <Field label="Between-session support" className="sm:col-span-2"><TextArea value={v.supportTerms} onChange={set("supportTerms")} maxLength={600} placeholder="One brief email check-in each week." /></Field>
      <div className="sm:col-span-2"><Button type="submit" tone="primary" disabled={busy}>Add service</Button></div>
    </form>
  );
}

/** Which workbook pages go out, in what order, and how often she is asked to check in. */
export function ServiceAutomation({ s }: { s: Doc<"services"> }) {
  const pages = useQuery(api.library.worksheets, {});
  const save = useMutation(api.library.saveServiceAutomation);
  const { act, busy } = useAct();
  const defaults: Record<string, string[]> = { structure: ["starting_point", "thirty_day", "repeatable", "progress_review"], next_step: ["action_plan"], keep_moving: ["session_prep", "progress_review"] };
  const defaultDays: Record<string, number> = { structure: 7, keep_moving: 14 };
  const [order, setOrder] = useState<string[]>(s.worksheetOrder ?? defaults[s.key] ?? []);
  const [days, setDays] = useState(String(s.checkinEveryDays ?? defaultDays[s.key] ?? 0));
  const title = (key: string) => pages?.find((p) => p.key === key)?.title ?? key;
  const move = (i: number, by: number) => {
    const next = [...order];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  return (
    <div className="mt-5 border-t border-line pt-4">
      <h3 className="text-[13px] font-semibold">What goes out on its own</h3>
      <p className="mb-3 text-[13px] text-soft">The first page is assigned when the engagement starts. The next one follows each completed session, once she has sent in the page before it.</p>
      {order.length === 0 ? (
        <p className="text-sm text-soft">No pages are assigned automatically for this service.</p>
      ) : (
        <ol className="space-y-1.5">
          {order.map((key, i) => (
            <li key={key} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-soft">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate">{title(key)}</span>
              <button type="button" className="rounded border border-line px-1.5 text-[13px]" onClick={() => move(i, -1)} aria-label={`Move ${title(key)} up`}>Up</button>
              <button type="button" className="rounded border border-line px-1.5 text-[13px]" onClick={() => move(i, 1)} aria-label={`Move ${title(key)} down`}>Down</button>
              <button type="button" className="text-[13px] text-clay underline underline-offset-2" onClick={() => setOrder(order.filter((k) => k !== key))}>Remove</button>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Add a page to the order">
          <Select value="" onChange={(e) => e.target.value && setOrder([...order, e.target.value])}>
            <option value="">Choose a page</option>
            {(pages ?? []).filter((p) => p.active && !order.includes(p.key)).map((p) => (
              <option key={p.key} value={p.key}>{p.title}</option>
            ))}
          </Select>
        </Field>
        <Field label="Days between check-ins" hint="0 means no automatic check-ins.">
          <Input type="number" min="0" max="90" value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3">
        <Button small disabled={busy} onClick={() => act(() => save({ id: s._id, worksheetOrder: order, checkinEveryDays: Number(days || 0) }), "Automatic steps saved")}>
          Save automatic steps
        </Button>
      </div>
    </div>
  );
}

type Draft = { label: string; type: FieldDef["type"]; extra: string; rows: string };

export function AddWorksheet({ onClose }: { onClose: () => void }) {
  const add = useMutation(api.library.addWorksheet);
  const { act, busy } = useAct();
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [qs, setQs] = useState<Draft[]>([{ label: "", type: "long", extra: "", rows: "3" }]);
  const patch = (i: number, change: Partial<Draft>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...change } : q)));
  const list = (text: string) => text.split(",").map((x) => x.trim()).filter(Boolean);
  return (
    <div className="space-y-4">
      <Field label="Page title"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} /></Field>
      <Field label="Introduction" hint="A sentence or two on how to use the page."><TextArea value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={1200} /></Field>
      <div>
        <div className="mb-2 text-[13px] font-medium">Questions</div>
        <div className="space-y-3">
          {qs.map((q, i) => (
            <div key={i} className="rounded-md border border-line p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
                <Input aria-label={`Question ${i + 1}`} placeholder={`Question ${i + 1}`} value={q.label} onChange={(e) => patch(i, { label: e.target.value })} maxLength={300} />
                <Select aria-label="Answer type" value={q.type} onChange={(e) => patch(i, { type: e.target.value as FieldDef["type"] })}>
                  <option value="long">Paragraph answer</option>
                  <option value="short">Short answer</option>
                  <option value="number">Number</option>
                  <option value="choice">Pick one</option>
                  <option value="table">Table</option>
                </Select>
              </div>
              {q.type === "choice" && <Input className="mt-2" aria-label="Choices" placeholder="Choices, separated by commas" value={q.extra} onChange={(e) => patch(i, { extra: e.target.value })} />}
              {q.type === "table" && (
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_7rem]">
                  <Input aria-label="Column headings" placeholder="Column headings, separated by commas" value={q.extra} onChange={(e) => patch(i, { extra: e.target.value })} />
                  <Input aria-label="Number of rows" type="number" min="1" max="12" value={q.rows} onChange={(e) => patch(i, { rows: e.target.value })} />
                </div>
              )}
              {qs.length > 1 && (
                <button type="button" className="mt-2 text-[13px] text-clay underline underline-offset-2" onClick={() => setQs(qs.filter((_, j) => j !== i))}>Remove question</button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3"><Button small onClick={() => setQs([...qs, { label: "", type: "long", extra: "", rows: "3" }])}>Add a question</Button></div>
      </div>
      <Button
        tone="primary"
        disabled={busy || !title.trim() || qs.some((q) => !q.label.trim())}
        onClick={async () => {
          const fields: FieldDef[] = qs.map((q) => ({
            key: "",
            label: q.label,
            type: q.type,
            ...(q.type === "choice" ? { choices: list(q.extra) } : {}),
            ...(q.type === "table" ? { columns: list(q.extra).length ? list(q.extra) : ["Answer"], rowCount: Math.min(12, Math.max(1, Number(q.rows) || 3)) } : {}),
          }));
          if (await act(() => add({ title, intro, fields }), "Page added to the workbook")) onClose();
        }}
      >
        Add workbook page
      </Button>
    </div>
  );
}

export function AddTemplate({ onClose }: { onClose: () => void }) {
  const add = useMutation(api.library.addTemplate);
  const { act, busy } = useAct();
  const [v, setV] = useState({ name: "", subject: "", body: "Hi [Name], " });
  return (
    <div className="space-y-3">
      <Field label="Name"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={120} /></Field>
      <Field label="Email subject"><Input value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} maxLength={200} /></Field>
      <div>
        <div className="mb-1 text-[13px] font-medium">Message</div>
        <Composer value={v.body} onChange={(body) => setV({ ...v, body })} label="Template message" minRows={6} />
        <p className="mt-2 text-[13px] text-soft">Put anything that changes per client in [square brackets]. These fill themselves from her record: [Name], [goal], [service and included sessions], [date, time and time zone], [link or location], [agreed action], [priority].</p>
      </div>
      <Button tone="primary" disabled={busy || !v.name.trim() || !v.body.trim()} onClick={async () => { if (await act(() => add(v), "Template added")) onClose(); }}>Add template</Button>
    </div>
  );
}

export function GuideEditor({ guide, onClose }: { guide: { key: string; title: string; body: string } | null; onClose: () => void }) {
  const save = useMutation(api.library.saveGuide);
  const { act, busy } = useAct();
  const [title, setTitle] = useState(guide?.title ?? "");
  const [body, setBody] = useState(guide?.body ?? "");
  return (
    <div className="space-y-3">
      <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} /></Field>
      <div>
        <div className="mb-1 text-[13px] font-medium">Guide</div>
        <Composer value={body} onChange={setBody} label="Guide text" minRows={10} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button tone="primary" disabled={busy || !title.trim() || !body.trim()} onClick={async () => { if (await act(() => save({ key: guide?.key, title, body }), "Guide saved")) onClose(); }}>Save guide</Button>
        {guide && (
          <Button tone="danger" disabled={busy} onClick={async () => { if (window.confirm(`Remove the guide "${guide.title}"?`) && (await act(() => save({ key: guide.key, title: guide.title, body: guide.body, remove: true }), "Guide removed"))) onClose(); }}>
            Remove guide
          </Button>
        )}
      </div>
    </div>
  );
}
