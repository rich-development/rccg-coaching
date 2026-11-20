"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Empty, Field, Input, LinkButton, Loading, Modal, PageTitle, SafeLink, Select, TextArea, useAct } from "@/components/ui";
import { fromLocalInput, isoLabel, PIPELINE, toLocalInput, todayIso } from "@/lib/format";

type Detail = NonNullable<FunctionReturnType<typeof api.clients.get>>;
const OPEN = ["inquiry", "discovery_booked", "discovery_done", "recommended"];
const CLOSED = ["follow_up_later", "referred_out", "not_proceeding"];

function DiscoveryForm({ data, onClose }: { data: Detail; onClose: () => void }) {
  const c = data.client;
  const guides = useQuery(api.library.guides, {});
  const services = useQuery(api.library.services, {});
  const settings = useQuery(api.settings.get, {});
  const save = useMutation(api.clients.saveDiscovery);
  const setStage = useMutation(api.clients.setPipelineStage);
  const setFollowUp = useMutation(api.clients.setFollowUp);
  const { act, busy } = useAct();
  const [v, setV] = useState({
    discoveryAt: c.discoveryAt ? toLocalInput(c.discoveryAt) : "",
    discoveryNeed: c.discoveryNeed ?? "",
    discoveryOutcome: c.discoveryOutcome ?? "",
    discoveryReadiness: c.discoveryReadiness ?? "",
    hoursPerWeek: c.hoursPerWeek?.toString() ?? "",
    recommendedServiceKey: c.recommendedServiceKey ?? "",
    recommendationReason: c.recommendationReason ?? "",
    decisionNote: c.decisionNote ?? "",
    referralNote: c.referralNote ?? "",
    stage: c.pipelineStage,
    followUpAction: c.followUpAction ?? "",
    followUpDate: c.followUpDate ?? todayIso(3),
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((old) => ({ ...old, [k]: e.target.value }));
  const rec = services?.find((s) => s.key === v.recommendedServiceKey);
  const blank = (s: string) => (s.trim() ? s : undefined);
  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
      <div className="rounded-md bg-gold-50 p-4 text-sm">
        <h3 className="display text-base">20-minute discovery guide</h3>
        <p className="mt-1 text-[13px] text-soft">Understand her situation, find one useful outcome, and decide whether working together makes sense.</p>
        {(guides?.discovery ?? []).map((part) => (
          <div key={part.title} className="mt-3">
            <div className="text-[13px] font-semibold">
              Minutes {part.minutes}: {part.title}
            </div>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-[13px] text-soft">
              {part.prompts.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        ))}
        <p className="mt-3 text-[13px] text-soft">If her need is outside your service, say so and suggest the right kind of professional. A good fit matters more than a sale.</p>
        {settings?.discoveryLink && <SafeLink href={settings.discoveryLink} className="mt-3 block text-[13px]">Discovery booking link</SafeLink>}
      </div>
      <form
        className="grid content-start gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await act(async () => {
            await save({
              id: c._id,
              discoveryAt: v.discoveryAt ? fromLocalInput(v.discoveryAt) : undefined,
              discoveryNeed: blank(v.discoveryNeed),
              discoveryOutcome: blank(v.discoveryOutcome),
              discoveryReadiness: blank(v.discoveryReadiness),
              hoursPerWeek: v.hoursPerWeek ? Number(v.hoursPerWeek) : undefined,
              recommendedServiceKey: blank(v.recommendedServiceKey),
              recommendationReason: blank(v.recommendationReason),
              decisionNote: blank(v.decisionNote),
              referralNote: blank(v.referralNote),
            });
            if (v.stage !== c.pipelineStage) await setStage({ id: c._id, stage: v.stage });
            await setFollowUp({ id: c._id, action: blank(v.followUpAction), date: v.followUpDate });
          }, "Discovery saved");
          if (ok) onClose();
        }}
      >
        <Field label="Discovery call date and time"><Input type="datetime-local" value={v.discoveryAt} onChange={set("discoveryAt")} /></Field>
        <Field label="Hours a week she can give"><Input type="number" min="0" max="168" value={v.hoursPerWeek} onChange={set("hoursPerWeek")} /></Field>
        <Field label="Her need" className="sm:col-span-2"><TextArea value={v.discoveryNeed} onChange={set("discoveryNeed")} /></Field>
        <Field label="What would make coaching worthwhile" className="sm:col-span-2"><TextArea value={v.discoveryOutcome} onChange={set("discoveryOutcome")} /></Field>
        <Field label="Readiness and fit" className="sm:col-span-2" hint="Does she want help thinking and following through, or someone to do the work?"><TextArea value={v.discoveryReadiness} onChange={set("discoveryReadiness")} /></Field>
        <Field label="Recommend one service">
          <Select value={v.recommendedServiceKey} onChange={set("recommendedServiceKey")}>
            <option value="">No recommendation yet</option>
            {(services ?? []).filter((s) => s.active && s.kind !== "discovery").map((s) => (
              <option key={s.key} value={s.key}>{s.name} ({s.priceNote})</option>
            ))}
          </Select>
        </Field>
        <Field label="Why this one"><Input value={v.recommendationReason} onChange={set("recommendationReason")} maxLength={2000} /></Field>
        {rec && (
          <p className="rounded-md bg-mist p-3 text-[13px] text-soft sm:col-span-2">
            &ldquo;Based on what you shared, I recommend {rec.name} because {v.recommendationReason ? v.recommendationReason.charAt(0).toLowerCase() + v.recommendationReason.slice(1).replace(/\.$/, "") : "[specific need]"}. It includes {rec.description.charAt(0).toLowerCase() + rec.description.slice(1)} It costs {rec.priceNote}. Would you like the written details so you can decide?&rdquo;
          </p>
        )}
        <Field label="Where this stands">
          <Select value={v.stage} onChange={(e) => setV((old) => ({ ...old, stage: e.target.value as typeof v.stage }))}>
            {PIPELINE.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Decision or referral note"><Input value={v.stage === "referred_out" ? v.referralNote : v.decisionNote} onChange={set(v.stage === "referred_out" ? "referralNote" : "decisionNote")} maxLength={2000} /></Field>
        <Field label="Your next contact"><Input value={v.followUpAction} onChange={set("followUpAction")} maxLength={300} placeholder="Send written details" /></Field>
        <Field label="By when"><Input type="date" value={v.followUpDate} onChange={set("followUpDate")} /></Field>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" tone="primary" disabled={busy}>Save discovery</Button>
          <LinkButton href={`/coach/clients/${c._id}?tab=engagement`}>She said yes: start her engagement</LinkButton>
        </div>
      </form>
    </div>
  );
}

