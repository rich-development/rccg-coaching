"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ActionRow, AddAction } from "@/components/action-list";
import { Badge, Button, Empty, Field, Input, KeyValue, LinkButton, Loading, Meter, Panel, SafeLink, TextArea, useAct, Visibility } from "@/components/ui";
import { dateTime, isoLabel, STAGE_LABEL, todayIso, words } from "@/lib/format";

type Workspace = NonNullable<FunctionReturnType<typeof api.sessions.workspace>>;
type Prep = FunctionReturnType<typeof api.briefs.prep>;

const statusTone = { scheduled: "gold", completed: "moss", rescheduled: "neutral", missed: "clay", cancelled: "neutral" } as const;

function Sourced({ items, empty }: { items: { text: string; source: string }[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-faint">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((line, i) => (
        <li key={i} className="text-sm">
          <span className="whitespace-pre-wrap">{line.text}</span>
          <span className="ml-2 whitespace-nowrap text-xs text-gold-700">{line.source}</span>
        </li>
      ))}
    </ul>
  );
}

function PrepBrief({ ws, prep, onUseQuestions }: { ws: Workspace; prep: Prep; onUseQuestions: (q: string) => void }) {
  const assign = useMutation(api.worksheets.assign);
  const draft = useAction(api.ai.draft);
  const { act, busy } = useAct();
  const sub = "mb-1.5 mt-4 text-[13px] font-semibold text-ink first:mt-0";
  return (
    <Panel title="Prepare" tone="private" aside={<Visibility who="private" />}>
      <p className="mb-4 text-[13px] text-soft">Built from her record. Each line shows where it came from. Co-working conversations are never used here.</p>
      <h3 className={sub}>Last agreed plan</h3>
      <Sourced items={prep.lastPlan} empty="This is the first meeting, or no recap has been approved yet." />
      <h3 className={sub}>What changed since then</h3>
      <Sourced items={prep.changed} empty="No updates on record since the last meeting." />
      <h3 className={sub}>Open commitments</h3>
      {prep.commitments.length === 0 ? (
        <p className="text-sm text-faint">None open.</p>
      ) : (
        <ul className="space-y-1.5">
          {prep.commitments.map((c) => (
            <li key={c._id} className="text-sm">
              {c.title}
              {c.dueDate && <span className={`ml-2 text-[13px] ${c.overdue ? "font-medium text-clay" : "text-soft"}`}>due {isoLabel(c.dueDate)}{c.overdue ? ", past due" : ""}</span>}
              <span className="ml-2 text-xs text-gold-700">{c.source}</span>
            </li>
          ))}
        </ul>
      )}
      <h3 className={sub}>Obstacles she named</h3>
      <Sourced items={prep.obstacles} empty="None on record." />
      <h3 className={sub}>Three questions worth asking</h3>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm">
        {prep.questions.map((q, i) => (
          <li key={i}>{q}</li>
        ))}
      </ol>
      <div className="mt-2">
        <Button small onClick={() => onUseQuestions(prep.questions.map((q, i) => `${i + 1}. ${q}`).join("\n"))}>Copy these into my notes</Button>
        <span className="ml-3 text-[13px] text-soft">Edit them freely. Let her do the thinking.</span>
      </div>
      {prep.worksheet && (
        <>
          <h3 className={sub}>Suggested exercise</h3>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              <strong className="font-medium">{prep.worksheet.title}.</strong> {prep.worksheet.reason}
            </span>
            <Button small disabled={busy} onClick={() => act(() => assign({ clientId: ws.client._id, templateKey: prep.worksheet!.key, engagementId: ws.engagement._id }), "Page assigned to her portal")}>
              Assign it
            </Button>
          </div>
        </>
      )}
      {prep.missing.length > 0 && (
        <>
          <h3 className={sub}>Missing from the record</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-clay">
            {prep.missing.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-5 rounded-md border border-line bg-mist p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button small tone="gold" disabled={busy || !prep.ai.available} onClick={() => act(() => draft({ sessionId: ws.session._id, kind: "prep", today: todayIso() }), "AI brief ready for your review")}>
            {busy ? "Drafting…" : "Draft an AI brief"}
          </Button>
          <span className="text-[13px] text-soft">{prep.ai.reason ?? "Optional. Names and contact details are removed before anything is sent. Each use has a small cost."}</span>
        </div>
        {prep.aiPrep && (
          <div className="mt-3">
            <div className="mb-1 text-xs text-soft">AI draft from {dateTime(prep.aiPrep.createdAt)}. Review before relying on it. Sources: {prep.aiPrep.sources.join("; ") || "none"}.</div>
            <div className="whitespace-pre-wrap rounded bg-paper p-3 text-sm">{prep.aiPrep.content}</div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Notes({ ws, injected }: { ws: Workspace; injected: string | null }) {
  const save = useMutation(api.sessions.saveNotes);
  const { act, busy } = useAct();
  const n = ws.notes;
  const [v, setV] = useState({
    prepQuestions: n?.prepQuestions ?? "",
    progressSince: n?.progressSince ?? "",
    outcomeAgreed: n?.outcomeAgreed ?? "",
    questionsAndDecisions: n?.questionsAndDecisions ?? "",
    obstacle: n?.obstacle ?? "",
    interpretation: n?.interpretation ?? "",
    coachFollowUp: n?.coachFollowUp ?? "",
  });
  const [seen, setSeen] = useState<string | null>(null);
  if (injected && injected !== seen) {
    setSeen(injected);
    setV((old) => ({ ...old, prepQuestions: old.prepQuestions ? `${old.prepQuestions}\n${injected}` : injected }));
  }
  const persist = (quiet: boolean) => {
    const payload = Object.fromEntries(Object.entries(v).map(([k, val]) => [k, val.trim() ? val : undefined]));
    return act(() => save({ id: ws.session._id, ...payload }), quiet ? undefined : "Notes saved");
  };
  const area = (key: keyof typeof v, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <TextArea value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} onBlur={() => persist(true)} />
    </Field>
  );
  return (
    <Panel title="Private coach notes" tone="private" aside={<Visibility who="private" />}>
      <div className="space-y-3">
        {area("prepQuestions", "Questions I want to ask")}
        {area("progressSince", "Her goal and observable progress since last time")}
        {area("outcomeAgreed", "Outcome agreed for today")}
        {area("questionsAndDecisions", "Questions explored and her decisions")}
        {area("obstacle", "Obstacle or support need to revisit")}
        {area("interpretation", "My interpretation", "Keep observations factual above. Put your read on things here.")}
        {area("coachFollowUp", "My follow-up")}
        <div className="flex items-center gap-3">
          <Button small tone="primary" disabled={busy} onClick={() => persist(false)}>Save notes</Button>
          <span className="text-[13px] text-soft">Notes also save when you leave a box. They are never shown to her.</span>
        </div>
      </div>
    </Panel>
  );
}

function Transcript({ ws }: { ws: Workspace }) {
  const attach = useMutation(api.sessions.attachTranscript);
  const remove = useMutation(api.sessions.removeTranscript);
  const setStatus = useMutation(api.sessions.setTranscriptStatus);
  const { act, busy } = useAct();
  const [text, setText] = useState("");
  const [show, setShow] = useState(false);
  const allowed = ws.engagement.transcriptionPermission === "granted";
  const label = { not_permitted: "Not permitted", pending: "Pending", ready: "Ready", unavailable: "Unavailable" }[ws.session.transcriptStatus];
  return (
    <Panel title="Transcript" tone="private" aside={<Badge tone={ws.session.transcriptStatus === "ready" ? "moss" : ws.session.transcriptStatus === "pending" ? "gold" : "neutral"}>{label}</Badge>}>
      {!allowed ? (
        <p className="text-sm text-soft">
          {ws.client.preferredName} has {ws.engagement.transcriptionPermission === "declined" ? "declined transcription" : "not been asked about transcription"}. Notes, the action plan, and follow-up all work without one.
        </p>
      ) : ws.transcript ? (
        <div className="space-y-3">
          <p className="text-sm text-soft">
            From {ws.transcript.source}, attached {dateTime(ws.transcript.attachedAt)}. {ws.transcript.length.toLocaleString()} characters.
          </p>
          <div className="flex gap-2">
            <Button small onClick={() => setShow(!show)}>{show ? "Hide transcript" : "Read transcript"}</Button>
            <Button small tone="danger" disabled={busy} onClick={() => { if (window.confirm("Delete this transcript? This cannot be undone.")) act(() => remove({ id: ws.session._id }), "Transcript deleted"); }}>
              Delete transcript
            </Button>
          </div>
          {show && <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded bg-mist p-3 text-sm">{ws.transcript.text}</div>}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-soft">Paste the Google Meet transcript for this one-on-one session. It is stored with this client and session only.</p>
          <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste transcript text" className="max-h-60" />
          <div className="flex flex-wrap gap-2">
            <Button small tone="primary" disabled={busy || !text.trim()} onClick={async () => { if (await act(() => attach({ id: ws.session._id, text }), "Transcript attached")) setText(""); }}>
              Attach transcript
            </Button>
            {ws.session.transcriptStatus !== "unavailable" && (
              <Button small disabled={busy} onClick={() => act(() => setStatus({ id: ws.session._id, status: "unavailable" }), "Marked unavailable")}>
                There is no transcript
              </Button>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function Recap({ ws, prep }: { ws: Workspace; prep: Prep | undefined }) {
  const saveDraft = useMutation(api.sessions.saveRecapDraft);
  const approve = useMutation(api.sessions.approveRecap);
  const unshare = useMutation(api.sessions.unshareRecap);
  const draftAi = useAction(api.ai.draft);
  const { act, busy } = useAct();
  const [body, setBody] = useState(ws.recapDraft || ws.session.recapShared || "");
  const name = ws.client.preferredName;

  const fromRecord = () => {
    const acts = ws.sessionActions.filter((a) => a.status !== "dropped" && a.status !== "revised");
    const hers = acts.filter((a) => a.owner === "client");
    const mine = acts.filter((a) => a.owner === "coach" && a.visibleToClient);
    const lines = hers.map((a) => `- ${a.title}${a.dueDate ? `, by ${isoLabel(a.dueDate)}` : " [due date]"}${a.doneLooksLike ? `. Finished looks like: ${a.doneLooksLike}` : ""}`);
    setBody(
      [
        `Hi ${name}, today we focused on ${ws.session.priority ?? "[priority]"}. You decided [decision].`,
        hers.length ? `Your next actions are:\n${lines.join("\n")}` : "Your next action is [action, due date and what finished looks like].",
        mine.length ? `I’ll ${mine.map((a) => a.title.charAt(0).toLowerCase() + a.title.slice(1)).join(", and ")}.` : "",
        `Our next meeting is ${ws.next ? dateTime(ws.next.scheduledAt) : "[date, time and time zone]"}.`,
        "Let me know if I misunderstood a decision or commitment.",
        "Tamika",
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  };

  return (
    <Panel
      title="Recap for the client"
      tone="shared"
      aside={ws.session.recapShared ? <Badge tone="moss">Shared {ws.session.recapApprovedAt ? dateTime(ws.session.recapApprovedAt) : ""}</Badge> : <Badge>Draft. She cannot see it yet</Badge>}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Button small onClick={fromRecord}>Start from today&rsquo;s record</Button>
        <Button
          small
          tone="gold"
          disabled={busy || !prep?.ai.available}
          title={prep?.ai.reason ?? undefined}
          onClick={() => act(() => draftAi({ sessionId: ws.session._id, kind: "recap", today: todayIso() }), "AI recap draft ready below")}
        >
          {busy ? "Working…" : "Draft with AI"}
        </Button>
        {prep && !prep.ai.available && <span className="self-center text-[13px] text-soft">{prep.ai.reason}</span>}
      </div>
      {prep?.aiRecap && (
        <div className="mb-3 rounded-md border border-gold-300 bg-gold-50 p-3">
          <div className="mb-1 text-xs text-soft">AI draft from {dateTime(prep.aiRecap.createdAt)}. Sources: {prep.aiRecap.sources.join("; ") || "none"}.</div>
          <div className="whitespace-pre-wrap text-sm">{prep.aiRecap.content}</div>
          {prep.aiRecap.missing.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-clay">
              {prep.aiRecap.missing.map((m, i) => (
                <li key={i}>Missing: {m}</li>
              ))}
            </ul>
          )}
          <div className="mt-2">
            <Button small onClick={() => setBody(prep.aiRecap!.content)}>Use this draft</Button>
          </div>
        </div>
      )}
      <TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={8000} placeholder="Decisions and commitments only. Not your private notes." aria-label="Recap" />
      <p className="mt-2 text-[13px] text-soft">Anything in [brackets] is a detail still missing. Fill it in or remove it. The recap cannot be shared with a bracket left in.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button small disabled={busy} onClick={() => act(() => saveDraft({ id: ws.session._id, draft: body }), "Draft saved")}>Save draft</Button>
        <Button small tone="primary" disabled={busy || !body.trim()} onClick={() => act(() => approve({ id: ws.session._id, body }), `Recap shared with ${name}`)}>
          {ws.session.recapShared ? "Approve and share the update" : "Approve and share with her"}
        </Button>
        {ws.session.recapShared && (
          <Button small tone="danger" disabled={busy} onClick={() => act(() => unshare({ id: ws.session._id }), "Recap taken back")}>
            Take it back
          </Button>
        )}
      </div>
    </Panel>
  );
}

export default function SessionWorkspace() {
  const { id } = useParams<{ id: string }>();
  const sessionId = id as Id<"sessions">;
  const today = useMemo(() => todayIso(), []);
  const ws = useQuery(api.sessions.workspace, { id: sessionId });
  const prep = useQuery(api.briefs.prep, ws?.isCoach ? { sessionId, today } : "skip");
  const setStatus = useMutation(api.sessions.setStatus);
  const savePriority = useMutation(api.sessions.savePriority);
  const { act, busy } = useAct();
  const [priority, setPriority] = useState<string | null>(null);
  const [injected, setInjected] = useState<string | null>(null);
  const [missedCounts, setMissedCounts] = useState(false);

  if (ws === undefined) return <Loading />;
  if (ws === null) return <Empty>This session was not found.</Empty>;
  const { session: s, client: c, engagement: e } = ws;
  const priorityValue = priority ?? s.priority ?? "";
  const clientActions = ws.sessionActions.filter((a) => a.owner === "client" && a.status !== "dropped" && a.status !== "revised").length;
  const mark = (status: "completed" | "missed" | "rescheduled" | "cancelled" | "scheduled") =>
    act(() => setStatus({ id: s._id, status, countsAgainstBalance: status === "missed" ? missedCounts : undefined }), `Marked ${status}`);

  return (
    <div>
      <Link href={`/coach/clients/${c._id}?tab=sessions`} className="text-sm text-soft underline-offset-2 hover:underline">{c.fullName}</Link>
      <header className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-soft">Today&rsquo;s Coaching</p>
          <h1 className="text-[1.9rem] leading-tight">
            {c.preferredName}, session {s.number} of {e.sessionsIncluded}
          </h1>
          <span className="swash" aria-hidden />
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-soft">
            <span>{dateTime(s.scheduledAt)}, {s.durationMinutes} minutes</span>
            <Badge tone={statusTone[s.status]}>{s.status}</Badge>
            <span>{e.serviceName}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s.format === "virtual" && s.meetLink ? (
            <LinkButton href={s.meetLink} tone="primary" external>Open Google Meet</LinkButton>
          ) : s.format === "virtual" ? (
            <Badge tone="clay">No Meet link on this appointment</Badge>
          ) : (
            <Badge>In person{s.location ? `: ${s.location}` : ""}</Badge>
          )}
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[1fr_19rem]">
        <div className="min-w-0 space-y-5">
          {ws.isCoach && prep && <PrepBrief ws={ws} prep={prep} onUseQuestions={setInjected} />}
          {ws.isCoach && prep === undefined && <Loading label="Building the preparation brief" />}

          <Panel title="Agree on action" tone="shared" aside={<Visibility who="shared" />}>
            <Field label="The one priority for this session">
              <Input value={priorityValue} onChange={(ev) => setPriority(ev.target.value)} onBlur={() => priority !== null && act(() => savePriority({ id: s._id, priority: priority || undefined }))} maxLength={600} placeholder="One main priority" />
            </Field>
            <h3 className="mb-2 mt-5 text-[13px] font-semibold">Actions from this session ({clientActions} of 3 for {c.preferredName})</h3>
            {ws.sessionActions.length === 0 ? (
              <Empty>No actions yet. Agree on up to three, each with an owner, a date, and what finished looks like.</Empty>
            ) : (
              <ul className="-mx-4 divide-y divide-line border-y border-line">
                {ws.sessionActions.map((a) => (
                  <ActionRow key={a._id} a={a} clientName={c.preferredName} />
                ))}
              </ul>
            )}
            <div className="mt-4">
              <AddAction clientId={c._id} sessionId={s._id} clientName={c.preferredName} />
            </div>
            <p className="mt-3 text-[13px] text-soft">Close with ownership: What are you choosing to do? When will you do it? What could get in the way? What support do you need from me?</p>
          </Panel>

          {ws.openActions.length > 0 && (
            <Panel title="Still open from before">
              <p className="mb-3 text-[13px] text-soft">Review these before adding more. Ask what happened, then mark, revise, or drop.</p>
              <ul className="-mx-4 -mb-4 divide-y divide-line border-t border-line">
                {ws.openActions.map((a) => (
                  <ActionRow key={a._id} a={a} clientName={c.preferredName} />
                ))}
              </ul>
            </Panel>
          )}

          {ws.isCoach && <Notes ws={ws} injected={injected} />}

          <Panel title="Close the loop">
            <div className="flex flex-wrap items-center gap-2">
              <Button tone={s.status === "completed" ? "quiet" : "primary"} disabled={busy || s.status === "completed"} onClick={() => mark("completed")}>
                {s.status === "completed" ? "Session completed" : "Mark session completed"}
              </Button>
              <Button disabled={busy} onClick={() => mark("rescheduled")}>Rescheduled</Button>
              <Button disabled={busy} onClick={() => mark("missed")}>Missed</Button>
              <Button disabled={busy} onClick={() => mark("cancelled")}>Cancelled</Button>
              {s.status !== "scheduled" && <Button tone="ghost" disabled={busy} onClick={() => mark("scheduled")}>Undo</Button>}
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-soft">
              <input type="checkbox" checked={missedCounts} onChange={(ev) => setMissedCounts(ev.target.checked)} /> A missed session counts as used (follow her agreement)
            </label>
            <p className="mt-2 text-[13px] text-soft">
              Completed uses one session. Rescheduled does not: book the new time as a new session.
              {ws.next ? ` Next meeting: ${dateTime(ws.next.scheduledAt)}.` : " No next meeting is booked yet."}
            </p>
          </Panel>

          {ws.isCoach && <Transcript ws={ws} />}
          {ws.isCoach ? <Recap key={prep?.aiRecap?._id ?? "r"} ws={ws} prep={prep} /> : <Panel title="Recap"><p className="text-sm text-soft">Tamika writes and approves recaps.</p></Panel>}
        </div>

        <aside className="space-y-5">
          <Panel title="At a glance">
            <Meter used={ws.balance.used} total={ws.balance.included} />
            <p className="mt-1 text-[13px] text-soft">{ws.balance.remaining} remaining after used sessions, {ws.balance.scheduled} booked.</p>
            <dl className="mt-3">
              <KeyValue label="Stage">{c.stage ? STAGE_LABEL[c.stage] : ""}</KeyValue>
              <KeyValue label="Goal">{e.goal}</KeyValue>
              <KeyValue label="Measure">{e.measureName ? `${e.measureName}: ${e.measureActual ?? e.measureStart ?? "?"} of ${e.measureTarget ?? "?"}` : ""}</KeyValue>
              <KeyValue label="Time she has">{c.constraints}</KeyValue>
              <KeyValue label="Support">{e.supportTerms}</KeyValue>
            </dl>
          </Panel>
          <Panel title="Permissions">
            <dl>
              <KeyValue label="Recording">{words(e.recordingPermission)}</KeyValue>
              <KeyValue label="Transcript">{words(e.transcriptionPermission)}</KeyValue>
              <KeyValue label="AI assistance">{words(e.aiPermission)}</KeyValue>
            </dl>
            <Link href={`/coach/clients/${c._id}?tab=engagement`} className="text-[13px] text-pine underline underline-offset-2">Change on her engagement</Link>
          </Panel>
          {ws.previous && (
            <Panel title={`Last time (session ${ws.previous.number})`}>
              <p className="text-[13px] text-soft">{dateTime(ws.previous.scheduledAt)}</p>
              {ws.previous.priority && <p className="mt-1 text-sm">Priority: {ws.previous.priority}</p>}
              {ws.previous.recapShared && <p className="mt-2 whitespace-pre-wrap text-[13px] text-soft">{ws.previous.recapShared}</p>}
              <Link href={`/coach/sessions/${ws.previous._id}`} className="mt-2 inline-block text-[13px] text-pine underline underline-offset-2">Open that session</Link>
            </Panel>
          )}
          <Panel title="Materials">
            <div className="space-y-1.5 text-sm">
              {c.sharedFolderUrl ? <SafeLink href={c.sharedFolderUrl} className="block">Client shared folder</SafeLink> : <span className="block text-soft">No shared folder linked</span>}
              {ws.privateFolderUrl && <SafeLink href={ws.privateFolderUrl} className="block">Private coach folder</SafeLink>}
              <Link href={`/coach/clients/${c._id}?tab=workbook`} className="block text-pine underline underline-offset-2">Workbook pages</Link>
              <Link href={`/coach/inbox?client=${c._id}`} className="block text-pine underline underline-offset-2">Messages</Link>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
