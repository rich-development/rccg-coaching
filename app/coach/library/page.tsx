"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useIsCoach } from "@/components/role";
import { QuestionSet } from "@/components/worksheet";
import { Badge, Button, Field, Input, Loading, Modal, PageTitle, Panel, Tabs, TextArea, useAct } from "@/components/ui";

function ServiceEditor({ s, onClose }: { s: Doc<"services">; onClose: () => void }) {
  const save = useMutation(api.library.saveService);
  const { act, busy } = useAct();
  const [v, setV] = useState({ name: s.name, price: String(s.priceCents / 100), priceNote: s.priceNote, sessionsIncluded: String(s.sessionsIncluded), sessionMinutes: String(s.sessionMinutes), durationWeeks: s.durationWeeks ? String(s.durationWeeks) : "", supportTerms: s.supportTerms, description: s.description, active: s.active });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((old) => ({ ...old, [k]: e.target.value }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await act(
          () => save({ id: s._id, name: v.name, priceCents: Math.round(Number(v.price) * 100), priceNote: v.priceNote, sessionsIncluded: Number(v.sessionsIncluded), sessionMinutes: Number(v.sessionMinutes), durationWeeks: v.durationWeeks ? Number(v.durationWeeks) : undefined, supportTerms: v.supportTerms, description: v.description, active: v.active }),
          "Service saved",
        );
        if (ok) onClose();
      }}
    >
      <p className="rounded-md bg-gold-50 p-3 text-[13px] text-soft sm:col-span-2">Changes apply to future clients. Anyone already enrolled keeps the terms she agreed to.</p>
      <Field label="Name"><Input value={v.name} onChange={set("name")} /></Field>
      <Field label="Price (dollars)"><Input type="number" min="0" step="0.01" value={v.price} onChange={set("price")} /></Field>
      <Field label="Price as shown" hint="Example: $295 per monthly cycle"><Input value={v.priceNote} onChange={set("priceNote")} /></Field>
      <Field label="Sessions included"><Input type="number" min="1" value={v.sessionsIncluded} onChange={set("sessionsIncluded")} /></Field>
      <Field label="Minutes per session"><Input type="number" min="5" value={v.sessionMinutes} onChange={set("sessionMinutes")} /></Field>
      <Field label="Length in weeks"><Input type="number" min="0" value={v.durationWeeks} onChange={set("durationWeeks")} /></Field>
      <Field label="Description" className="sm:col-span-2"><TextArea value={v.description} onChange={set("description")} /></Field>
      <Field label="Between-session support" className="sm:col-span-2"><TextArea value={v.supportTerms} onChange={set("supportTerms")} /></Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={v.active} onChange={(e) => setV((old) => ({ ...old, active: e.target.checked }))} /> Offer this service to new clients
      </label>
      <div className="sm:col-span-2"><Button type="submit" tone="primary" disabled={busy}>Save service</Button></div>
    </form>
  );
}

function WorksheetEditor({ w, canEdit, onClose }: { w: Doc<"worksheetTemplates">; canEdit: boolean; onClose: () => void }) {
  const save = useMutation(api.library.saveWorksheet);
  const { act, busy } = useAct();
  const [title, setTitle] = useState(w.title);
  const [intro, setIntro] = useState(w.intro);
  const [fields, setFields] = useState(w.fields);
  const [active, setActive] = useState(w.active);
  if (!canEdit) return <><p className="mb-4 text-sm text-soft">{w.intro}</p><QuestionSet fields={w.fields} values={{}} readOnly /></>;
  return (
    <div className="space-y-4">
      <p className="rounded-md bg-gold-50 p-3 text-[13px] text-soft">This is the master page. Editing it changes future assignments only. Pages already assigned keep their wording and answers.</p>
      <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Introduction"><TextArea value={intro} onChange={(e) => setIntro(e.target.value)} /></Field>
      <div>
        <div className="mb-1 text-[13px] font-medium">Questions</div>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={f.key} className="flex items-center gap-2">
              <Input aria-label={`Question ${i + 1}`} value={f.label} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <Badge>{f.type === "table" ? "Table" : f.type === "choice" ? "Choice" : f.type === "long" ? "Paragraph" : "Short"}</Badge>
            </div>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Available to assign</label>
      <Button tone="primary" disabled={busy} onClick={async () => { if (await act(() => save({ id: w._id, title, intro, fields, active }), "Master page saved")) onClose(); }}>Save master page</Button>
    </div>
  );
}

