"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { Badge, Empty, LinkButton, Loading, SafeLink } from "@/components/ui";
import { ago, dateTime, dayBounds, dayLabel, timeOnly } from "@/lib/format";

type Item = { kind: string; title: string; detail: string; href: string; when?: number; urgent?: boolean };

function ItemList({ items, empty }: { items: Item[]; empty: string }) {
  if (items.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-paper">
      {items.map((item, i) => (
        <li key={i}>
          <Link href={item.href} className="flex items-start gap-3 px-4 py-3 hover:bg-gold-50">
            <span className="mt-0.5 w-[6.75rem] shrink-0">
              <Badge tone={item.urgent ? "clay" : "neutral"}>{item.kind}</Badge>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">{item.title}</span>
              <span className="block text-[13px] text-soft">
                {item.detail}
                {item.when ? `, ${ago(item.when)}` : ""}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function TodayPage() {
  const bounds = useMemo(() => dayBounds(), []);
  const data = useQuery(api.dashboard.today, bounds);
  if (!data) return <Loading />;
  const today = data.appointments.filter((a) => a.isToday);
  const later = data.appointments.filter((a) => !a.isToday);

  return (
    <div>
      <header className="mb-7">
        <p className="text-sm text-soft">{dayLabel(bounds.dayStart)}</p>
        <h1 className="mt-1 text-[2.1rem] leading-tight">Today</h1>
        <span className="swash" aria-hidden />
        <p className="mt-3 text-sm text-soft">
          {data.counts.activeClients} active client{data.counts.activeClients === 1 ? "" : "s"} and {data.counts.openInquiries} open{" "}
          {data.counts.openInquiries === 1 ? "inquiry" : "inquiries"}.
        </p>
      </header>

      <section className="mb-8" aria-label="Today's appointments">
        {today.length === 0 ? (
          <Empty>No appointments today.</Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {today.map((a) => (
              <div key={a._id} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-line border-l-4 border-l-gold-500 bg-paper p-4">
                <div className="w-24 shrink-0">
                  <div className="display whitespace-nowrap text-xl leading-none">{timeOnly(a.at)}</div>
                  <div className="mt-1 text-xs text-soft">{a.durationMinutes} min</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{a.clientName}</div>
                  <div className="truncate text-[13px] text-soft">{a.label}</div>
                  {a.meetLink && (
                    <SafeLink href={a.meetLink} className="text-[13px]">
                      Open Google Meet
                    </SafeLink>
                  )}
                </div>
                <LinkButton href={a.href} tone="primary" small>
                  {a.kind === "session" ? "Today’s Coaching" : "Open roster"}
                </LinkButton>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-[1.35rem]">Who needs my attention?</h2>
          <ItemList items={data.attention} empty="Nobody is waiting on you right now." />
        </section>
        <section>
          <h2 className="mb-3 text-[1.35rem]">What needs to happen next?</h2>
          <ItemList items={data.next} empty="Nothing is due. Every follow-up is up to date." />
        </section>
      </div>

      {later.length > 0 && (
        <section className="mt-9">
          <h2 className="mb-3 text-[1.15rem]">Later this week</h2>
          <ul className="divide-y divide-line rounded-lg border border-line bg-paper">
            {later.map((a) => (
              <li key={a._id}>
                <Link href={a.href} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm hover:bg-gold-50">
                  <span className="w-44 text-soft">{dateTime(a.at)}</span>
                  <span className="font-medium">{a.clientName}</span>
                  <span className="text-soft">{a.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
