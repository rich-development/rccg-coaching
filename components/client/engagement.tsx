"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Empty, Field, Input, KeyValue, Meter, Modal, Panel, SafeLink, Select, TextArea, useAct, Visibility } from "@/components/ui";
import { isoLabel, money, todayIso, words } from "@/lib/format";
import { useCan } from "@/components/role";
import type { Detail, Engagement } from "./types";

type Permission = "not_asked" | "granted" | "declined";
type Payment = "unpaid" | "partial" | "paid" | "refunded" | "waived";

const statusTone = { onboarding: "gold", active: "moss", paused: "neutral", completed: "pine", cancelled: "clay" } as const;

function StartEngagement({ clientId, previous, onDone }: { clientId: Id<"clients">; previous?: Engagement; onDone: () => void }) {
  const services = useQuery(api.library.services, {});
  const create = useMutation(api.engagements.create);
  const { act, busy } = useAct();
  const coaching = (services ?? []).filter((s) => s.active && s.kind !== "coworking" && s.kind !== "discovery");
  const [serviceKey, setServiceKey] = useState(previous ? "keep_moving" : "structure");
  const [startDate, setStartDate] = useState(todayIso());
  const [arrangement, setArrangement] = useState("");
  const [goal, setGoal] = useState(previous?.next30Plan ?? "");
  const chosen = coaching.find((s) => s.key === serviceKey);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await act(
            () => create({ clientId, serviceKey, startDate, paymentArrangement: arrangement || undefined, goal: goal || undefined, previousEngagementId: previous?._id }),
            "Engagement started",
          )
        )
          onDone();
      }}
    >
      <Field label="Service">
        <Select value={serviceKey} onChange={(e) => setServiceKey(e.target.value)}>
          {coaching.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name} ({s.priceNote})
            </option>
          ))}
        </Select>
      </Field>
      {chosen && (
        <p className="rounded-md bg-gold-50 p-3 text-[13px] text-soft">
          {chosen.description} {chosen.supportTerms} These terms are saved with her engagement. Changing the service later will not change what she agreed to.
        </p>
      )}
      <Field label="Start date">
        <Input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </Field>
      <Field label="Payment arrangement" hint="Example: two payments of $347.50. Leave blank for paid in full before the first session.">
        <Input value={arrangement} onChange={(e) => setArrangement(e.target.value)} maxLength={400} />
      </Field>
      <Field label="Coaching goal" hint="You can sharpen this together in the first session.">
        <TextArea value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={2000} />
      </Field>
      <Button type="submit" tone="primary" disabled={busy || !chosen}>
        Start engagement
      </Button>
    </form>
  );
}

