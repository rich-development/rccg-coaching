"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useCan } from "@/components/role";
import { AddService, AddTemplate, AddWorksheet, GuideEditor, ServiceAutomation } from "@/components/library-editors";
import { RichText } from "@/components/rich";
import { QuestionSet } from "@/components/worksheet";
import { Composer } from "@/components/rich";
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
      {s.kind !== "coworking" && s.kind !== "discovery" && <div className="sm:col-span-2"><ServiceAutomation s={s} /></div>}
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
  const remove = useMutation(api.library.removeTemplate);
  const { act, busy } = useAct();
  const [v, setV] = useState({ name: t.name, subject: t.subject, body: t.body });
  return (
    <div className="space-y-3">
      <Field label="Name"><Input value={v.name} disabled={!canEdit} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <Field label="Email subject"><Input value={v.subject} disabled={!canEdit} onChange={(e) => setV({ ...v, subject: e.target.value })} /></Field>
      {canEdit ? (
        <div>
          <div className="mb-1 text-[13px] font-medium">Message</div>
          <Composer value={v.body} onChange={(body) => setV({ ...v, body })} label="Template message" minRows={8} />
          <p className="mt-2 text-[13px] text-soft">Highlighted [brackets] are blanks. Most fill themselves from the client&rsquo;s record when you use the template. A message cannot be sent with a blank left in.</p>
        </div>
      ) : (
        <RichText text={v.body} className="rounded-md bg-mist p-3 text-sm" />
      )}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button tone="primary" disabled={busy} onClick={async () => { if (await act(() => save({ id: t._id, ...v }), "Template saved")) onClose(); }}>Save template</Button>
          <Button tone="danger" disabled={busy} onClick={async () => { if (window.confirm(`Remove the ${t.name} template?`) && (await act(() => remove({ id: t._id }), "Template removed"))) onClose(); }}>Remove template</Button>
        </div>
      )}
    </div>
  );
}

export default function LibraryPage() {
  const isCoach = useCan("settings");
  const services = useQuery(api.library.services, {});
  const worksheets = useQuery(api.library.worksheets, {});
  const templates = useQuery(api.library.templates, {});
  const guides = useQuery(api.library.guideList, {});
  const [tab, setTab] = useState("services");
  const [adding, setAdding] = useState<"service" | "page" | "template" | null>(null);
  const [guide, setGuide] = useState<{ key: string; title: string; body: string } | "new" | null>(null);
  const [service, setService] = useState<Doc<"services"> | null>(null);
  const [sheet, setSheet] = useState<Doc<"worksheetTemplates"> | null>(null);
  const [template, setTemplate] = useState<Doc<"messageTemplates"> | null>(null);
  if (!services || !worksheets || !templates) return <Loading />;
  return (
    <div>
      <PageTitle title="Library" sub="Your services, workbook masters, message templates, and coaching guides. Masters stay separate from each client's copy." />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "services", label: "Services" }, { key: "workbook", label: "Workbook pages" }, { key: "templates", label: "Message templates" }, { key: "guides", label: "Coaching guides" }]} />

      {isCoach && tab !== "guides" && (
        <div className="mb-4">
          <Button tone="primary" onClick={() => setAdding(tab === "services" ? "service" : tab === "workbook" ? "page" : "template")}>
            {tab === "services" ? "Add a service" : tab === "workbook" ? "Add a workbook page" : "Add a message template"}
          </Button>
        </div>
      )}
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
              <RichText text={t.body} className="mt-1 line-clamp-4 text-[13px] text-soft" />
            </li>
          ))}
          <li className="text-[13px] text-soft">These are drafts for review, not automated messages. Use them from a client&rsquo;s message thread.</li>
        </ul>
      )}

      {tab === "guides" && (
        <div>
          {isCoach && <div className="mb-4"><Button tone="primary" onClick={() => setGuide("new")}>Add a guide</Button></div>}
          <div className="grid gap-5 lg:grid-cols-2">
            {(guides ?? []).map((g) => (
              <Panel key={g.key} title={g.title} aside={isCoach ? <Button small onClick={() => setGuide({ key: g.key, title: g.title, body: g.body })}>Edit</Button> : undefined}>
                <RichText text={g.body} className="text-sm" />
              </Panel>
            ))}
          </div>
        </div>
      )}

      <Modal open={!!service} onClose={() => setService(null)} title={service ? `Edit ${service.name}` : ""} wide>{service && <ServiceEditor s={service} onClose={() => setService(null)} />}</Modal>
      <Modal open={!!sheet} onClose={() => setSheet(null)} title={sheet?.title ?? ""} wide>{sheet && <WorksheetEditor w={sheet} canEdit={isCoach} onClose={() => setSheet(null)} />}</Modal>
      <Modal open={adding === "service"} onClose={() => setAdding(null)} title="Add a service" wide>{adding === "service" && <AddService onClose={() => setAdding(null)} />}</Modal>
      <Modal open={adding === "page"} onClose={() => setAdding(null)} title="Add a workbook page" wide>{adding === "page" && <AddWorksheet onClose={() => setAdding(null)} />}</Modal>
      <Modal open={adding === "template"} onClose={() => setAdding(null)} title="Add a message template" wide>{adding === "template" && <AddTemplate onClose={() => setAdding(null)} />}</Modal>
      <Modal open={guide !== null} onClose={() => setGuide(null)} title={guide === "new" ? "Add a guide" : "Edit guide"} wide>{guide !== null && <GuideEditor guide={guide === "new" ? null : guide} onClose={() => setGuide(null)} />}</Modal>
      <Modal open={!!template} onClose={() => setTemplate(null)} title={template?.name ?? ""} wide>{template && <TemplateEditor t={template} canEdit={isCoach} onClose={() => setTemplate(null)} />}</Modal>
    </div>
  );
}
