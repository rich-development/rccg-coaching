"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { ClientForm } from "@/components/client/client-form";
import { Badge, Button, Field, Input, KeyValue, Modal, Panel, SafeLink, Select, useAct, Visibility } from "@/components/ui";
import { downloadFile, isoLabel, PIPELINE, shortDate, STAGE_LABEL, todayIso } from "@/lib/format";
import type { Detail } from "./types";

export function Overview({ data, isCoach }: { data: Detail; isCoach: boolean }) {
  const c = data.client;
  const update = useMutation(api.clients.update);
  const setFollowUp = useMutation(api.clients.setFollowUp);
  const setStage = useMutation(api.clients.setPipelineStage);
  const setPortal = useMutation(api.clients.setPortalAccess);
  const resetLink = useMutation(api.clients.resetPortalLink);
  const setArchived = useMutation(api.clients.setArchived);
  const exportRecord = useMutation(api.clients.exportRecord);
  const services = useQuery(api.library.services, {});
  const { act, busy } = useAct();
  const [editing, setEditing] = useState(false);
  const [followUp, setFollow] = useState({ action: c.followUpAction ?? "", date: c.followUpDate ?? todayIso(2) });
  const privateFolder = (c as { privateFolderUrl?: string }).privateFolderUrl;
  const recommended = services?.find((s) => s.key === c.recommendedServiceKey);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-5">
        <Panel title="About her" aside={<Button small onClick={() => setEditing(true)}>Edit</Button>}>
          <dl>
            <KeyValue label="Preferred name">{c.preferredName}</KeyValue>
            <KeyValue label="Email">{c.email}</KeyValue>
            <KeyValue label="Phone">{c.phone}</KeyValue>
            <KeyValue label="Business">{c.businessName}</KeyValue>
            <KeyValue label="Business idea">{c.businessIdea}</KeyValue>
            <KeyValue label="Where she is">{c.stage ? STAGE_LABEL[c.stage] : ""}</KeyValue>
            <KeyValue label="Goals">{c.goals}</KeyValue>
            <KeyValue label="Constraints">{c.constraints}</KeyValue>
            <KeyValue label="Communication">{c.communicationPrefs}</KeyValue>
            <KeyValue label="Accessibility">{c.accessibility}</KeyValue>
            <KeyValue label="Found you through">{c.source}</KeyValue>
            <KeyValue label="In records since">{shortDate(c.createdAt)}</KeyValue>
          </dl>
        </Panel>

        <Panel title="Discovery" aside={<a className="text-sm text-pine underline underline-offset-2" href={`/coach/pipeline?open=${c._id}`}>Open discovery notes</a>}>
          <dl>
            <KeyValue label="Call">{c.discoveryAt ? shortDate(c.discoveryAt) : ""}</KeyValue>
            <KeyValue label="Need">{c.discoveryNeed}</KeyValue>
            <KeyValue label="Desired outcome">{c.discoveryOutcome}</KeyValue>
            <KeyValue label="Recommended">{recommended ? `${recommended.name}. ${c.recommendationReason ?? ""}` : ""}</KeyValue>
            <KeyValue label="Decision">{c.decisionNote ?? c.referralNote}</KeyValue>
          </dl>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel title="Your next follow-up">
          <p className="mb-3 text-[13px] text-soft">A reminder for you. It is not a measure of how she is doing.</p>
          <div className="space-y-3">
            <Field label="What you will do">
              <Input value={followUp.action} onChange={(e) => setFollow({ ...followUp, action: e.target.value })} maxLength={300} placeholder="Send the written details" />
            </Field>
            <Field label="By when">
              <Input type="date" value={followUp.date} onChange={(e) => setFollow({ ...followUp, date: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              <Button
                tone="primary"
                small
                disabled={busy || !followUp.action.trim()}
                onClick={() => act(() => setFollowUp({ id: c._id, action: followUp.action, date: followUp.date }), "Follow-up saved")}
              >
                Save follow-up
              </Button>
              {c.followUpAction && (
                <Button
                  small
                  disabled={busy}
                  onClick={async () => {
                    if (await act(() => setFollowUp({ id: c._id }), "Follow-up done")) setFollow({ action: "", date: todayIso(2) });
                  }}
                >
                  Mark done
                </Button>
              )}
            </div>
            {c.followUpAction && (
              <p className="text-[13px] text-soft">
                Current: {c.followUpAction}
                {c.followUpDate ? `, due ${isoLabel(c.followUpDate)}` : ""}
              </p>
            )}
          </div>
        </Panel>

        <Panel title="Where she stands">
          <Field label="Stage">
            <Select value={c.pipelineStage} disabled={busy} onChange={(e) => act(() => setStage({ id: c._id, stage: e.target.value as typeof c.pipelineStage }), "Stage updated")}>
              {PIPELINE.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        </Panel>

        <Panel title="Folders">
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              {c.sharedFolderUrl ? <SafeLink href={c.sharedFolderUrl}>Client shared folder</SafeLink> : <span className="text-soft">No shared folder linked</span>}
              <Visibility who="shared" />
            </div>
            {isCoach && (
              <div className="flex items-center justify-between gap-2">
                {privateFolder ? <SafeLink href={privateFolder}>Private coach folder</SafeLink> : <span className="text-soft">No private folder linked</span>}
                <Visibility who="private" />
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Client portal">
          <div className="mb-3 flex flex-wrap gap-2">
            {c.portalEnabled ? <Badge tone="moss">Access is on</Badge> : <Badge>Access is off</Badge>}
            {data.portalLinked ? <Badge tone="pine">She has signed in</Badge> : c.portalEnabled ? <Badge tone="gold">Waiting for her first sign-in</Badge> : null}
          </div>
          <p className="mb-3 text-[13px] text-soft">
            When access is on, she can sign in with <strong className="text-ink">{c.email}</strong> and see only her own appointments, commitments, approved recaps, assigned work, and messages.
          </p>
          {isCoach ? (
            <div className="flex flex-wrap gap-2">
              <Button small tone={c.portalEnabled ? "danger" : "primary"} disabled={busy} onClick={() => act(() => setPortal({ id: c._id, enabled: !c.portalEnabled }), c.portalEnabled ? "Portal access turned off" : "Portal access turned on")}>
                {c.portalEnabled ? "Turn off access" : "Turn on access"}
              </Button>
              {data.portalLinked && (
                <Button small disabled={busy} onClick={() => act(() => resetLink({ id: c._id }), "Sign-in link reset")}>
                  Reset her sign-in link
                </Button>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-soft">Only Tamika can change portal access.</p>
          )}
        </Panel>

        {isCoach && (
          <Panel title="Record">
            <div className="flex flex-wrap gap-2">
              <Button
                small
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    const record = await exportRecord({ id: c._id });
                    downloadFile(`${c.fullName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-record.json`, JSON.stringify(record, null, 2), "application/json");
                  }, "Record downloaded")
                }
              >
                Export full record
              </Button>
              <Button small tone={c.archived ? "quiet" : "danger"} disabled={busy} onClick={() => act(() => setArchived({ id: c._id, archived: !c.archived }), c.archived ? "Record restored" : "Record archived")}>
                {c.archived ? "Restore record" : "Archive record"}
              </Button>
            </div>
            <p className="mt-3 text-[13px] text-soft">The export includes private notes and transcripts. Store it somewhere safe.</p>
          </Panel>
        )}
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title={`Edit ${c.preferredName}'s record`} wide>
        <ClientForm
          initial={{ ...c, privateFolderUrl: privateFolder }}
          busy={busy}
          saveLabel="Save changes"
          showPrivate={isCoach}
          onSave={async (values) => {
            if (await act(() => update({ id: c._id, ...values }), "Record saved")) setEditing(false);
          }}
        />
      </Modal>
    </div>
  );
}
