"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ActionRow, AddAction } from "@/components/action-list";
import { QuestionSet } from "@/components/worksheet";
import { Badge, Button, Empty, Field, Input, LinkButton, Modal, Panel, SafeLink, Select, TextArea, useAct, Visibility } from "@/components/ui";
import { ago, dateTime, fromLocalInput, isoLabel, shortDate, toLocalInput, words } from "@/lib/format";
import type { Detail } from "./types";

const sessionTone = { scheduled: "gold", completed: "moss", rescheduled: "neutral", missed: "clay", cancelled: "neutral" } as const;
const transcriptLabel = { not_permitted: "Transcript not permitted", pending: "Transcript pending", ready: "Transcript ready", unavailable: "No transcript" } as const;

/* ---------- Sessions ---------- */

export function SessionsTab({ data }: { data: Detail }) {
  const schedule = useMutation(api.sessions.schedule);
  const { act, busy } = useAct();
  const open = data.engagements.filter((e) => e.status === "active" || e.status === "onboarding");
  const [v, setV] = useState(() => ({ engagementId: (open[0]?._id ?? "") as string, when: toLocalInput(Date.now() + 7 * 86400_000), format: "virtual" as "virtual" | "in_person", meetLink: "", location: "" }));
  const chosen = open.find((e) => e._id === v.engagementId) ?? open[0];
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_21rem]">
      <Panel title="Sessions">
        {data.sessions.length === 0 ? (
          <Empty>No sessions booked yet.</Empty>
        ) : (
          <ul className="-mx-4 -my-4 divide-y divide-line">
            {data.sessions.map((s) => {
              const e = data.engagements.find((x) => x._id === s.engagementId);
              return (
                <li key={s._id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {dateTime(s.scheduledAt)}
                      <span className="ml-2 font-normal text-soft">
                        {e?.serviceName}, session {s.number}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-soft">
                      <Badge tone={sessionTone[s.status]}>{s.status}</Badge>
                      {s.status === "missed" && <span>{s.countsAgainstBalance ? "Counts as used" : "Does not count"}</span>}
                      {s.priority && <span>Priority: {s.priority}</span>}
                      {s.status === "completed" && (s.recapShared ? <Badge tone="pine">Recap shared</Badge> : <Badge tone="clay">No recap shared</Badge>)}
                      <span>{transcriptLabel[s.transcriptStatus]}</span>
                    </div>
                  </div>
                  <LinkButton href={`/coach/sessions/${s._id}`} small tone={s.status === "scheduled" ? "primary" : "quiet"}>
                    {s.status === "scheduled" ? "Today’s Coaching" : "Open"}
                  </LinkButton>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel title="Book a session">
        {!chosen ? (
          <p className="text-sm text-soft">Start an engagement first. Sessions are booked against a package.</p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(ev) => {
              ev.preventDefault();
              act(
                () =>
                  schedule({
                    engagementId: chosen._id as Id<"engagements">,
                    scheduledAt: fromLocalInput(v.when),
                    format: v.format,
                    meetLink: v.format === "virtual" ? v.meetLink || undefined : undefined,
                    location: v.format === "in_person" ? v.location || undefined : undefined,
                  }),
                "Session booked",
              );
            }}
          >
            <p className="text-[13px] text-soft">Book the time in RCCG Scheduling, then record it here with its Meet link.</p>
            {open.length > 1 && (
              <Field label="Engagement">
                <Select value={chosen._id} onChange={(e) => setV({ ...v, engagementId: e.target.value })}>
                  {open.map((e) => (
                    <option key={e._id} value={e._id}>{e.serviceName}</option>
                  ))}
                </Select>
              </Field>
            )}
            <p className="text-[13px] text-soft">
              {chosen.serviceName}: {chosen.balance.remaining} remaining, {chosen.balance.scheduled} already booked.
            </p>
            <Field label="Date and time"><Input type="datetime-local" required value={v.when} onChange={(e) => setV({ ...v, when: e.target.value })} /></Field>
            <Field label="Format">
              <Select value={v.format} onChange={(e) => setV({ ...v, format: e.target.value as "virtual" | "in_person" })}>
                <option value="virtual">Virtual (Google Meet)</option>
                <option value="in_person">In person</option>
              </Select>
            </Field>
            {v.format === "virtual" ? (
              <Field label="Google Meet link"><Input type="url" value={v.meetLink} onChange={(e) => setV({ ...v, meetLink: e.target.value })} placeholder="https://meet.google.com/" /></Field>
            ) : (
              <Field label="Location"><Input value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} maxLength={300} /></Field>
            )}
            <Button type="submit" tone="primary" disabled={busy}>Book session</Button>
          </form>
        )}
      </Panel>
    </div>
  );
}

/* ---------- Actions ---------- */

export function ActionsTab({ data }: { data: Detail }) {
  const name = data.client.preferredName;
  const live = data.actions.filter((a) => a.status === "open" || a.status === "in_progress");
  const hers = live.filter((a) => a.owner === "client");
  const yours = live.filter((a) => a.owner === "coach");
  const closed = data.actions.filter((a) => a.status !== "open" && a.status !== "in_progress");
  const list = (items: typeof live, empty: string) =>
    items.length === 0 ? <Empty>{empty}</Empty> : <ul className="-mx-4 -my-4 divide-y divide-line">{items.map((a) => <ActionRow key={a._id} a={a} clientName={name} />)}</ul>;
  return (
    <div className="space-y-5">
      <Panel title={`${name}'s commitments`} tone="shared" aside={<Visibility who="shared" />}>{list(hers, "No open commitments.")}</Panel>
      <Panel title="Your follow-ups">{list(yours, "Nothing open on your side.")}</Panel>
      <Panel title="Add an action"><AddAction clientId={data.client._id} clientName={name} /></Panel>
      {closed.length > 0 && (
        <details className="rounded-lg border border-line bg-paper">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">History: {closed.length} closed</summary>
          <ul className="divide-y divide-line border-t border-line">{closed.map((a) => <ActionRow key={a._id} a={a} clientName={name} />)}</ul>
        </details>
      )}
    </div>
  );
}

/* ---------- Workbook ---------- */

const sheetTone = { assigned: "neutral", draft: "gold", submitted: "clay", reviewed: "moss" } as const;
const sheetLabel = { assigned: "Not started", draft: "She is working on it", submitted: "Ready for review", reviewed: "Reviewed" } as const;

export function WorkbookTab({ data }: { data: Detail }) {
  const templates = useQuery(api.library.worksheets, {});
  const assign = useMutation(api.worksheets.assign);
  const review = useMutation(api.worksheets.review);
  const remove = useMutation(api.worksheets.remove);
  const { act, busy } = useAct();
  const [v, setV] = useState({ templateKey: "", note: "", dueDate: "", linkUrl: "" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const viewing = data.worksheets.find((w) => w._id === openId);
  const current = data.engagements.find((e) => e.status === "active" || e.status === "onboarding");
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_21rem]">
      <Panel title="Assigned pages" tone="shared" aside={<Visibility who="shared" />}>
        {data.worksheets.length === 0 ? (
          <Empty>Nothing assigned yet. Assign only the exercise she needs now.</Empty>
        ) : (
          <ul className="-mx-4 -my-4 divide-y divide-line">
            {data.worksheets.map((w) => (
              <li key={w._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{w.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-soft">
                    <Badge tone={sheetTone[w.status]}>{sheetLabel[w.status]}</Badge>
                    <span>Assigned {shortDate(w.assignedAt)}</span>
                    {w.dueDate && <span>Due {isoLabel(w.dueDate)}</span>}
                    {w.linkUrl && <SafeLink href={w.linkUrl}>Linked document</SafeLink>}
                  </div>
                </div>
                <Button small onClick={() => { setOpenId(w._id); setComment(w.coachComment ?? ""); }}>
                  {w.status === "submitted" ? "Review" : "Open"}
                </Button>
                {w.status === "assigned" && <Button small tone="danger" disabled={busy} onClick={() => act(() => remove({ id: w._id }), "Removed")}>Remove</Button>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Assign a page">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await act(
              () => assign({ clientId: data.client._id, templateKey: v.templateKey, engagementId: current?._id, note: v.note || undefined, dueDate: v.dueDate || undefined, linkUrl: v.linkUrl || undefined }),
              "Page assigned",
            );
            if (ok) setV({ templateKey: "", note: "", dueDate: "", linkUrl: "" });
          }}
        >
          <Field label="Workbook page">
            <Select required value={v.templateKey} onChange={(e) => setV({ ...v, templateKey: e.target.value })}>
              <option value="">Choose a page</option>
              {(templates ?? []).filter((t) => t.active).map((t) => (
                <option key={t.key} value={t.key}>{t.title}</option>
              ))}
            </Select>
          </Field>
          <Field label="Note to her"><TextArea value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} maxLength={1000} placeholder="Why this page, and what to focus on" /></Field>
          <Field label="Due date"><Input type="date" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} /></Field>
          <Field label="Google Doc link" hint="Optional. She can also answer right in her portal."><Input type="url" value={v.linkUrl} onChange={(e) => setV({ ...v, linkUrl: e.target.value })} placeholder="https://" /></Field>
          <Button type="submit" tone="primary" disabled={busy}>Assign page</Button>
        </form>
        <p className="mt-3 text-[13px] text-soft">She gets her own copy. Her answers never change the master page.</p>
      </Panel>
      <Modal open={!!viewing} onClose={() => setOpenId(null)} title={viewing?.title ?? ""} wide>
        {viewing && (
          <div className="space-y-5">
            {viewing.note && <p className="rounded-md bg-gold-50 p-3 text-sm">Your note: {viewing.note}</p>}
            <QuestionSet fields={viewing.fields} values={viewing.responses} readOnly />
            <Field label="Your comment to her" hint="She sees this in her portal.">
              <TextArea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button tone="primary" disabled={busy} onClick={async () => { if (await act(() => review({ id: viewing._id, comment: comment || undefined }), "Marked reviewed")) setOpenId(null); }}>
                Save and mark reviewed
              </Button>
              {(viewing.status === "submitted" || viewing.status === "reviewed") && (
                <Button disabled={busy} onClick={async () => { if (await act(() => review({ id: viewing._id, comment: comment || undefined, reopen: true }), "Reopened for her")) setOpenId(null); }}>
                  Reopen for her to edit
                </Button>
              )}
              <Button onClick={() => window.print()}>Print</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------- Assessments ---------- */

export function AssessmentsTab({ data }: { data: Detail }) {
  const guides = useQuery(api.library.guides, {});
  const settings = useQuery(api.settings.get, {});
  const comparison = useQuery(api.assessments.compare, { clientId: data.client._id });
  const assign = useMutation(api.assessments.assign);
  const record = useMutation(api.assessments.recordAnswers);
  const markReviewed = useMutation(api.assessments.markReviewed);
  const { act, busy } = useAct();
  const [openId, setOpenId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [link, setLink] = useState("");
  const viewing = data.assessments.find((a) => a._id === openId);
  const current = data.engagements.find((e) => e.status === "active" || e.status === "onboarding");
  return (
    <div className="space-y-5">
      <Panel title="Assign an assessment">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Rich Assessments link" hint="Optional. Leave blank and she answers in her portal." className="min-w-64 flex-1">
            <Input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder={settings?.assessmentsLink || "https://"} />
          </Field>
          {(guides?.assessmentKinds ?? []).map((k) => (
            <Button
              key={k.kind}
              disabled={busy}
              onClick={async () => {
                if (await act(() => assign({ clientId: data.client._id, kind: k.kind as "intake", engagementId: current?._id, externalUrl: link || undefined }), `${k.title} assigned`)) setLink("");
              }}
            >
              {k.title}
            </Button>
          ))}
        </div>
      </Panel>
      <Panel title="Assigned and completed">
        {data.assessments.length === 0 ? (
          <Empty>No assessments yet. Intake comes first.</Empty>
        ) : (
          <ul className="-mx-4 -my-4 divide-y divide-line">
            {data.assessments.map((a) => (
              <li key={a._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-soft">
                    {a.status === "assigned" ? <Badge>Waiting on her</Badge> : a.reviewedAt ? <Badge tone="moss">Read</Badge> : <Badge tone="clay">New, not read yet</Badge>}
                    <span>Assigned {shortDate(a.assignedAt)}</span>
                    {a.completedAt && <span>Completed {shortDate(a.completedAt)}</span>}
                    {a.externalUrl && <SafeLink href={a.externalUrl}>Assessment link</SafeLink>}
                    {a.resultUrl && <SafeLink href={a.resultUrl}>Result</SafeLink>}
                  </div>
                </div>
                <Button small onClick={() => { setOpenId(a._id); setAnswers(a.answers); }}>
                  {a.status === "assigned" ? "Enter her answers" : "Open result"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {comparison && comparison.length > 0 && (
        <Panel title="Same question over time">
          <p className="mb-4 text-[13px] text-soft">Use this to tell progress from a change in priorities.</p>
          <div className="space-y-5">
            {comparison.map((q) => (
              <div key={q.key}>
                <div className="mb-2 text-sm font-medium">{q.label}</div>
                <ol className="space-y-2 border-l-2 border-gold-300 pl-4">
                  {q.entries.map((entry, i) => (
                    <li key={i} className="text-sm">
                      <span className="text-[13px] text-soft">{shortDate(entry.at)}, {entry.title}</span>
                      <div className="whitespace-pre-wrap">{entry.answer}</div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <Modal open={!!viewing} onClose={() => setOpenId(null)} title={viewing?.title ?? ""} wide>
        {viewing && (
          <div className="space-y-5">
            <QuestionSet fields={viewing.questions} values={viewing.status === "assigned" ? answers : viewing.answers} readOnly={viewing.status === "completed"} onChange={(k, val) => setAnswers((old) => ({ ...old, [k]: val }))} />
            {viewing.status === "assigned" ? (
              <div>
                <p className="mb-2 text-[13px] text-soft">Use this when her answers came through Rich Assessments, email, or on paper.</p>
                <Button tone="primary" disabled={busy} onClick={async () => { if (await act(() => record({ id: viewing._id, answers }), "Answers recorded")) setOpenId(null); }}>
                  Record her answers
                </Button>
              </div>
            ) : !viewing.reviewedAt ? (
              <Button tone="primary" disabled={busy} onClick={async () => { if (await act(() => markReviewed({ id: viewing._id }), "Marked as read")) setOpenId(null); }}>
                Mark as read
              </Button>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------- History, feedback, testimonials ---------- */

const PLACEMENTS = ["Website", "Social media", "Printed materials", "Other materials"];

export function HistoryTab({ data, isCoach }: { data: Detail; isCoach: boolean }) {
  const activity = useQuery(api.settings.activity, isCoach ? { clientId: data.client._id, limit: 80 } : "skip");
  const draft = useMutation(api.feedback.draftTestimonial);
  const answer = useMutation(api.feedback.recordTestimonialAnswer);
  const { act, busy } = useAct();
  const [t, setT] = useState({ quote: "", attribution: data.client.fullName, placements: ["Website"] as string[] });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Co-working attendance">
        {data.coworking.length === 0 ? (
          <Empty>She has not registered for co-working.</Empty>
        ) : (
          <ul className="-mx-4 -my-4 divide-y divide-line">
            {data.coworking.map((r) => (
              <li key={r._id} className="px-4 py-3 text-sm">
                <Link href={`/coach/coworking/${r.sessionId}`} className="font-medium underline-offset-2 hover:underline">{r.title}</Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-soft">
                  <span>{dateTime(r.startsAt)}</span>
                  {r.attended === true ? <Badge tone="moss">Attended</Badge> : r.attended === false ? <Badge>Did not attend</Badge> : <Badge tone="gold">{r.status}</Badge>}
                </div>
                {r.chosenTask && <div className="mt-1 text-[13px] text-soft">Task: {r.chosenTask}</div>}
                {r.reportedProgress && <div className="text-[13px] text-soft">She reported: {r.reportedProgress}</div>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {isCoach && (
        <Panel title="Feedback" tone="private" aside={<Visibility who="private" />}>
          {data.feedback.length === 0 ? (
            <Empty>No feedback yet. Assign the feedback assessment at completion.</Empty>
          ) : (
            data.feedback.map((f) => (
              <dl key={f._id} className="mb-4 text-sm last:mb-0">
                <div className="mb-1 text-[13px] text-soft">{shortDate(f.submittedAt)}</div>
                {f.mostUseful && <p><span className="text-soft">Most useful:</span> {f.mostUseful}</p>}
                {f.improve && <p><span className="text-soft">Could improve:</span> {f.improve}</p>}
                {f.canDoNow && <p><span className="text-soft">Can do now:</span> {f.canDoNow}</p>}
                {f.anythingElse && <p><span className="text-soft">Anything else:</span> {f.anythingElse}</p>}
              </dl>
            ))
          )}
          <p className="mt-3 text-[13px] text-soft">Feedback is never permission to publish. Ask separately below.</p>
        </Panel>
      )}

      {isCoach && (
        <Panel title="Testimonial permission" className="lg:col-span-2">
          {data.testimonials.length > 0 && (
            <ul className="mb-5 space-y-3">
              {data.testimonials.map((x) => (
                <li key={x._id} className="rounded-md border border-line p-3 text-sm">
                  <blockquote className="display text-[1.05rem] leading-snug">&ldquo;{x.quote}&rdquo;</blockquote>
                  <div className="mt-1 text-[13px] text-soft">{x.attribution}. May appear on: {x.placements.join(", ")}.</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={x.status === "granted" ? "moss" : x.status === "declined" ? "clay" : "gold"}>
                      {x.status === "granted" ? "Permission given" : x.status === "declined" ? "Declined" : "Waiting for her answer"}
                    </Badge>
                    {x.respondedAt && <span className="text-[13px] text-soft">{shortDate(x.respondedAt)}</span>}
                    {x.status === "requested" && (
                      <>
                        <Button small disabled={busy} onClick={() => act(() => answer({ id: x._id, granted: true }), "Recorded")}>She said yes elsewhere</Button>
                        <Button small disabled={busy} onClick={() => act(() => answer({ id: x._id, granted: false }), "Recorded")}>She said no</Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Exact quote you would publish" className="sm:col-span-2"><TextArea value={t.quote} onChange={(e) => setT({ ...t, quote: e.target.value })} maxLength={1500} /></Field>
            <Field label="Name or business shown with it"><Input value={t.attribution} onChange={(e) => setT({ ...t, attribution: e.target.value })} maxLength={200} /></Field>
            <fieldset>
              <legend className="mb-1 text-[13px] font-medium">Where it may be used</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {PLACEMENTS.map((p) => (
                  <label key={p} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={t.placements.includes(p)} onChange={(e) => setT({ ...t, placements: e.target.checked ? [...t.placements, p] : t.placements.filter((x) => x !== p) })} /> {p}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="mt-3">
            <Button
              tone="primary"
              small
              disabled={busy || !t.quote.trim()}
              onClick={async () => {
                if (await act(() => draft({ clientId: data.client._id, quote: t.quote, attribution: t.attribution, placements: t.placements, request: true }), "Permission request sent to her portal")) setT({ ...t, quote: "" });
              }}
            >
              Ask her permission
            </Button>
            <span className="ml-3 text-[13px] text-soft">She sees the exact quote, attribution, and places, then answers yes or no.</span>
          </div>
        </Panel>
      )}

      {isCoach && (
        <Panel title="Activity history" className="lg:col-span-2">
          {!activity || activity.length === 0 ? (
            <Empty>No activity recorded yet.</Empty>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {activity.map((a) => (
                <li key={a._id} className="flex flex-wrap gap-x-3">
                  <span className="w-28 shrink-0 text-[13px] text-soft">{ago(a.at)}</span>
                  <span className="min-w-0 flex-1">{a.summary}</span>
                  <span className="text-[13px] text-faint">{a.actor} ({words(a.actorRole)})</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