function Terms({ e, isCoach }: { e: Engagement; isCoach: boolean }) {
  const update = useMutation(api.engagements.updateTerms);
  const { act, busy } = useAct();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    price: (e.priceCents / 100).toString(),
    sessionsIncluded: e.sessionsIncluded.toString(),
    sessionMinutes: e.sessionMinutes.toString(),
    supportTerms: e.supportTerms,
    supportChannel: e.supportChannel,
    responseWindow: e.responseWindow,
    scopeNote: e.scopeNote ?? "",
    startDate: e.startDate,
    endDate: e.endDate ?? "",
    paymentArrangement: e.paymentArrangement,
    paymentLink: e.paymentLink ?? "",
    agreementStatus: e.agreementStatus,
    agreementUrl: e.agreementUrl ?? "",
  });
  const set = (k: keyof typeof v) => (ev: { target: { value: string } }) => setV((old) => ({ ...old, [k]: ev.target.value }));
  return (
    <Panel title="Agreed terms" tone="shared" aside={isCoach ? <Button small onClick={() => setOpen(true)}>Edit terms</Button> : undefined}>
      <dl>
        <KeyValue label="Price">{money(e.priceCents)}</KeyValue>
        <KeyValue label="Sessions">
          {e.sessionsIncluded} sessions, {e.sessionMinutes} minutes each
        </KeyValue>
        <KeyValue label="Dates">
          {isoLabel(e.startDate)}
          {e.endDate ? ` to ${isoLabel(e.endDate)}` : ""}
        </KeyValue>
        <KeyValue label="Between sessions">{e.supportTerms}</KeyValue>
        <KeyValue label="Contact channel">
          {e.supportChannel}. Reply {e.responseWindow.toLowerCase()}.
        </KeyValue>
        <KeyValue label="Payment plan">{e.paymentArrangement}</KeyValue>
        <KeyValue label="Agreement">
          <span className="capitalize">{words(e.agreementStatus)}</span> {e.agreementUrl && <SafeLink href={e.agreementUrl}>Open</SafeLink>}
        </KeyValue>
        {e.scopeNote && <KeyValue label="Scope note">{e.scopeNote}</KeyValue>}
      </dl>
      <p className="mt-2 text-[13px] text-soft">Hands-on setup, website work, or ongoing administration need a separate scope and price.</p>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit agreed terms" wide>
        <p className="mb-4 text-sm text-soft">Only change these when you and the client have agreed to the change.</p>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (ev) => {
            ev.preventDefault();
            const ok = await act(
              () =>
                update({
                  id: e._id,
                  priceCents: Math.round(Number(v.price) * 100),
                  sessionsIncluded: Number(v.sessionsIncluded),
                  sessionMinutes: Number(v.sessionMinutes),
                  supportTerms: v.supportTerms,
                  supportChannel: v.supportChannel,
                  responseWindow: v.responseWindow,
                  scopeNote: v.scopeNote || undefined,
                  startDate: v.startDate,
                  endDate: v.endDate || undefined,
                  paymentArrangement: v.paymentArrangement,
                  paymentLink: v.paymentLink || undefined,
                  agreementStatus: v.agreementStatus,
                  agreementUrl: v.agreementUrl || undefined,
                }),
              "Terms saved",
            );
            if (ok) setOpen(false);
          }}
        >
          <Field label="Price (dollars)"><Input type="number" min="0" step="0.01" value={v.price} onChange={set("price")} /></Field>
          <Field label="Sessions included"><Input type="number" min="1" value={v.sessionsIncluded} onChange={set("sessionsIncluded")} /></Field>
          <Field label="Minutes per session"><Input type="number" min="5" value={v.sessionMinutes} onChange={set("sessionMinutes")} /></Field>
          <Field label="Contact channel"><Input value={v.supportChannel} onChange={set("supportChannel")} /></Field>
          <Field label="Start date"><Input type="date" value={v.startDate} onChange={set("startDate")} /></Field>
          <Field label="End date"><Input type="date" value={v.endDate} onChange={set("endDate")} /></Field>
          <Field label="Response window"><Input value={v.responseWindow} onChange={set("responseWindow")} /></Field>
          <Field label="Agreement">
            <Select value={v.agreementStatus} onChange={(ev) => setV((old) => ({ ...old, agreementStatus: ev.target.value as typeof v.agreementStatus }))}>
              <option value="not_sent">Not sent</option>
              <option value="sent">Sent</option>
              <option value="signed">Signed</option>
            </Select>
          </Field>
          <Field label="Between-session support" className="sm:col-span-2"><TextArea value={v.supportTerms} onChange={set("supportTerms")} /></Field>
          <Field label="Payment arrangement" className="sm:col-span-2"><Input value={v.paymentArrangement} onChange={set("paymentArrangement")} /></Field>
          <Field label="Stripe payment link" hint="Shown in her portal while a balance is due."><Input type="url" value={v.paymentLink} onChange={set("paymentLink")} placeholder="https://" /></Field>
          <Field label="Agreement link"><Input type="url" value={v.agreementUrl} onChange={set("agreementUrl")} placeholder="https://" /></Field>
          <Field label="Scope note" className="sm:col-span-2"><TextArea value={v.scopeNote} onChange={set("scopeNote")} /></Field>
          <div className="sm:col-span-2"><Button type="submit" tone="primary" disabled={busy}>Save terms</Button></div>
        </form>
      </Modal>
    </Panel>
  );
}

