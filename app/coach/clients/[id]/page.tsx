"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { EngagementTab } from "@/components/client/engagement";
import { Overview } from "@/components/client/overview";
import { ActionsTab, AssessmentsTab, HistoryTab, SessionsTab, WorkbookTab } from "@/components/client/tabs";
import { useIsCoach } from "@/components/role";
import { Badge, Empty, LinkButton, Loading, Tabs } from "@/components/ui";
import { dateTime, PIPELINE, STAGE_LABEL } from "@/lib/format";

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const isCoach = useIsCoach();
  const data = useQuery(api.clients.get, { id: id as Id<"clients"> });
  const tab = params.get("tab") ?? "overview";
  if (data === undefined) return <Loading />;
  if (data === null) return <Empty>This client record was not found.</Empty>;
  const c = data.client;
  const next = data.sessions.filter((s) => s.status === "scheduled").sort((a, b) => a.scheduledAt - b.scheduledAt)[0];
  const toReview = data.worksheets.filter((w) => w.status === "submitted").length;
  const unread = data.assessments.filter((a) => a.status === "completed" && !a.reviewedAt).length;
  const openActions = data.actions.filter((a) => a.status === "open" || a.status === "in_progress").length;

  return (
    <div>
      <Link href="/coach/clients" className="text-sm text-soft underline-offset-2 hover:underline">All clients</Link>
      <header className="mb-5 mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.9rem] leading-tight">{c.fullName}</h1>
          <span className="swash" aria-hidden />
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-soft">
            {c.businessName && <span>{c.businessName}</span>}
            {c.stage && <Badge tone="gold">{STAGE_LABEL[c.stage]}</Badge>}
            <Badge>{PIPELINE.find((p) => p.key === c.pipelineStage)?.label}</Badge>
            {c.archived && <Badge tone="clay">Archived</Badge>}
            {data.thread?.status === "needs_reply" && <Badge tone="clay">Needs reply</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/coach/inbox?client=${c._id}`}>Messages</LinkButton>
          {next && (
            <LinkButton href={`/coach/sessions/${next._id}`} tone="primary">
              Today&rsquo;s Coaching: {dateTime(next.scheduledAt)}
            </LinkButton>
          )}
        </div>
      </header>
      <Tabs
        value={tab}
        onChange={(key) => router.replace(`/coach/clients/${id}?tab=${key}`, { scroll: false })}
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "engagement", label: "Engagement" },
          { key: "sessions", label: "Sessions" },
          { key: "actions", label: "Commitments", count: openActions },
          { key: "workbook", label: "Workbook", count: toReview },
          { key: "assessments", label: "Assessments", count: unread },
          { key: "history", label: "History" },
        ]}
      />
      {tab === "overview" && <Overview data={data} isCoach={isCoach} />}
      {tab === "engagement" && <EngagementTab data={data} isCoach={isCoach} />}
      {tab === "sessions" && <SessionsTab data={data} />}
      {tab === "actions" && <ActionsTab data={data} />}
      {tab === "workbook" && <WorkbookTab data={data} />}
      {tab === "assessments" && <AssessmentsTab data={data} />}
      {tab === "history" && <HistoryTab data={data} isCoach={isCoach} />}
    </div>
  );
}
