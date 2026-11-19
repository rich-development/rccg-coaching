"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useIsCoach } from "@/components/role";
import { Badge, Button, Empty, Field, Input, Loading, PageTitle, Panel, useAct } from "@/components/ui";
import { dateTime, words } from "@/lib/format";

type Settings = FunctionReturnType<typeof api.settings.get>;

function PracticeForm({ s }: { s: Settings }) {
  const update = useMutation(api.settings.update);
  const { act, busy } = useAct();
  const [v, setV] = useState({
    coachName: s.coachName, businessName: s.businessName, timeZone: s.timeZone, responseWindow: s.responseWindow, supportChannel: s.supportChannel,
    discoveryLink: s.discoveryLink, schedulingLink: s.schedulingLink, assessmentsLink: s.assessmentsLink, officeAddress: s.officeAddress,
    weeklySessionCapacity: String(s.weeklySessionCapacity), aiEnabled: s.aiEnabled,
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((old) => ({ ...old, [k]: e.target.value }));
  const save = () => act(() => update({ ...v, weeklySessionCapacity: Number(v.weeklySessionCapacity) }), "Settings saved");
  return (
    <>
      <Panel title="Practice details">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Coach name"><Input value={v.coachName} onChange={set("coachName")} /></Field>
          <Field label="Business name"><Input value={v.businessName} onChange={set("businessName")} /></Field>
          <Field label="Time zone"><Input value={v.timeZone} onChange={set("timeZone")} /></Field>
          <Field label="Sessions you want per week" hint="Used in the capacity report."><Input type="number" min="0" value={v.weeklySessionCapacity} onChange={set("weeklySessionCapacity")} /></Field>
          <Field label="Default contact channel"><Input value={v.supportChannel} onChange={set("supportChannel")} /></Field>
          <Field label="Default response window" hint="Shown to clients next to their messages."><Input value={v.responseWindow} onChange={set("responseWindow")} /></Field>
          <Field label="Office address" className="sm:col-span-2"><Input value={v.officeAddress} onChange={set("officeAddress")} /></Field>
        </div>
      </Panel>
      <Panel title="Links to your other tools">
        <div className="grid gap-3">
          <Field label="Discovery call booking link (RCCG Scheduling)"><Input type="url" value={v.discoveryLink} onChange={set("discoveryLink")} /></Field>
          <Field label="General scheduling link" hint="Clients see this in their portal to book or reschedule."><Input type="url" value={v.schedulingLink} onChange={set("schedulingLink")} /></Field>
          <Field label="Rich Assessments link"><Input type="url" value={v.assessmentsLink} onChange={set("assessmentsLink")} placeholder="https://" /></Field>
        </div>
        <p className="mt-3 text-[13px] text-soft">These are links, not live connections. Scheduling, Stripe, and assessments do not sync automatically yet. The Today page shows what still needs a manual check.</p>
      </Panel>
      <Panel title="AI drafting">
        <div className="flex flex-wrap items-center gap-2">
          {s.aiKeyConfigured ? <Badge tone="moss">API key is set</Badge> : <Badge tone="clay">No API key yet</Badge>}
          {v.aiEnabled ? <Badge tone="moss">Turned on</Badge> : <Badge>Turned off</Badge>}
        </div>
        <p className="mt-3 text-sm text-soft">
          Optional. When on, you can ask for an AI-drafted preparation brief or recap from Today&rsquo;s Coaching. It runs only when you click, only for clients who agreed to AI assistance, and names and contact details are removed first. Each draft has a small cost on your Anthropic account. Preparation briefs built from the record work without it and cost nothing.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.aiEnabled} onChange={(e) => setV((old) => ({ ...old, aiEnabled: e.target.checked }))} /> Allow AI drafting
        </label>
      </Panel>
      <div><Button tone="primary" disabled={busy} onClick={save}>Save settings</Button></div>
    </>
  );
}

function Team() {
  const team = useQuery(api.settings.team, {});
  const add = useMutation(api.settings.addStaff);
  const setActive = useMutation(api.settings.setStaffActive);
  const { act, busy } = useAct();
  const [v, setV] = useState({ name: "", email: "" });
  return (
    <Panel title="Staff access">
      <p className="mb-3 text-sm text-soft">Staff can manage records, bookings, payments, messages, and co-working. They cannot see private notes, transcripts, AI drafts, reports, or exports, and cannot change portal access or settings.</p>
      {team && team.length > 0 && (
        <ul className="mb-4 divide-y divide-line rounded-md border border-line">
          {team.map((m) => (
            <li key={m._id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="font-medium">{m.name}</span>
              <span className="text-soft">{m.email}</span>
              {m.active ? <Badge tone="moss">Active</Badge> : <Badge>Removed</Badge>}
              <Button small tone={m.active ? "danger" : "quiet"} disabled={busy} className="ml-auto" onClick={() => act(() => setActive({ id: m._id, active: !m.active }), m.active ? "Access removed" : "Access restored")}>
                {m.active ? "Remove access" : "Restore access"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => { e.preventDefault(); if (await act(() => add(v), "Staff access given")) setV({ name: "", email: "" }); }}>
        <Field label="Name" className="min-w-40 flex-1"><Input required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Sign-in email" className="min-w-52 flex-1"><Input required type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        <Button type="submit" disabled={busy}>Give staff access</Button>
      </form>
    </Panel>
  );
}

export default function SettingsPage() {
  const isCoach = useIsCoach();
  const settings = useQuery(api.settings.get, {});
  const activity = useQuery(api.settings.activity, isCoach ? { limit: 150 } : "skip");
  if (!settings) return <Loading />;
  if (!isCoach) return <Empty>Only Tamika can open settings.</Empty>;
  return (
    <div>
      <PageTitle title="Settings" sub="Practice details, connected tools, staff access, and a record of who did what." />
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5"><PracticeForm s={settings} /></div>
        <div className="space-y-5">
          <Team />
          <Panel title="Who can see what">
            <ul className="space-y-2 text-sm">
              <li><span className="font-medium">Only you:</span> private session notes, transcripts, AI drafts, recap drafts, private folders, feedback, reports, exports.</li>
              <li><span className="font-medium">You and staff:</span> client records, engagements, bookings, payments, commitments, workbook pages, assessments, messages, co-working rosters.</li>
              <li><span className="font-medium">Each client:</span> only her own appointments and Meet links, commitments, assigned work, approved recaps, messages, session balance, and payment link.</li>
              <li><span className="font-medium">The public:</span> only the registration page for an open co-working session. Never the meeting link or a roster.</li>
            </ul>
          </Panel>
          <Panel title="Activity history">
            {!activity || activity.length === 0 ? (
              <Empty>Nothing recorded yet.</Empty>
            ) : (
              <ul className="max-h-[32rem] space-y-2 overflow-y-auto text-sm">
                {activity.map((a) => (
                  <li key={a._id}>
                    <div>{a.summary}</div>
                    <div className="text-xs text-faint">{dateTime(a.at)}, {a.actor} ({words(a.actorRole)})</div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
