"use client";

import { useState } from "react";
import { Button, Field, Input, Select, TextArea } from "@/components/ui";
import { fromLocalInput, toLocalInput } from "@/lib/format";

export type CoworkingValues = {
  title: string;
  startsAt: number;
  timeZone: string;
  durationMinutes: number;
  format: "virtual" | "in_person";
  location?: string;
  meetLink?: string;
  capacity: number;
  priceCents: number;
  paymentLink?: string;
  instructions?: string;
  cancellationTerms?: string;
  status: "draft" | "open" | "closed" | "completed" | "cancelled";
};

export function CoworkingForm({
  initial,
  officeAddress,
  timeZone,
  showStatus,
  busy,
  saveLabel,
  onSave,
}: {
  initial?: Partial<CoworkingValues>;
  officeAddress: string;
  timeZone: string;
  showStatus: boolean;
  busy: boolean;
  saveLabel: string;
  onSave: (v: CoworkingValues) => void;
}) {
  const [v, setV] = useState({
    title: initial?.title ?? "Co-working session",
    when: toLocalInput(initial?.startsAt ?? Date.now() + 14 * 86400_000),
    timeZone: initial?.timeZone ?? timeZone,
    durationMinutes: String(initial?.durationMinutes ?? 120),
    format: initial?.format ?? ("in_person" as "virtual" | "in_person"),
    location: initial?.location ?? officeAddress,
    meetLink: initial?.meetLink ?? "",
    capacity: String(initial?.capacity ?? 8),
    price: String((initial?.priceCents ?? 2500) / 100),
    paymentLink: initial?.paymentLink ?? "",
    instructions: initial?.instructions ?? "",
    cancellationTerms: initial?.cancellationTerms ?? "",
    status: initial?.status ?? ("draft" as CoworkingValues["status"]),
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((old) => ({ ...old, [k]: e.target.value }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          title: v.title,
          startsAt: fromLocalInput(v.when),
          timeZone: v.timeZone,
          durationMinutes: Number(v.durationMinutes),
          format: v.format,
          location: v.format === "in_person" ? v.location || undefined : undefined,
          meetLink: v.format === "virtual" ? v.meetLink || undefined : undefined,
          capacity: Number(v.capacity),
          priceCents: Math.round(Number(v.price) * 100),
          paymentLink: v.paymentLink || undefined,
          instructions: v.instructions || undefined,
          cancellationTerms: v.cancellationTerms || undefined,
          status: v.status,
        });
      }}
    >
      <Field label="Title" className="sm:col-span-2"><Input required value={v.title} onChange={set("title")} maxLength={160} /></Field>
      <Field label="Date and time"><Input type="datetime-local" required value={v.when} onChange={set("when")} /></Field>
      <Field label="Time zone"><Input value={v.timeZone} onChange={set("timeZone")} /></Field>
      <Field label="Length in minutes"><Input type="number" min="15" value={v.durationMinutes} onChange={set("durationMinutes")} /></Field>
      <Field label="Capacity" hint="Suggested group size: six to eight."><Input type="number" min="1" max="100" value={v.capacity} onChange={set("capacity")} /></Field>
      <Field label="Format">
        <Select value={v.format} onChange={(e) => setV((old) => ({ ...old, format: e.target.value as "virtual" | "in_person" }))}>
          <option value="in_person">In person</option>
          <option value="virtual">Virtual</option>
        </Select>
      </Field>
      <Field label="Price per person (dollars)"><Input type="number" min="0" step="0.01" value={v.price} onChange={set("price")} /></Field>
      {v.format === "in_person" ? (
        <Field label="Location" className="sm:col-span-2"><Input value={v.location} onChange={set("location")} maxLength={300} /></Field>
      ) : (
        <Field label="Meeting link" className="sm:col-span-2" hint="Private. Never shown on the public page. Shared with confirmed registrants only.">
          <Input type="url" value={v.meetLink} onChange={set("meetLink")} placeholder="https://meet.google.com/" />
        </Field>
      )}
      <Field label="Stripe payment link" className="sm:col-span-2" hint="Shown to a person right after she registers."><Input type="url" value={v.paymentLink} onChange={set("paymentLink")} placeholder="https://" /></Field>
      <Field label="Participant instructions" className="sm:col-span-2" hint="Leave blank to use the standard instructions."><TextArea value={v.instructions} onChange={set("instructions")} maxLength={3000} /></Field>
      <Field label="Cancellation terms" className="sm:col-span-2"><TextArea value={v.cancellationTerms} onChange={set("cancellationTerms")} maxLength={1000} /></Field>
      {showStatus && (
        <Field label="Status" hint="Open means the public registration page accepts sign-ups.">
          <Select value={v.status} onChange={(e) => setV((old) => ({ ...old, status: e.target.value as CoworkingValues["status"] }))}>
            <option value="draft">Draft (not public)</option>
            <option value="open">Open for registration</option>
            <option value="closed">Registration closed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </Field>
      )}
      <div className="sm:col-span-2"><Button type="submit" tone="primary" disabled={busy}>{saveLabel}</Button></div>
    </form>
  );
}
