"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { PortalFiles } from "@/components/files";
import { RichText } from "@/components/rich";
import { Badge, Button, Empty, Field, Input, LinkButton, Loading, Meter, Panel, SafeLink, TextArea, useAct } from "@/components/ui";
import { dateTime, dayLabel, isoLabel, shortDate, timeOnly, todayIso } from "@/lib/format";

type Home = FunctionReturnType<typeof api.portal.home>;
type Action = Home["actions"][number];

function ActionCard({ a }: { a: Action }) {
  const update = useMutation(api.portal.updateAction);
  const { act, busy } = useAct();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(a.clientNote ?? "");
  const [obstacle, setObstacle] = useState("");
  const late = !!a.dueDate && a.dueDate < todayIso();
  const mine = a.owner === "client";
  const send = (status: "open" | "in_progress" | "completed", done: string) =>
    act(() => update({ id: a._id, status, clientNote: note || undefined, obstacle: obstacle || undefined }), done);
  return (
    <li className="px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{a.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-soft">
            {!mine && <Badge tone="pine">Tamika is doing this</Badge>}
            {a.dueDate && <span className={late ? "font-medium text-clay" : ""}>Due {isoLabel(a.dueDate)}</span>}
            {a.status === "in_progress" && <Badge tone="gold">Started</Badge>}
          </div>
          {a.doneLooksLike && <p className="mt-1 text-sm text-soft">Done looks like: {a.doneLooksLike}</p>}
          {a.smallerStep && <p className="mt-1 text-sm text-soft">A smaller first step: {a.smallerStep}</p>}
        </div>
        {mine && (
          <div className="flex gap-2">
            <Button small onClick={() => setOpen(!open)}>{open ? "Close" : "Update"}</Button>
            <Button small tone="primary" disabled={busy} onClick={() => send("completed", "Marked done. Nice work.")}>I did this</Button>
          </div>
        )}
      </div>
      {open && mine && (
        <div className="mt-3 space-y-3 rounded-md bg-mist p-3">
          <Field label="How is it going?" hint="A short note is fine. Tamika will see it before your next session.">
            <TextArea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </Field>
          <Field label="Is something in the way?" hint="Leave this blank if not.">
            <TextArea value={obstacle} onChange={(e) => setObstacle(e.target.value)} maxLength={600} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button small tone="primary" disabled={busy} onClick={async () => { if (await send("in_progress", "Update saved")) setOpen(false); }}>Save my update</Button>
            <span className="self-center text-[13px] text-soft">Need to change this action? Bring it to your next session or send Tamika a message.</span>
          </div>
        </div>
      )}
    </li>
  );
}

function Testimonial({ t }: { t: Home["testimonialRequests"][number] }) {
  const answer = useMutation(api.portal.answerTestimonial);
  const { act, busy } = useAct();
  return (
    <Panel title="May Tamika share your words?" tone="shared">
      <p className="text-sm text-soft">Tamika would like to use this quote. You can say yes or no. Either answer is fine, and it does not change your coaching.</p>
      <blockquote className="display my-3 border-l-2 border-gold-500 pl-4 text-lg leading-snug">&ldquo;{t.quote}&rdquo;</blockquote>
      <p className="text-sm">Shown with the name: <strong>{t.attribution}</strong></p>
      <p className="text-sm">Where it may be used: <strong>{t.placements.join(", ")}</strong></p>
      <div className="mt-3 flex gap-2">
        <Button tone="primary" disabled={busy} onClick={() => act(() => answer({ id: t._id, granted: true }), "Thank you. Your answer was saved.")}>Yes, you may use it</Button>
        <Button disabled={busy} onClick={() => act(() => answer({ id: t._id, granted: false }), "Your answer was saved.")}>No, please do not</Button>
      </div>
    </Panel>
  );
}