function PaymentPanel({ e }: { e: Engagement }) {
  const record = useMutation(api.engagements.recordPayment);
  const { act, busy } = useAct();
  const [status, setStatus] = useState<Payment>(e.paymentStatus);
  const [amount, setAmount] = useState((e.amountPaidCents / 100).toString());
  const [note, setNote] = useState(e.paymentNote ?? "");
  const due = Math.max(0, e.priceCents - e.amountPaidCents);
  return (
    <Panel title="Payment" aside={<Badge tone={e.paymentStatus === "paid" || e.paymentStatus === "waived" ? "moss" : e.paymentStatus === "refunded" ? "neutral" : "clay"}>{words(e.paymentStatus)}</Badge>}>
      <p className="mb-3 text-[13px] text-soft">
        {money(e.amountPaidCents)} received of {money(e.priceCents)}
        {due > 0 && e.paymentStatus !== "waived" ? `. ${money(due)} still due.` : "."} Confirm in Stripe before you record it here. This screen never charges a card.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Status">
          <Select
            value={status}
            onChange={(ev) => {
              const next = ev.target.value as Payment;
              setStatus(next);
              if (next === "paid") setAmount((e.priceCents / 100).toString());
            }}
          >
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partly paid</option>
            <option value="paid">Paid in full</option>
            <option value="waived">Waived</option>
            <option value="refunded">Refunded</option>
          </Select>
        </Field>
        <Field label="Amount received"><Input type="number" min="0" step="0.01" value={amount} onChange={(ev) => setAmount(ev.target.value)} /></Field>
        <Field label="Note"><Input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Stripe receipt, date" maxLength={600} /></Field>
      </div>
      <div className="mt-3">
        <Button small tone="primary" disabled={busy} onClick={() => act(() => record({ id: e._id, status, amountPaidCents: Math.round(Number(amount) * 100), note: note || undefined }), "Payment recorded")}>
          Record confirmed payment
        </Button>
      </div>
    </Panel>
  );
}

function Permissions({ e }: { e: Engagement }) {
  const save = useMutation(api.engagements.setPermissions);
  const { act, busy } = useAct();
  const [p, setP] = useState({ recordingPermission: e.recordingPermission, transcriptionPermission: e.transcriptionPermission, aiPermission: e.aiPermission });
  const row = (key: keyof typeof p, label: string, hint: string) => (
    <Field label={label} hint={hint}>
      <Select value={p[key]} onChange={(ev) => setP({ ...p, [key]: ev.target.value as Permission })}>
        <option value="not_asked">Not asked yet</option>
        <option value="granted">She agreed</option>
        <option value="declined">She declined</option>
      </Select>
    </Field>
  );
  return (
    <Panel title="Recording, transcript, and AI permissions">
      <p className="mb-3 text-[13px] text-soft">Three separate choices, for one-on-one sessions only. Co-working is never recorded or transcribed.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {row("recordingPermission", "Recording", "May sessions be recorded?")}
        {row("transcriptionPermission", "Transcript", "May a transcript be kept?")}
        {row("aiPermission", "AI assistance", "May AI help draft prep and recaps?")}
      </div>
      <div className="mt-3">
        <Button small tone="primary" disabled={busy} onClick={() => act(() => save({ id: e._id, ...p }), "Permissions saved")}>
          Save permissions
        </Button>
      </div>
    </Panel>
  );
}

function Goal({ e }: { e: Engagement }) {
  const save = useMutation(api.engagements.setGoal);
  const { act, busy } = useAct();
  const [g, setG] = useState({ goal: e.goal ?? "", measureName: e.measureName ?? "", measureStart: e.measureStart ?? "", measureTarget: e.measureTarget ?? "", measureActual: e.measureActual ?? "" });
  const set = (k: keyof typeof g) => (ev: { target: { value: string } }) => setG((old) => ({ ...old, [k]: ev.target.value }));
  return (
    <Panel title="Goal and progress measure" tone="shared" aside={<Visibility who="shared" />}>
      <div className="space-y-3">
        <Field label="Coaching goal"><TextArea value={g.goal} onChange={set("goal")} maxLength={2000} /></Field>
        <Field label="What you can both observe" hint="Example: inquiries followed up, protected work sessions completed, a process written and used.">
          <Input value={g.measureName} onChange={set("measureName")} maxLength={300} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Starting point"><Input value={g.measureStart} onChange={set("measureStart")} maxLength={300} /></Field>
          <Field label="Target"><Input value={g.measureTarget} onChange={set("measureTarget")} maxLength={300} /></Field>
          <Field label="Actual so far"><Input value={g.measureActual} onChange={set("measureActual")} maxLength={300} /></Field>
        </div>
        <Button
          small
          tone="primary"
          disabled={busy}
          onClick={() =>
            act(
              () =>
                save({
                  id: e._id,
                  goal: g.goal || undefined,
                  measureName: g.measureName || undefined,
                  measureStart: g.measureStart || undefined,
                  measureTarget: g.measureTarget || undefined,
                  measureActual: g.measureActual || undefined,
                }),
              "Goal saved",
            )
          }
        >
          Save goal
        </Button>
      </div>
    </Panel>
  );
}

