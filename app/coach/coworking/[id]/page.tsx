"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CoworkingForm } from "@/components/coworking-form";
import { Badge, Button, Empty, Field, Input, Loading, Modal, Panel, SafeLink, Select, useAct, useNotice } from "@/components/ui";
import { dateTime, money } from "@/lib/format";

const AGENDA = [
  ["0 to 10", "Welcome. Explain the format and group expectations."],
  ["10 to 20", "Each person names one task and what finished will look like."],
  ["20 to 55", "Quiet work block. Offer short individual check-ins."],
  ["55 to 65", "Break and brief progress reset."],
  ["65 to 100", "Second focused work block."],
  ["100 to 115", "Share progress, obstacles, and the next action."],
  ["115 to 120", "Close. Explain how to hear about the next session."],
];

export default function CoworkingDetail() {
  const { id } = useParams<{ id: string }>();
  const sessionId = id as Id<"coworkingSessions">;
  const data = useQuery(api.coworking.get, { id: sessionId });
  const settings = useQuery(api.settings.get, {});
  const update = useMutation(api.coworking.update);
  const addReg = useMutation(api.coworking.addRegistration);
  const updateReg = useMutation(api.coworking.updateRegistration);
  const createClient = useMutation(api.clients.create);
  const { act, busy } = useAct();
  const notice = useNotice();
  const [editing, setEditing] = useState(false);
  const [person, setPerson] = useState({ name: "", email: "" });
  if (data === undefined || !settings) return <Loading />;
  if (data === null) return <Empty>This session was not found.</Empty>;
  const s = data.session;
  const publicUrl = typeof window === "undefined" ? "" : `${window.location.origin}/cowork/${s.slug}`;
  const registered = data.roster.filter((r) => r.status === "registered");
  const waitlist = data.roster.filter((r) => r.status === "waitlist");
  const cancelled = data.roster.filter((r) => r.status === "cancelled");

  return (
    <div>
      <Link href="/coach/coworking" className="text-sm text-soft underline-offset-2 hover:underline">All co-working sessions</Link>
      <header className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.9rem] leading-tight">{s.title}</h1>
          <span className="swash" aria-hidden />
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-soft">
            <span>{dateTime(s.startsAt)} ({s.timeZone}), {s.durationMinutes} minutes</span>
            <Badge tone={s.status === "open" ? "moss" : "neutral"}>{s.status}</Badge>
            <span>{data.registered} of {s.capacity} registered, {data.paid} paid</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setEditing(true)}>Edit details</Button>
          {s.status === "draft" && (
            <Button tone="primary" disabled={busy} onClick={() => act(() => update({ id: s._id, title: s.title, startsAt: s.startsAt, timeZone: s.timeZone, durationMinutes: s.durationMinutes, format: s.format, location: s.location, meetLink: s.meetLink, capacity: s.capacity, priceCents: s.priceCents, paymentLink: s.paymentLink, instructions: s.instructions, cancellationTerms: s.cancellationTerms, status: "open" }), "Registration is open")}>
              Open registration
            </Button>
          )}
        </div>
      </header>

      <p className="mb-5 rounded-md border border-line bg-paper px-4 py-3 text-sm">
        <strong className="font-semibold">No recordings and no transcripts.</strong> Capture only attendance, each person&rsquo;s chosen task, and progress she chooses to report. Nothing from co-working feeds AI or private client notes.
      </p>

      <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Panel title="Roster and check-in" aside={<Button small onClick={() => window.print()}>Print roster</Button>}>
            {registered.length === 0 ? (
              <Empty>No one has registered yet.</Empty>
            ) : (
              <div className="-mx-4 -mt-4 overflow-x-auto">
                <table className="w-full min-w-[44rem] text-left text-sm">
                  <thead className="border-b border-line text-[13px] text-soft">
                    <tr>
                      <th className="px-4 py-2 font-medium">Here</th>
                      <th className="px-2 py-2 font-medium">Participant</th>
                      <th className="px-2 py-2 font-medium">Payment</th>
                      <th className="px-2 py-2 font-medium">Her task today</th>
                      <th className="px-2 py-2 font-medium">Progress she reported</th>
                      <th className="px-2 py-2 font-medium">Coaching?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {registered.map((r) => (
                      <tr key={r._id} className="align-top">
                        <td className="px-4 py-2.5">
                          <input type="checkbox" aria-label={`${r.name} attended`} className="h-4 w-4 accent-[#1d4a43]" checked={r.attended === true} onChange={(e) => act(() => updateReg({ id: r._id, attended: e.target.checked }))} />
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="font-medium">{r.name}</div>
                          <div className="text-[13px] text-soft">{r.email}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {r.timesAttended > 1 && <Badge tone="gold">Attended {r.timesAttended} times</Badge>}
                            {r.clientId ? (
                              <Link href={`/coach/clients/${r.clientId}`} className="text-[13px] text-pine underline underline-offset-2">{r.isCoachingClient ? "Coaching client" : "In records"}</Link>
                            ) : (
                              <button type="button" className="text-[13px] text-pine underline underline-offset-2" onClick={() => act(() => createClient({ fullName: r.name, preferredName: r.name.split(" ")[0], email: r.email, source: "Co-working" }), "Added to records as an inquiry")}>
                                Add to records
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <Select aria-label="Payment" className="!w-auto !py-1 text-[13px]" value={r.paymentStatus} onChange={(e) => act(() => updateReg({ id: r._id, paymentStatus: e.target.value as "paid" }), "Payment updated")}>
                            <option value="unpaid">Unpaid</option>
                            <option value="paid">Paid</option>
                            <option value="waived">Waived</option>
                            <option value="refunded">Refunded</option>
                          </Select>
                        </td>
                        <td className="px-2 py-2.5">
                          <Input aria-label="Chosen task" defaultValue={r.chosenTask ?? ""} className="!py-1 text-[13px]" maxLength={600} onBlur={(e) => e.target.value !== (r.chosenTask ?? "") && act(() => updateReg({ id: r._id, chosenTask: e.target.value }))} />
                        </td>
                        <td className="px-2 py-2.5">
                          <Input aria-label="Reported progress" defaultValue={r.reportedProgress ?? ""} className="!py-1 text-[13px]" maxLength={1000} onBlur={(e) => e.target.value !== (r.reportedProgress ?? "") && act(() => updateReg({ id: r._id, reportedProgress: e.target.value }))} />
                        </td>
                        <td className="px-2 py-2.5">
                          <label className="flex items-center gap-1.5 text-[13px]">
                            <input type="checkbox" checked={r.interestedInCoaching === true} onChange={(e) => act(() => updateReg({ id: r._id, interestedInCoaching: e.target.checked }))} /> Interested
                          </label>
                          <button type="button" className="mt-1 text-[13px] text-clay underline underline-offset-2" onClick={() => act(() => updateReg({ id: r._id, status: "cancelled" }), "Registration cancelled")}>
                            Cancel spot
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <form
              className="no-print mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await act(() => addReg({ sessionId, name: person.name, email: person.email }), "Added to the roster")) setPerson({ name: "", email: "" });
              }}
            >
              <Field label="Add a participant" className="min-w-40 flex-1"><Input required value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} placeholder="Name" maxLength={120} /></Field>
              <Field label="Email" className="min-w-48 flex-1"><Input required type="email" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} maxLength={200} /></Field>
              <Button type="submit" disabled={busy}>Add</Button>
            </form>
          </Panel>

          {(waitlist.length > 0 || cancelled.length > 0) && (
            <Panel title="Waitlist and cancellations">
              <ul className="space-y-2 text-sm">
                {waitlist.map((r) => (
                  <li key={r._id} className="flex flex-wrap items-center gap-3">
                    <Badge tone="gold">Waitlist</Badge>
                    <span>{r.name}</span>
                    <span className="text-soft">{r.email}</span>
                    <Button small disabled={busy} onClick={() => act(() => updateReg({ id: r._id, status: "registered" }), "Moved to the roster")}>Give her a spot</Button>
                  </li>
                ))}
                {cancelled.map((r) => (
                  <li key={r._id} className="flex flex-wrap items-center gap-3 text-soft">
                    <Badge>Cancelled</Badge>
                    <span>{r.name}</span>
                    <Button small disabled={busy} onClick={() => act(() => updateReg({ id: r._id, status: "registered" }), "Restored")}>Restore</Button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <aside className="space-y-5">
          <Panel title="Registration link">
            {s.status === "draft" ? (
              <p className="text-sm text-soft">The public page is hidden while this is a draft.</p>
            ) : (
              <>
                <p className="break-all rounded bg-mist px-2 py-1.5 text-[13px]">{publicUrl}</p>
                <div className="mt-2 flex gap-2">
                  <Button small onClick={() => navigator.clipboard.writeText(publicUrl).then(() => notice("Link copied"))}>Copy link</Button>
                  <SafeLink href={publicUrl} className="self-center text-[13px]">Preview</SafeLink>
                </div>
                <p className="mt-3 text-[13px] text-soft">Use this event link in promotions: &ldquo;Use the link to register for the next session.&rdquo; Do not use the discovery call link for co-working.</p>
              </>
            )}
          </Panel>
          <Panel title="Where">
            {s.format === "virtual" ? (
              <>
                <p className="text-sm">{s.meetLink ? <SafeLink href={s.meetLink}>Open the meeting</SafeLink> : <span className="text-clay">No meeting link added yet</span>}</p>
                <p className="mt-2 text-[13px] text-soft">Send the link privately to paid registrants. Clients with a portal see it there once payment is confirmed. Do not record.</p>
              </>
            ) : (
              <>
                <p className="text-sm">{s.location}</p>
                <p className="mt-2 text-[13px] text-soft">Confirm accessibility, parking, seating, power, and internet before opening registration. Promise refreshments only if arranged.</p>
              </>
            )}
          </Panel>
          <Panel title="Two-hour plan">
            <ol className="space-y-1.5 text-[13px]">
              {AGENDA.map(([minutes, what]) => (
                <li key={minutes} className="grid grid-cols-[4.5rem_1fr] gap-2">
                  <span className="text-soft">{minutes}</span>
                  <span>{what}</span>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Instructions sent to participants">
            <p className="whitespace-pre-wrap text-[13px] text-soft">{s.instructions}</p>
            <p className="mt-2 text-[13px] text-soft">Price: {money(s.priceCents)} per person.</p>
          </Panel>
        </aside>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit co-working session" wide>
        <CoworkingForm
          initial={s}
          officeAddress={settings.officeAddress}
          timeZone={settings.timeZone}
          showStatus
          busy={busy}
          saveLabel="Save changes"
          onSave={async (values) => {
            if (await act(() => update({ id: s._id, ...values }), "Session saved")) setEditing(false);
          }}
        />
      </Modal>
    </div>
  );
}
