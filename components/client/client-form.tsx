"use client";

import { useState } from "react";
import { Button, Field, Input, Select, TextArea } from "@/components/ui";

export type ClientValues = {
  fullName: string;
  preferredName: string;
  email: string;
  phone?: string;
  businessName?: string;
  businessIdea?: string;
  stage?: "starting" | "starting_over" | "pivoting";
  goals?: string;
  constraints?: string;
  communicationPrefs?: string;
  accessibility?: string;
  source?: string;
  sharedFolderUrl?: string;
  privateFolderUrl?: string;
};

export function ClientForm({
  initial,
  onSave,
  busy,
  saveLabel,
  showPrivate,
}: {
  initial?: Partial<ClientValues>;
  onSave: (values: ClientValues) => void;
  busy: boolean;
  saveLabel: string;
  showPrivate: boolean;
}) {
  const [v, setV] = useState<ClientValues>({
    fullName: initial?.fullName ?? "",
    preferredName: initial?.preferredName ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    businessName: initial?.businessName ?? "",
    businessIdea: initial?.businessIdea ?? "",
    stage: initial?.stage,
    goals: initial?.goals ?? "",
    constraints: initial?.constraints ?? "",
    communicationPrefs: initial?.communicationPrefs ?? "",
    accessibility: initial?.accessibility ?? "",
    source: initial?.source ?? "",
    sharedFolderUrl: initial?.sharedFolderUrl ?? "",
    privateFolderUrl: initial?.privateFolderUrl ?? "",
  });
  const set = (k: keyof ClientValues) => (e: { target: { value: string } }) => setV((old) => ({ ...old, [k]: e.target.value }));
  const blank = (s?: string) => (s && s.trim() ? s : undefined);
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...v,
          phone: blank(v.phone),
          businessName: blank(v.businessName),
          businessIdea: blank(v.businessIdea),
          goals: blank(v.goals),
          constraints: blank(v.constraints),
          communicationPrefs: blank(v.communicationPrefs),
          accessibility: blank(v.accessibility),
          source: blank(v.source),
          sharedFolderUrl: blank(v.sharedFolderUrl),
          privateFolderUrl: showPrivate ? blank(v.privateFolderUrl) : undefined,
        });
      }}
    >
      <Field label="Full name">
        <Input required value={v.fullName} onChange={set("fullName")} maxLength={160} />
      </Field>
      <Field label="Preferred name">
        <Input value={v.preferredName} onChange={set("preferredName")} maxLength={80} placeholder="What she likes to be called" />
      </Field>
      <Field label="Email" hint="She signs in to her portal with this address.">
        <Input required type="email" value={v.email} onChange={set("email")} maxLength={200} />
      </Field>
      <Field label="Phone">
        <Input value={v.phone} onChange={set("phone")} maxLength={40} />
      </Field>
      <Field label="Business name">
        <Input value={v.businessName} onChange={set("businessName")} maxLength={200} />
      </Field>
      <Field label="Where is she now?">
        <Select value={v.stage ?? ""} onChange={(e) => setV((old) => ({ ...old, stage: (e.target.value || undefined) as ClientValues["stage"] }))}>
          <option value="">Not sure yet</option>
          <option value="starting">Starting</option>
          <option value="starting_over">Starting over</option>
          <option value="pivoting">Pivoting</option>
        </Select>
      </Field>
      <Field label="Business idea" className="sm:col-span-2">
        <TextArea value={v.businessIdea} onChange={set("businessIdea")} maxLength={2000} />
      </Field>
      <Field label="Goals" className="sm:col-span-2">
        <TextArea value={v.goals} onChange={set("goals")} maxLength={3000} />
      </Field>
      <Field label="Constraints to plan around" className="sm:col-span-2" hint="Time, responsibilities, and resource limits she chose to share.">
        <TextArea value={v.constraints} onChange={set("constraints")} maxLength={3000} />
      </Field>
      <Field label="Communication preferences">
        <TextArea value={v.communicationPrefs} onChange={set("communicationPrefs")} maxLength={2000} />
      </Field>
      <Field label="Accessibility preferences">
        <TextArea value={v.accessibility} onChange={set("accessibility")} maxLength={2000} />
      </Field>
      <Field label="How she found you">
        <Input value={v.source} onChange={set("source")} maxLength={200} placeholder="Referral, Instagram, co-working" />
      </Field>
      <Field label="Client shared folder link" hint="Google Drive folder she can open.">
        <Input type="url" value={v.sharedFolderUrl} onChange={set("sharedFolderUrl")} placeholder="https://" />
      </Field>
      {showPrivate && (
        <Field label="Private coach folder link" hint="Only you see this. It is never shown in her portal." className="sm:col-span-2">
          <Input type="url" value={v.privateFolderUrl} onChange={set("privateFolderUrl")} placeholder="https://" />
        </Field>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" tone="primary" disabled={busy}>
          {saveLabel}
        </Button>
      </div>
    </form>
  );
}
