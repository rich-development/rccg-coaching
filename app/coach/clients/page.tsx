"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { ClientForm } from "@/components/client/client-form";
import { useIsCoach } from "@/components/role";
import { Badge, Button, Empty, Input, Loading, Meter, Modal, PageTitle, useAct } from "@/components/ui";
import { dateTime, isoLabel, PIPELINE, STAGE_LABEL, todayIso } from "@/lib/format";

export default function ClientsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const clients = useQuery(api.clients.list, { includeArchived: showArchived });
  const create = useMutation(api.clients.create);
  const router = useRouter();
  const isCoach = useIsCoach();
  const { act, busy } = useAct();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"current" | "all">("current");
  if (!clients) return <Loading />;
  const today = todayIso();
  const shown = clients
    .filter((c) => view === "all" || c.pipelineStage === "enrolled" || c.engagementCount > 0)
    .filter((c) => `${c.fullName} ${c.preferredName} ${c.email} ${c.businessName ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <PageTitle
        title="Clients"
        sub="One record per person. A returning client keeps her history when she changes packages."
        actions={
          <Button tone="primary" onClick={() => setAdding(true)}>
            Add a person
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, or business" className="max-w-xs" aria-label="Search clients" />
        <div className="flex rounded-md border border-line bg-paper p-0.5 text-sm">
          {(["current", "all"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setView(k)} className={`rounded px-3 py-1.5 ${view === k ? "bg-ink text-white" : "text-soft"}`}>
              {k === "current" ? "Coaching clients" : "Everyone"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-soft">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
        </label>
      </div>

      {shown.length === 0 ? (
        <Empty>{clients.length === 0 ? "No one here yet. Add the first person to start a record." : "No one matches that search."}</Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-paper">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b border-line text-[13px] text-soft">
              <tr>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">Working on</th>
                <th className="px-4 py-2.5 font-medium">Sessions</th>
                <th className="px-4 py-2.5 font-medium">Next meeting</th>
                <th className="px-4 py-2.5 font-medium">Your follow-up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((c) => (
                <tr key={c._id} className="hover:bg-gold-50">
                  <td className="px-4 py-3">
                    <Link href={`/coach/clients/${c._id}`} className="font-medium text-ink underline-offset-2 hover:underline">
                      {c.fullName}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-soft">
                      {c.businessName ?? (c.stage ? STAGE_LABEL[c.stage] : c.email)}
                      {c.needsReply && <Badge tone="clay">Needs reply</Badge>}
                      {c.archived && <Badge>Archived</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {c.currentService ? (
                      <>
                        {c.currentService}
                        {c.currentStatus !== "active" && <span className="ml-1.5 text-[13px] text-soft">({c.currentStatus})</span>}
                      </>
                    ) : (
                      <span className="text-soft">{PIPELINE.find((p) => p.key === c.pipelineStage)?.label}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{c.balance ? <Meter used={c.balance.used} total={c.balance.included} /> : <span className="text-faint">None</span>}</td>
                  <td className="px-4 py-3 text-soft">{c.nextSessionAt ? dateTime(c.nextSessionAt) : "Not booked"}</td>
                  <td className="px-4 py-3">
                    {c.followUpAction ? (
                      <span className={c.followUpDate && c.followUpDate <= today ? "text-clay" : "text-soft"}>
                        {c.followUpAction}
                        {c.followUpDate ? ` (${isoLabel(c.followUpDate)})` : ""}
                      </span>
                    ) : (
                      <span className="text-faint">None set</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a person">
        <p className="mb-4 text-sm text-soft">Name and email are all you need. Her intake form fills in the rest when she completes it. Nothing is sent to her until you invite her.</p>
        <ClientForm
          busy={busy}
          saveLabel="Add to records"
          showPrivate={isCoach}
          compact
          onSave={async (values) => {
            let id: string | undefined;
            const ok = await act(async () => {
              id = await create(values);
            }, "Added to records");
            if (ok && id) router.push(`/coach/clients/${id}`);
          }}
        />
      </Modal>
    </div>
  );
}
