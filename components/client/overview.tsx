"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { AccessBadge, AccessControls } from "@/components/access-controls";
import { ClientForm } from "@/components/client/client-form";
import { ClientFiles } from "@/components/files";
import { useCan } from "@/components/role";
import { Button, Field, Input, KeyValue, Modal, Panel, SafeLink, Select, useAct } from "@/components/ui";
import { downloadFile, isoLabel, PIPELINE, shortDate, STAGE_LABEL, todayIso } from "@/lib/format";
import type { Detail } from "./types";

export function Overview({ data, isCoach }: { data: Detail; isCoach: boolean }) {
  const c = data.client;
  const update = useMutation(api.clients.update);
  const setFollowUp = useMutation(api.clients.setFollowUp);
  const setStage = useMutation(api.clients.setPipelineStage);
  const canAccess = useCan("access");
  const canExport = useCan("export");
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
          {c.intakeAppliedAt ? <p className="mb-2 text-[13px] text-soft">Filled in from her intake on {shortDate(c.intakeAppliedAt)}. Edit anything she got wrong.</p> : <p className="mb-2 text-[13px] text-soft">Most of this fills in on its own when she completes intake.</p>}
          <dl>
            <KeyValue label="Preferred name">{c.preferredName}</KeyValue>
            <KeyValue label="Email">{c.email}</KeyValue>
            <KeyValue label="Phone">{c.phone}</KeyValue>
            <KeyValue label="Business">{c.businessName}</KeyValue>
            <KeyValue label="Business idea">{c.businessIdea}</KeyValue>
            <KeyValue label="Where she is">{c.stage ? STAGE_LABEL[c.stage] : ""}</KeyValue>
            <KeyValue label="Goals">{c.goals}</KeyValue>
            <KeyValue label="Constraints">{c.constraints}</KeyValue>
            <KeyValue label="Hours a week">{c.hoursPerWeek !== undefined ? String(c.hoursPerWeek) : ""}</KeyValue>
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
          {recommended && c.email && (
            <a
              className="mt-3 inline-block text-sm text-pine underline underline-offset-2"
              href={`mailto:${c.email}?subject=${encodeURIComponent(`Your coaching details: ${recommended.name}`)}&body=${encodeURIComponent(
                `Hi ${c.preferredName},\n\nThank you for talking with me. Here are the details we discussed.\n\n${recommended.name}\n${recommended.description}\n\nPrice: ${recommended.priceNote}\nSessions: ${recommended.sessionsIncluded}, ${recommended.sessionMinutes} minutes each\nBetween sessions: ${recommended.supportTerms}\n\n${c.recommendationReason ? `Why I suggest it: ${c.recommendationReason}\n\n` : ""}Reply to this email if you want to move forward or have questions.\n`,
              )}`}
            >
              Send written details by email
            </a>
          )}
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

        <ClientFiles clientId={c._id} clientName={c.preferredName} />
        {(c.sharedFolderUrl || privateFolder) && (
          <Panel title="Linked folders">
            <div className="space-y-1.5 text-sm">
              {c.sharedFolderUrl && <SafeLink href={c.sharedFolderUrl} className="block">Client shared folder</SafeLink>}
              {isCoach && privateFolder && <SafeLink href={privateFolder} className="block">Private coach folder</SafeLink>}
            </div>
          </Panel>
        )}

        <Panel title="Client portal" aside={<AccessBadge state={c.access} invitationSent={!!c.inviteSentAt} />}>
          <p className="mb-3 text-[13px] text-soft">
            With access on, she signs in with <strong className="text-ink">{c.email}</strong> and sees only her own appointments, commitments, approved recaps, assigned work, and messages.
          </p>
          {canAccess ? (
            <AccessControls kind="client" id={c._id} state={c.access} signedIn={data.portalLinked} name={c.preferredName} disabled={c.archived} invitationSent={!!c.inviteSentAt} />
          ) : (
            <p className="text-[13px] text-soft">Your role does not include managing access.</p>
          )}
          {c.accessNote && <p className="mt-3 text-[13px] text-soft">{c.accessNote}</p>}
        </Panel>

        {canExport && (
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
