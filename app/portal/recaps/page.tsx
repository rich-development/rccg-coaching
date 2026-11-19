"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Empty, Loading } from "@/components/ui";
import { dayLabel, isoLabel } from "@/lib/format";

export default function PortalRecaps() {
  const recaps = useQuery(api.portal.recaps, {});
  if (!recaps) return <Loading />;
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[1.9rem] leading-tight">Session notes</h1>
        <span className="swash" aria-hidden />
        <p className="mt-3 text-sm text-soft">A short recap of each session: what you decided and what comes next. Tell Tamika if anything looks wrong.</p>
      </header>
      {recaps.length === 0 ? (
        <Empty>Your recaps will show up here after your first session.</Empty>
      ) : (
        <ol className="space-y-5">
          {recaps.map((r) => (
            <li key={r._id} className="rounded-lg border border-line p-5">
              <h2 className="text-[1.2rem]">Session {r.number}</h2>
              <p className="text-sm text-soft">{dayLabel(r.scheduledAt)}</p>
              {r.priority && <p className="mt-3 text-sm"><span className="text-soft">We focused on:</span> {r.priority}</p>}
              {r.recap ? <p className="mt-3 whitespace-pre-wrap leading-relaxed">{r.recap}</p> : <p className="mt-3 text-sm text-soft">Tamika is still writing this recap.</p>}
              {r.actions.length > 0 && (
                <ul className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
                  {r.actions.map((a) => (
                    <li key={a._id} className="flex flex-wrap items-center gap-2">
                      <span>{a.title}</span>
                      {a.dueDate && <span className="text-soft">by {isoLabel(a.dueDate)}</span>}
                      {a.status === "completed" ? <Badge tone="moss">Done</Badge> : a.status === "revised" ? <Badge>Changed</Badge> : a.status === "dropped" ? <Badge>No longer needed</Badge> : null}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
