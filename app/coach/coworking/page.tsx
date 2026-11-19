"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { CoworkingForm } from "@/components/coworking-form";
import { Badge, Button, Empty, Loading, Modal, PageTitle, useAct } from "@/components/ui";
import { dateTime, money } from "@/lib/format";

const tone = { draft: "neutral", open: "moss", closed: "gold", completed: "pine", cancelled: "clay" } as const;

export default function CoworkingPage() {
  const sessions = useQuery(api.coworking.list, {});
  const settings = useQuery(api.settings.get, {});
  const create = useMutation(api.coworking.create);
  const router = useRouter();
  const { act, busy } = useAct();
  const [adding, setAdding] = useState(false);
  if (!sessions || !settings) return <Loading />;
  return (
    <div>
      <PageTitle
        title="Co-working"
        sub="Two hours of focused work in good company. Registering does not enroll anyone in private coaching, and co-working is never recorded or transcribed."
        actions={<Button tone="primary" onClick={() => setAdding(true)}>Create a session</Button>}
      />
      {sessions.length === 0 ? (
        <Empty>No co-working sessions yet. Create one to get a registration link.</Empty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {sessions.map((s) => (
            <li key={s._id}>
              <Link href={`/coach/coworking/${s._id}`} className="block rounded-lg border border-line bg-paper p-4 hover:border-gold-500">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="display text-lg">{s.title}</div>
                    <div className="text-sm text-soft">{dateTime(s.startsAt)}, {s.format === "virtual" ? "virtual" : "in person"}</div>
                  </div>
                  <Badge tone={tone[s.status]}>{s.status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-soft">
                  <span>{s.registered} of {s.capacity} registered</span>
                  <span>{s.paid} paid</span>
                  {s.waitlist > 0 && <span>{s.waitlist} on waitlist</span>}
                  {s.status === "completed" && <span>{s.attended} attended</span>}
                  <span>{money(s.priceCents)} per person</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="Create a co-working session" wide>
        <p className="mb-4 text-sm text-soft">It starts as a draft. Confirm the date, capacity, and payment route, then open it for registration.</p>
        <CoworkingForm
          officeAddress={settings.officeAddress}
          timeZone={settings.timeZone}
          showStatus={false}
          busy={busy}
          saveLabel="Create draft"
          onSave={async ({ status: _status, ...values }) => {
            void _status;
            let id: string | undefined;
            if (await act(async () => { id = await create(values); }, "Session created")) router.push(`/coach/coworking/${id}`);
          }}
        />
      </Modal>
    </div>
  );
}
