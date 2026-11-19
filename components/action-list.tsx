"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Field, Input, Modal, Select, TextArea, useAct } from "@/components/ui";
import { isoLabel, todayIso, words } from "@/lib/format";

type Action = Doc<"actions">;
const tone = { open: "neutral", in_progress: "gold", completed: "moss", revised: "neutral", dropped: "neutral" } as const;

export function ActionRow({ a, clientName }: { a: Action; clientName: string }) {
  const setStatus = useMutation(api.actions.setStatus);
  const revise = useMutation(api.actions.revise);
  const { act, busy } = useAct();
  const [revising, setRevising] = useState(false);
  const [r, setR] = useState({ whatHappened: "", title: a.title, dueDate: todayIso(7), doneLooksLike: a.doneLooksLike ?? "" });
  const overdue = !!a.dueDate && a.dueDate < todayIso() && (a.status === "open" || a.status === "in_progress");
  const live = a.status === "open" || a.status === "in_progress";
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-medium ${live ? "text-ink" : "text-soft"}`}>{a.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-soft">
            <span>{a.owner === "client" ? clientName : "Tamika"}</span>
            {a.dueDate && <span className={overdue ? "font-medium text-clay" : ""}>Due {isoLabel(a.dueDate)}{overdue ? ", past due" : ""}</span>}
            {a.owner === "coach" && !a.visibleToClient && <Badge tone="ink">Only you see this</Badge>}
          </div>
          {a.doneLooksLike && <p className="mt-1 text-[13px] text-soft">Finished looks like: {a.doneLooksLike}</p>}
          {a.clientNote && <p className="mt-1 rounded bg-gold-50 px-2 py-1 text-[13px]">She wrote: {a.clientNote}</p>}
          {a.obstacle && <p className="mt-1 text-[13px] text-soft">Obstacle: {a.obstacle}</p>}
          {a.reviewNote && <p className="mt-1 text-[13px] text-soft">What happened: {a.reviewNote}</p>}
          {a.evidence && <p className="mt-1 text-[13px] text-soft">Evidence: {a.evidence}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={tone[a.status]}>{words(a.status)}</Badge>
          {live && (
            <>
              <Select
                aria-label="Change status"
                value=""
                disabled={busy}
                className="!w-auto !py-1 text-[13px]"
                onChange={(e) => {
                  const status = e.target.value as Action["status"];
                  if (status) act(() => setStatus({ id: a._id, status }), "Updated");
                }}
              >
                <option value="">Mark as</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="dropped">No longer needed</option>
              </Select>
              <Button small onClick={() => setRevising(true)}>Revise</Button>
            </>
          )}
        </div>
      </div>
      <Modal open={revising} onClose={() => setRevising(false)} title="Revise this action">
        <p className="mb-4 text-sm text-soft">Ask what happened before adding more work. Was it unclear, too large, waiting on someone else, or no longer useful? The original stays in her history.</p>
        <div className="space-y-3">
          <Field label="What happened"><TextArea value={r.whatHappened} onChange={(e) => setR({ ...r, whatHappened: e.target.value })} maxLength={1000} /></Field>
          <Field label="Revised action"><Input value={r.title} onChange={(e) => setR({ ...r, title: e.target.value })} maxLength={400} /></Field>
          <Field label="New due date"><Input type="date" value={r.dueDate} onChange={(e) => setR({ ...r, dueDate: e.target.value })} /></Field>
          <Field label="What finished looks like"><Input value={r.doneLooksLike} onChange={(e) => setR({ ...r, doneLooksLike: e.target.value })} maxLength={600} /></Field>
          <Button
            tone="primary"
            disabled={busy || !r.title.trim()}
            onClick={async () => {
              if (await act(() => revise({ id: a._id, whatHappened: r.whatHappened, title: r.title, dueDate: r.dueDate || undefined, doneLooksLike: r.doneLooksLike || undefined }), "Action revised")) setRevising(false);
            }}
          >
            Save revised action
          </Button>
        </div>
      </Modal>
    </li>
  );
}

export function AddAction({ clientId, sessionId, clientName, defaultOwner = "client" }: { clientId: Id<"clients">; sessionId?: Id<"sessions">; clientName: string; defaultOwner?: "client" | "coach" }) {
  const create = useMutation(api.actions.create);
  const { act, busy } = useAct();
  const blank = { title: "", owner: defaultOwner, dueDate: "", doneLooksLike: "", obstacle: "", smallerStep: "", visibleToClient: false };
  const [v, setV] = useState(blank);
  return (
    <form
      className="grid gap-3 sm:grid-cols-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await act(
          () =>
            create({
              clientId,
              sessionId,
              title: v.title,
              owner: v.owner,
              dueDate: v.dueDate || undefined,
              doneLooksLike: v.doneLooksLike || undefined,
              obstacle: v.obstacle || undefined,
              smallerStep: v.smallerStep || undefined,
              visibleToClient: v.visibleToClient,
            }),
          "Action added",
        );
        if (ok) setV({ ...blank, owner: v.owner });
      }}
    >
      <Field label="Action" className="sm:col-span-6"><Input required value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={400} placeholder="What will happen" /></Field>
      <Field label="Who owns it" className="sm:col-span-2">
        <Select value={v.owner} onChange={(e) => setV({ ...v, owner: e.target.value as "client" | "coach" })}>
          <option value="client">{clientName}</option>
          <option value="coach">Tamika</option>
        </Select>
      </Field>
      <Field label="Due date" className="sm:col-span-2"><Input type="date" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} /></Field>
      <Field label="What finished looks like" className="sm:col-span-2"><Input value={v.doneLooksLike} onChange={(e) => setV({ ...v, doneLooksLike: e.target.value })} maxLength={600} /></Field>
      {v.owner === "client" ? (
        <>
          <Field label="Likely obstacle" className="sm:col-span-3"><Input value={v.obstacle} onChange={(e) => setV({ ...v, obstacle: e.target.value })} maxLength={600} /></Field>
          <Field label="A smaller first step" className="sm:col-span-3"><Input value={v.smallerStep} onChange={(e) => setV({ ...v, smallerStep: e.target.value })} maxLength={600} /></Field>
        </>
      ) : (
        <label className="flex items-center gap-2 text-sm sm:col-span-6">
          <input type="checkbox" checked={v.visibleToClient} onChange={(e) => setV({ ...v, visibleToClient: e.target.checked })} /> Show this follow-up to {clientName} in her portal
        </label>
      )}
      <div className="sm:col-span-6"><Button type="submit" tone="primary" small disabled={busy}>Add action</Button></div>
    </form>
  );
}