function TemplateEditor({ t, canEdit, onClose }: { t: Doc<"messageTemplates">; canEdit: boolean; onClose: () => void }) {
  const save = useMutation(api.library.saveTemplate);
  const { act, busy } = useAct();
  const [v, setV] = useState({ name: t.name, subject: t.subject, body: t.body });
  return (
    <div className="space-y-3">
      <Field label="Name"><Input value={v.name} disabled={!canEdit} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <Field label="Email subject"><Input value={v.subject} disabled={!canEdit} onChange={(e) => setV({ ...v, subject: e.target.value })} /></Field>
      <Field label="Message" hint="Keep each [bracketed] field. Messages cannot be sent until every bracket is filled in."><TextArea rows={9} value={v.body} disabled={!canEdit} onChange={(e) => setV({ ...v, body: e.target.value })} /></Field>
      {canEdit && <Button tone="primary" disabled={busy} onClick={async () => { if (await act(() => save({ id: t._id, ...v }), "Template saved")) onClose(); }}>Save template</Button>}
    </div>
  );
}

const RHYTHM = [
  ["0 to 10 minutes", "Review wins, actions, and what changed"],
  ["10 to 15 minutes", "Agree on the outcome for this meeting"],
  ["15 to 40 minutes", "Explore the obstacle and work through a decision or exercise"],
  ["40 to 55 minutes", "Choose up to three actions, owners, and dates"],
  ["55 to 60 minutes", "Ask the client to restate the plan and confirm the next meeting"],
];
const JOURNEY = [
  ["Week 1", "Clarify the starting point and desired change", "One coaching goal and a clear business description"],
  ["Week 2", "Choose priorities and allocate resources", "A realistic 30-day action plan and weekly schedule"],
  ["Week 4", "Review action and make one task repeatable", "A usable process and an adjusted plan"],
  ["Week 6", "Assess progress and plan independent follow-through", "Evidence of progress and the next 30-day plan"],
];