function DiscoveryModal({ id, onClose }: { id: string; onClose: () => void }) {
  const data = useQuery(api.clients.get, { id: id as Id<"clients"> });
  return (
    <Modal open onClose={onClose} title={data ? `Discovery: ${data.client.fullName}` : "Discovery"} wide>
      {data ? <DiscoveryForm data={data} onClose={onClose} /> : <Loading />}
    </Modal>
  );
}

export default function PipelinePage() {
  const clients = useQuery(api.clients.list, {});
  const settings = useQuery(api.settings.get, {});
  const params = useSearchParams();
  const router = useRouter();
  const openId = params.get("open");
  if (!clients) return <Loading />;
  const today = todayIso();
  const inStage = (key: string) => clients.filter((c) => c.pipelineStage === key);
  const card = (c: (typeof clients)[number]) => (
    <button key={c._id} type="button" onClick={() => router.replace(`/coach/pipeline?open=${c._id}`, { scroll: false })} className="block w-full rounded-md border border-line bg-paper p-3 text-left hover:border-gold-500">
      <div className="text-sm font-medium">{c.fullName}</div>
      <div className="text-[13px] text-soft">{c.businessName ?? c.email}</div>
      {c.followUpAction && (
        <div className={`mt-1.5 text-[13px] ${c.followUpDate && c.followUpDate <= today ? "text-clay" : "text-soft"}`}>
          Next: {c.followUpAction}
          {c.followUpDate ? ` (${isoLabel(c.followUpDate)})` : ""}
        </div>
      )}
    </button>
  );
  return (
    <div>
      <PageTitle
        title="Discovery"
        sub="From first inquiry to a decision. Open a card for the call guide and to record the need, your recommendation, and the next contact."
        actions={
          <>
            <LinkButton href="/start" external>Inquiry form</LinkButton>
            {settings?.discoveryLink && <LinkButton href={settings.discoveryLink} external>Booking link</LinkButton>}
            <LinkButton href="/coach/clients" tone="primary">Add a person</LinkButton>
          </>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {OPEN.map((key) => {
          const people = inStage(key);
          return (
            <section key={key} className="rounded-lg bg-paper/60 p-3 ring-1 ring-line">
              <h2 className="mb-3 flex items-center justify-between text-base">
                {PIPELINE.find((p) => p.key === key)?.label}
                <Badge>{people.length}</Badge>
              </h2>
              <div className="space-y-2">{people.length === 0 ? <p className="px-1 py-3 text-[13px] text-faint">No one here.</p> : people.map(card)}</div>
            </section>
          );
        })}
      </div>
      <h2 className="mb-3 mt-9 text-[1.15rem]">Decided not to proceed, for now</h2>
      {CLOSED.every((k) => inStage(k).length === 0) ? (
        <Empty>No one has been referred out or set aside.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {CLOSED.map((key) => (
            <section key={key}>
              <h3 className="mb-2 text-sm font-medium text-soft">{PIPELINE.find((p) => p.key === key)?.label}</h3>
              <div className="space-y-2">{inStage(key).map(card)}</div>
            </section>
          ))}
        </div>
      )}
      <p className="mt-8 text-sm text-soft">
        Enrolled clients move to <Link href="/coach/clients" className="text-pine underline underline-offset-2">Clients</Link>.
      </p>
      {openId && <DiscoveryModal id={openId} onClose={() => router.replace("/coach/pipeline", { scroll: false })} />}
    </div>
  );
}
