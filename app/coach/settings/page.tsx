"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useCan } from "@/components/role";
import { Badge, Button, Empty, Field, Input, Loading, PageTitle, Panel, useAct } from "@/components/ui";

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

export default function SettingsPage() {
  const allowed = useCan("settings");
  const settings = useQuery(api.settings.get, {});
  if (!settings) return <Loading />;
  if (!allowed) return <Empty>Your role does not include practice settings.</Empty>;
  return (
    <div>
      <PageTitle title="Settings" sub="Practice details, connected tools, and AI drafting. People and permissions are on the Access page." />
      <div className="grid max-w-3xl gap-5">
        <PracticeForm s={settings} />
      </div>
    </div>
  );
}