function Completion({ e, onRenew }: { e: Engagement; onRenew: () => void }) {
  const complete = useMutation(api.engagements.complete);
  const { act, busy } = useAct();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    startingPoint: e.startingPoint ?? e.measureStart ?? "",
    currentResult: e.currentResult ?? "",
    nowIndependent: e.nowIndependent ?? "",
    next30Plan: e.next30Plan ?? "",
    supportChoice: e.supportChoice ?? "",
    measureActual: e.measureActual ?? "",
    renewalDecision: (e.renewalDecision ?? "undecided") as "undecided" | "renewing" | "not_renewing",
  });
  const set = (k: keyof typeof v) => (ev: { target: { value: string } }) => setV((old) => ({ ...old, [k]: ev.target.value }));
  const save = (markComplete: boolean) =>
    act(
      () =>
        complete({
          id: e._id,
          startingPoint: v.startingPoint || undefined,
          currentResult: v.currentResult || undefined,
          nowIndependent: v.nowIndependent || undefined,
          next30Plan: v.next30Plan || undefined,
          supportChoice: v.supportChoice || undefined,
          measureActual: v.measureActual || undefined,
          renewalDecision: v.renewalDecision,
          markComplete,
        }),
      markComplete ? "Engagement completed" : "Review saved",
    );
  return (
    <Panel title="Completion review" aside={e.status === "completed" ? <Badge tone="pine">Completed {isoLabel(e.completedOn)}</Badge> : undefined}>
      {e.status === "completed" || e.currentResult ? (
        <dl className="mb-3">
          <KeyValue label="Starting point">{e.startingPoint}</KeyValue>
          <KeyValue label="Result now">{e.currentResult}</KeyValue>
          <KeyValue label="Now independent">{e.nowIndependent}</KeyValue>
          <KeyValue label="Next 30 days">{e.next30Plan}</KeyValue>
          <KeyValue label="Support choice">{e.supportChoice}</KeyValue>
          <KeyValue label="Continuing?">{e.renewalDecision ? words(e.renewalDecision) : ""}</KeyValue>
        </dl>
      ) : (
        <p className="mb-3 text-sm text-soft">At the end, compare where she started with where she is now and agree on the next 30 days. Deciding on more support is a separate choice.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button small onClick={() => setOpen(true)}>{e.status === "completed" ? "Edit review" : "Open completion review"}</Button>
        {e.status === "completed" && e.renewalDecision === "renewing" && <Button small tone="primary" onClick={onRenew}>Start her next engagement</Button>}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Completion review" wide>
        <div className="space-y-4">
          <Field label="Where she started"><TextArea value={v.startingPoint} onChange={set("startingPoint")} /></Field>
          <Field label="Where she is now, with evidence"><TextArea value={v.currentResult} onChange={set("currentResult")} /></Field>
          {e.measureName && (
            <Field label={`${e.measureName}: actual result`} hint={`Started at ${e.measureStart ?? "?"}, target ${e.measureTarget ?? "?"}`}>
              <Input value={v.measureActual} onChange={set("measureActual")} />
            </Field>
          )}
          <Field label="What she can now do on her own"><TextArea value={v.nowIndependent} onChange={set("nowIndependent")} /></Field>
          <Field label="Her next 30-day focus and first action"><TextArea value={v.next30Plan} onChange={set("next30Plan")} /></Field>
          <Field label="Her support choice and your follow-up" hint="Offer ongoing coaching only when the need is clear."><TextArea value={v.supportChoice} onChange={set("supportChoice")} /></Field>
          <Field label="Is she continuing?">
            <Select value={v.renewalDecision} onChange={(ev) => setV((old) => ({ ...old, renewalDecision: ev.target.value as typeof v.renewalDecision }))}>
              <option value="undecided">Not decided</option>
              <option value="renewing">Yes, continuing</option>
              <option value="not_renewing">No, finishing here</option>
            </Select>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={async () => { if (await save(false)) setOpen(false); }}>Save review</Button>
            {e.status !== "completed" && (
              <Button tone="primary" disabled={busy} onClick={async () => { if (await save(true)) setOpen(false); }}>
                Save and mark engagement complete
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </Panel>
  );
}

export function EngagementTab({ data, isCoach }: { data: Detail; isCoach: boolean }) {
  const canPay = useCan("payments");
  const toggle = useMutation(api.engagements.toggleChecklist);
  const setStatus = useMutation(api.engagements.setStatus);
  const { act, busy } = useAct();
  const [starting, setStarting] = useState<{ previous?: Engagement } | null>(null);
  const current =
    data.engagements.find((e) => e.status === "active") ??
    data.engagements.find((e) => e.status === "onboarding") ??
    data.engagements.find((e) => e.status === "paused") ??
    data.engagements[0];
  const [selected, setSelected] = useState<string | null>(null);
  const e = data.engagements.find((x) => x._id === selected) ?? current;
  const hasOpen = data.engagements.some((x) => x.status === "active" || x.status === "onboarding" || x.status === "paused");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {data.engagements.map((x) => (
            <button
              key={x._id}
              type="button"
              onClick={() => setSelected(x._id)}
              className={`rounded-md border px-3 py-1.5 text-sm ${e && x._id === e._id ? "border-ink bg-ink text-white" : "border-line bg-paper text-soft hover:text-ink"}`}
            >
              {x.serviceName}
              {x.cycle > 1 ? `, cycle ${x.cycle}` : ""} ({x.status})
            </button>
          ))}
        </div>
        <Button tone={hasOpen ? "quiet" : "primary"} onClick={() => setStarting({})}>
          Start an engagement
        </Button>
      </div>

      {!e ? (
        <Empty>No engagement yet. Start one when she has chosen a service.</Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-paper px-4 py-3">
            <h2 className="text-xl">{e.serviceName}</h2>
            <Badge tone={statusTone[e.status]}>{e.status}</Badge>
            <Meter used={e.balance.used} total={e.balance.included} />
            <span className="text-sm text-soft">
              {e.balance.remaining} remaining, {e.balance.scheduled} booked
            </span>
            {isCoach && e.status !== "completed" && e.status !== "cancelled" && (
              <span className="ml-auto flex gap-2">
                {e.status === "paused" ? (
                  <Button small disabled={busy} onClick={() => act(() => setStatus({ id: e._id, status: "active" }), "Engagement resumed")}>Resume</Button>
                ) : (
                  <Button small disabled={busy} onClick={() => act(() => setStatus({ id: e._id, status: "paused" }), "Engagement paused")}>Pause</Button>
                )}
                <Button small tone="danger" disabled={busy} onClick={() => { if (window.confirm("Cancel this engagement? Her history is kept.")) act(() => setStatus({ id: e._id, status: "cancelled" }), "Engagement cancelled"); }}>
                  Cancel
                </Button>
              </span>
            )}
          </div>
          {e.status === "paused" && <p className="rounded-md bg-mist p-3 text-sm text-soft">Paused {isoLabel(e.pausedOn)}. {e.pauseReason}</p>}

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Onboarding checklist" aside={<span className="text-[13px] text-soft">{e.checklist.filter((c) => c.done).length} of {e.checklist.length} done</span>}>
              <ul className="space-y-1.5">
                {e.checklist.map((c) => (
                  <li key={c.key}>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded px-1 py-1 text-sm hover:bg-mist">
                      <input type="checkbox" className="mt-1 accent-[#1d4a43]" checked={c.done} disabled={busy} onChange={(ev) => act(() => toggle({ id: e._id, key: c.key, done: ev.target.checked }))} />
                      <span className={c.done ? "text-soft line-through decoration-line" : ""}>{c.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {e.status === "onboarding" && <p className="mt-3 text-[13px] text-soft">The engagement becomes active when every step is done.</p>}
            </Panel>
            <Terms key={`t${e._id}`} e={e} isCoach={canPay} />
            {canPay && <PaymentPanel key={`p${e._id}`} e={e} />}
            <Goal key={`g${e._id}`} e={e} />
            {isCoach && <Permissions key={`m${e._id}`} e={e} />}
            {isCoach && <Completion key={`c${e._id}`} e={e} onRenew={() => setStarting({ previous: e })} />}
          </div>
        </>
      )}

      <Modal open={starting !== null} onClose={() => setStarting(null)} title={starting?.previous ? "Start her next engagement" : "Start an engagement"}>
        {starting && <StartEngagement clientId={data.client._id} previous={starting.previous} onDone={() => { setStarting(null); setSelected(null); }} />}
      </Modal>
    </div>
  );
}