function Agreement({ text, serviceName }: { text: string; serviceName: string }) {
  const accept = useMutation(api.portal.acceptAgreement);
  const { act, busy } = useAct();
  const [typedName, setTypedName] = useState("");
  const [agreed, setAgreed] = useState(false);
  return (
    <Panel title={`Your ${serviceName} agreement`} tone="shared">
      <p className="mb-3 text-sm text-soft">Please read this before your first session. If anything looks wrong, message Tamika before you sign.</p>
      <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-mist p-4 text-sm leading-relaxed">{text}</div>
      <label className="mt-4 flex items-start gap-2.5 text-sm">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[#1d4a43]" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>I have read this agreement and I agree to it.</span>
      </label>
      <Field label="Type your full name to sign" className="mt-3 max-w-sm">
        <Input value={typedName} onChange={(e) => setTypedName(e.target.value)} maxLength={160} autoComplete="name" className="display !text-lg" />
      </Field>
      <div className="mt-3">
        <Button tone="primary" disabled={busy || !agreed || typedName.trim().length < 3} onClick={() => act(() => accept({ typedName, agreed }), "Thank you. Your agreement is signed.")}>
          Sign and accept
        </Button>
      </div>
    </Panel>
  );
}

function Consent({ current, onDone }: { current?: { recording: boolean; transcription: boolean; ai: boolean }; onDone?: () => void }) {
  const answer = useMutation(api.portal.answerConsent);
  const { act, busy } = useAct();
  const [v, setV] = useState(current ?? { recording: false, transcription: false, ai: false });
  const row = (key: keyof typeof v, question: string, detail: string, disabled = false) => (
    <fieldset className="border-t border-line py-3 first:border-t-0" disabled={disabled}>
      <legend className="sr-only">{question}</legend>
      <div className={`flex flex-wrap items-start justify-between gap-3 ${disabled ? "opacity-50" : ""}`}>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{question}</div>
          <div className="text-[13px] text-soft">{detail}</div>
        </div>
        <div className="flex gap-1 rounded-md border border-line p-0.5 text-sm">
          {[true, false].map((yes) => (
            <button key={String(yes)} type="button" onClick={() => setV({ ...v, [key]: yes })} aria-pressed={v[key] === yes} className={`rounded px-3 py-1 ${v[key] === yes ? "bg-ink text-white" : "text-soft"}`}>
              {yes ? "Yes" : "No"}
            </button>
          ))}
        </div>
      </div>
    </fieldset>
  );
  return (
    <Panel title="Three quick choices about your sessions" tone="shared">
      <p className="mb-1 text-sm text-soft">These are for your one-on-one sessions with Tamika. Any answer is fine, and you can change them later.</p>
      {row("recording", "May Tamika record your sessions?", "Recordings help her check details. They are not shared with anyone.")}
      {row("transcription", "May a written transcript be kept?", "A text copy of what was said, kept with your private record.", !v.recording)}
      {row("ai", "May AI help draft her notes and recaps?", "Your name and contact details are removed first. Tamika reviews everything before you see it.")}
      <div className="mt-3">
        <Button tone="primary" disabled={busy} onClick={async () => { if (await act(() => answer({ ...v, transcription: v.recording && v.transcription }), "Your choices are saved.")) onDone?.(); }}>
          Save my choices
        </Button>
      </div>
    </Panel>
  );
}

const permissionText = { not_asked: "Not asked yet", granted: "You said yes", declined: "You said no" } as const;

export default function PortalHome() {
  const home = useQuery(api.portal.home, {});
  const [changing, setChanging] = useState(false);
  if (!home) return <Loading />;
  const next = home.upcoming[0];
  const e = home.engagement;
  const todo = [
    ...home.assessments.filter((a) => a.status === "assigned").map((a) => ({ key: a._id, title: a.title, href: `/portal/check/${a._id}`, label: "Answer now", note: "A few short questions" })),
    ...home.worksheets.filter((w) => w.status === "assigned" || w.status === "draft").map((w) => ({ key: w._id, title: w.title, href: `/portal/work/${w._id}`, label: w.status === "draft" ? "Keep going" : "Start", note: w.dueDate ? `Due ${isoLabel(w.dueDate)}` : (w.note ?? "Workbook page") })),
  ];
  const finished = home.worksheets.filter((w) => w.status === "submitted" || w.status === "reviewed");

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-[2rem] leading-tight">Hi, {home.preferredName}</h1>
        <span className="swash" aria-hidden />
        <p className="mt-3 text-soft">Here is what you agreed to do, when you meet {home.coachName.split(" ")[0]} next, and how to ask for help.</p>
      </header>

      {home.testimonialRequests.map((t) => <Testimonial key={t._id} t={t} />)}
      {e && !e.agreementAccepted && <Agreement text={e.agreementText} serviceName={e.serviceName} />}
      {e && (!e.consentAnswered || changing) && (
        <Consent
          current={e.consentAnswered ? { recording: e.recordingPermission === "granted", transcription: e.transcriptionPermission === "granted", ai: e.aiPermission === "granted" } : undefined}
          onDone={() => setChanging(false)}
        />
      )}

      <section className="rounded-lg border border-line border-l-4 border-l-gold-500 bg-gold-50 p-5">
        <h2 className="text-[1.15rem]">Your next session</h2>
        {next ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="display text-2xl">{dayLabel(next.scheduledAt)}</div>
              <div className="text-soft">{timeOnly(next.scheduledAt)}, {next.durationMinutes} minutes{next.format === "in_person" && next.location ? `, at ${next.location}` : ""}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {next.meetLink && <LinkButton href={next.meetLink} tone="primary" external>Join on Google Meet</LinkButton>}
              {home.schedulingLink && <LinkButton href={home.schedulingLink} external>Change the time</LinkButton>}
            </div>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <p className="text-soft">No session is booked right now.</p>
            {home.schedulingLink && e && e.balance.remaining > 0 && <LinkButton href={home.schedulingLink} tone="primary" external>Book a time</LinkButton>}
          </div>
        )}
        {home.upcoming.length > 1 && <p className="mt-3 text-sm text-soft">After that: {home.upcoming.slice(1).map((s) => dateTime(s.scheduledAt)).join("; ")}</p>}
      </section>

      <Panel title="What you agreed to do">
        {home.actions.length === 0 ? (
          <Empty>Nothing is open right now. New actions show up here after each session.</Empty>
        ) : (
          <ul className="-mx-4 -my-4 divide-y divide-line">{home.actions.map((a) => <ActionCard key={a._id} a={a} />)}</ul>
        )}
        {home.recentlyDone.length > 0 && (
          <p className="mt-6 text-sm text-soft">Done lately: {home.recentlyDone.map((a) => a.title).join("; ")}</p>
        )}
      </Panel>

      {(todo.length > 0 || finished.length > 0) && (
        <Panel title="Work from Tamika">
          {todo.length === 0 ? (
            <p className="text-sm text-soft">You are all caught up.</p>
          ) : (
            <ul className="-mx-4 -mt-4 divide-y divide-line">
              {todo.map((t) => (
                <li key={t.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div><div className="font-medium">{t.title}</div><div className="text-[13px] text-soft">{t.note}</div></div>
                  <LinkButton href={t.href} tone="primary" small>{t.label}</LinkButton>
                </li>
              ))}
            </ul>
          )}
          {finished.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm">
              {finished.map((w) => (
                <li key={w._id}>
                  <Link href={`/portal/work/${w._id}`} className="text-pine underline underline-offset-2">{w.title}</Link>
                  <span className="ml-2 text-[13px] text-soft">{w.hasComment ? "Tamika left a note" : w.status === "reviewed" ? "Tamika read it" : "Sent to Tamika"}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {home.latestRecap && (
        <Panel title={`Notes from session ${home.latestRecap.number}`} aside={<Link href="/portal/recaps" className="text-sm text-pine underline underline-offset-2">All session notes ({home.recapCount})</Link>}>
          <RichText text={home.latestRecap.body} className="text-[0.95rem] leading-relaxed" />
        </Panel>
      )}

      {e && (
        <Panel title={e.serviceName}>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <Meter used={e.balance.used} total={e.balance.included} />
              <p className="mt-2 text-sm">{e.balance.remaining} session{e.balance.remaining === 1 ? "" : "s"} left{e.endDate ? `. Your time together runs through ${isoLabel(e.endDate)}.` : "."}</p>
              {e.goal && <p className="mt-3 text-sm"><span className="text-soft">Your goal:</span> {e.goal}</p>}
              {e.measureName && <p className="mt-1 text-sm"><span className="text-soft">How we will see progress:</span> {e.measureName}. Started at {e.measureStart ?? "?"}, aiming for {e.measureTarget ?? "?"}{e.measureActual ? `, now at ${e.measureActual}` : ""}.</p>}
            </div>
            <div className="text-sm">
              <p><span className="text-soft">Between sessions:</span> {e.supportTerms}</p>
              <p className="mt-1"><span className="text-soft">How to reach Tamika:</span> {e.supportChannel}. She replies {e.responseWindow.toLowerCase()}.</p>
              {e.paymentLink && (
                <p className="mt-3"><LinkButton href={e.paymentLink} tone="gold" small external>Make a payment</LinkButton></p>
              )}
              {e.agreementUrl && <p className="mt-2"><SafeLink href={e.agreementUrl}>Agreement document</SafeLink></p>}
              {home.sharedFolderUrl && <p className="mt-1"><SafeLink href={home.sharedFolderUrl}>Your shared folder</SafeLink></p>}
            </div>
          </div>
          <p className="mt-5 border-t border-line pt-3 text-[13px] text-soft">
            Your choices for one-on-one sessions. Recording: {permissionText[e.recordingPermission].toLowerCase()}. Written transcript: {permissionText[e.transcriptionPermission].toLowerCase()}. AI help with notes: {permissionText[e.aiPermission].toLowerCase()}.{" "}
            {e.consentAnswered && !changing && (
              <button type="button" className="text-pine underline underline-offset-2" onClick={() => { setChanging(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                Change my choices
              </button>
            )}
          </p>
          {e.agreementAccepted && (
            <details className="mt-3 text-[13px]">
              <summary className="cursor-pointer text-pine underline underline-offset-2">
                Your signed agreement{e.agreementAcceptedAt ? `, signed ${shortDate(e.agreementAcceptedAt)}` : ""}{e.agreementSignature ? ` as ${e.agreementSignature}` : ""}
              </summary>
              <div className="mt-2 whitespace-pre-wrap rounded-md bg-mist p-3 text-soft">{e.agreementText}</div>
            </details>
          )}
        </Panel>
      )}

      <PortalFiles />

      {home.coworking.length > 0 && (
        <Panel title="Co-working">
          <ul className="space-y-4">
            {home.coworking.map((c) => (
              <li key={c._id}>
                <div className="font-medium">{c.title}</div>
                <div className="text-sm text-soft">{dateTime(c.startsAt)}, {c.durationMinutes / 60} hours{c.format === "in_person" && c.location ? `, at ${c.location}` : ", online"}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {c.meetLink && <LinkButton href={c.meetLink} tone="primary" small external>Join the session</LinkButton>}
                  {c.paymentLink && <LinkButton href={c.paymentLink} tone="gold" small external>Pay to hold your spot</LinkButton>}
                  {!c.confirmed && <span className="text-[13px] text-soft">Your spot is confirmed once payment is recorded.</span>}
                </div>
                <p className="mt-2 text-[13px] text-soft">{c.instructions}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line p-5">
        <div>
          <h2 className="text-[1.15rem]">Need help or stuck on something?</h2>
          <p className="mt-1 text-sm text-soft">Send Tamika a message. You do not need a perfect question.</p>
        </div>
        <LinkButton href="/portal/messages" tone="primary">Message Tamika</LinkButton>
      </section>
      {e && (e.paymentStatus === "unpaid" || e.paymentStatus === "partial") && (
        <p className="text-xs text-faint">Payments are made through a secure Stripe link, never on this page.</p>
      )}
    </div>
  );
}