export default function LibraryPage() {
  const isCoach = useIsCoach();
  const services = useQuery(api.library.services, {});
  const worksheets = useQuery(api.library.worksheets, {});
  const templates = useQuery(api.library.templates, {});
  const [tab, setTab] = useState("services");
  const [service, setService] = useState<Doc<"services"> | null>(null);
  const [sheet, setSheet] = useState<Doc<"worksheetTemplates"> | null>(null);
  const [template, setTemplate] = useState<Doc<"messageTemplates"> | null>(null);
  if (!services || !worksheets || !templates) return <Loading />;
  return (
    <div>
      <PageTitle title="Library" sub="Your services, workbook masters, message templates, and coaching guides. Masters stay separate from each client's copy." />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "services", label: "Services" }, { key: "workbook", label: "Workbook pages" }, { key: "templates", label: "Message templates" }, { key: "guides", label: "Coaching guides" }]} />

      {tab === "services" && (
        <div className="overflow-x-auto rounded-lg border border-line bg-paper">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="border-b border-line text-[13px] text-soft">
              <tr><th className="px-4 py-2.5 font-medium">Service</th><th className="px-4 py-2.5 font-medium">Terms</th><th className="px-4 py-2.5 font-medium">What to track</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {services.map((s) => (
                <tr key={s._id} className="align-top">
                  <td className="px-4 py-3"><div className="font-medium">{s.name}</div>{!s.active && <Badge>Not offered</Badge>}</td>
                  <td className="px-4 py-3"><div>{s.priceNote}</div><div className="text-[13px] text-soft">{s.description} {s.supportTerms}</div></td>
                  <td className="px-4 py-3 text-[13px] text-soft">{s.trackNote}</td>
                  <td className="px-4 py-3">{isCoach && <Button small onClick={() => setService(s)}>Edit</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "workbook" && (
        <ul className="grid gap-3 md:grid-cols-2">
          {worksheets.map((w) => (
            <li key={w._id}>
              <button type="button" onClick={() => setSheet(w)} className="block h-full w-full rounded-lg border border-line bg-paper p-4 text-left hover:border-gold-500">
                <div className="flex items-start justify-between gap-2">
                  <span className="display text-lg">{w.title}</span>
                  <span className="text-[13px] text-faint">Workbook page {w.page}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[13px] text-soft">{w.intro}</p>
                <p className="mt-2 text-[13px] text-soft">{w.fields.length} questions{!w.active ? ". Not available to assign" : ""}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {tab === "templates" && (
        <ul className="space-y-3">
          {templates.map((t) => (
            <li key={t._id} className="rounded-lg border border-line bg-paper p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="display text-lg">{t.name}</span>
                <Button small onClick={() => setTemplate(t)}>{isCoach ? "Edit" : "Open"}</Button>
              </div>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[13px] text-soft">{t.body}</p>
            </li>
          ))}
          <li className="text-[13px] text-soft">These are drafts for review, not automated messages. Use them from a client&rsquo;s message thread.</li>
        </ul>
      )}

      {tab === "guides" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="60-minute session rhythm">
            <ol className="space-y-1.5 text-sm">{RHYTHM.map(([t, what]) => <li key={t} className="grid grid-cols-[8.5rem_1fr] gap-2"><span className="text-soft">{t}</span><span>{what}</span></li>)}</ol>
            <p className="mt-3 text-[13px] text-soft">90-minute Your Next Step: 10 of context, 10 to agree on the challenge, 45 working, 20 for the action plan, 5 to close. 45-minute Keep Moving: 5 to check progress, 5 to set focus, 25 to work, 10 to agree on action.</p>
          </Panel>
          <Panel title="Six-week coaching journey">
            <ol className="space-y-2.5 text-sm">{JOURNEY.map(([w, focus, leave]) => <li key={w}><span className="font-medium">{w}.</span> {focus}. <span className="text-soft">Leave with: {leave}.</span></li>)}</ol>
            <p className="mt-3 text-[13px] text-soft">Use weeks 3 and 5 for implementation with the email check-in. She does not need to finish the whole workbook.</p>
          </Panel>
          <Panel title="Adapt to her stage">
            <ul className="space-y-2 text-sm">
              <li><span className="font-medium">Starting.</span> Existing skills, a clear offer, customer conversations, and a manageable first step.</li>
              <li><span className="font-medium">Starting over.</span> What to keep, change, or stop before adding more work.</li>
              <li><span className="font-medium">Pivoting.</span> What changes, what continues, and how to test the new direction with limited resources.</li>
            </ul>
          </Panel>
          <Panel title="When a commitment was not completed">
            <p className="text-sm">Ask what happened before assigning more work. Was the task unclear, too large, dependent on someone else, or no longer useful? Reduce or revise it together. Record a new next step and date instead of carrying an unrealistic task forward.</p>
            <p className="mt-3 text-sm">Working principle: let the client do the thinking and make the decisions. Ask useful questions, offer practical options, and help her turn a decision into a repeatable action.</p>
          </Panel>
          <Panel title="Keeping scope clear" className="lg:col-span-2">
            <p className="text-sm">Coaching includes questions, planning, accountability, and guided use of worksheets. Hands-on setup, document production, website work, or ongoing administration need a separate scope and price. Do not promise revenue, funding, or a completed business launch.</p>
          </Panel>
        </div>
      )}

      <Modal open={!!service} onClose={() => setService(null)} title={service ? `Edit ${service.name}` : ""} wide>{service && <ServiceEditor s={service} onClose={() => setService(null)} />}</Modal>
      <Modal open={!!sheet} onClose={() => setSheet(null)} title={sheet?.title ?? ""} wide>{sheet && <WorksheetEditor w={sheet} canEdit={isCoach} onClose={() => setSheet(null)} />}</Modal>
      <Modal open={!!template} onClose={() => setTemplate(null)} title={template?.name ?? ""} wide>{template && <TemplateEditor t={template} canEdit={isCoach} onClose={() => setTemplate(null)} />}</Modal>
    </div>
  );
}
