"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { QuestionSet } from "@/components/worksheet";
import { Badge, Button, Empty, Loading, SafeLink, useAct } from "@/components/ui";
import { isoLabel } from "@/lib/format";

export default function WorksheetPage() {
  const { id } = useParams<{ id: string }>();
  const w = useQuery(api.portal.worksheet, { id: id as Id<"worksheetAssignments"> });
  const save = useMutation(api.portal.saveWorksheet);
  const router = useRouter();
  const { act, busy } = useAct();
  const [edits, setEdits] = useState<Record<string, string> | null>(null);
  if (w === undefined) return <Loading />;
  if (w === null) return <Empty>This page was not found.</Empty>;
  const values = edits ?? w.responses;
  const locked = w.status === "reviewed";
  const sent = w.status === "submitted";
  const persist = (submit: boolean) => save({ id: w._id, responses: Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim())), submit });
  return (
    <div>
      <Link href="/portal" className="text-sm text-soft underline-offset-2 hover:underline">Back to home</Link>
      <header className="mb-6 mt-2">
        <h1 className="text-[1.9rem] leading-tight">{w.title}</h1>
        <span className="swash" aria-hidden />
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-soft">
          {locked ? <Badge tone="moss">Tamika read this</Badge> : sent ? <Badge tone="pine">Sent to Tamika</Badge> : w.status === "draft" ? <Badge tone="gold">Draft saved</Badge> : <Badge>Not started</Badge>}
          {w.dueDate && <span>Due {isoLabel(w.dueDate)}</span>}
        </div>
        <p className="mt-3 max-w-2xl text-soft">{w.intro}</p>
        {w.note && <p className="mt-3 max-w-2xl rounded-md bg-gold-50 p-3 text-sm">A note from Tamika: {w.note}</p>}
        {w.linkUrl && <p className="mt-2 text-sm">Prefer a document? <SafeLink href={w.linkUrl}>Open the linked copy</SafeLink></p>}
      </header>
      {w.coachComment && (
        <div className="mb-6 rounded-lg border border-line border-l-4 border-l-pine bg-pine-50 p-4 text-sm">
          <div className="mb-1 font-medium">Tamika wrote back</div>
          <p className="whitespace-pre-wrap">{w.coachComment}</p>
        </div>
      )}
      <QuestionSet fields={w.fields} values={values} readOnly={locked} onChange={(k, v) => setEdits({ ...values, [k]: v })} />
      <div className="no-print mt-7 flex flex-wrap items-center gap-2 border-t border-line pt-5">
        {!locked && (
          <>
            <Button disabled={busy} onClick={() => act(() => persist(false), "Draft saved. You can come back any time.")}>Save and finish later</Button>
            <Button tone="primary" disabled={busy} onClick={async () => { if (await act(() => persist(true), "Sent to Tamika")) router.push("/portal"); }}>
              {sent ? "Send my changes to Tamika" : "Send to Tamika"}
            </Button>
          </>
        )}
        <Button onClick={() => window.print()}>Print</Button>
        <span className="text-[13px] text-soft">Short, honest answers are best. &ldquo;I don&rsquo;t know yet&rdquo; is a fine answer.</span>
      </div>
    </div>
  );
}
