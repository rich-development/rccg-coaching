"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { QuestionSet } from "@/components/worksheet";
import { Button, Empty, Loading, SafeLink, useAct } from "@/components/ui";

export default function AssessmentPage() {
  const { id } = useParams<{ id: string }>();
  const a = useQuery(api.portal.assessment, { id: id as Id<"assessments"> });
  const submit = useMutation(api.portal.submitAssessment);
  const router = useRouter();
  const { act, busy } = useAct();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  if (a === undefined) return <Loading />;
  if (a === null) return <Empty>This page was not found.</Empty>;
  const done = a.status === "completed";
  return (
    <div>
      <Link href="/portal" className="text-sm text-soft underline-offset-2 hover:underline">Back to home</Link>
      <header className="mb-6 mt-2">
        <h1 className="text-[1.9rem] leading-tight">{a.title}</h1>
        <span className="swash" aria-hidden />
        <p className="mt-3 max-w-2xl text-soft">
          {done
            ? "Thank you. Tamika has your answers."
            : a.kind === "intake"
              ? "This takes about 10 minutes. Your answers help Tamika get ready for your first session. Share only what feels useful."
              : a.kind === "feedback"
                ? "Please be honest. Your feedback helps Tamika get better. It is private and will never be shared without asking you first."
                : "A brief reply is fine. Tamika reads this before your next session."}
        </p>
        {!done && a.externalUrl && <p className="mt-2 text-sm">You can also answer here: <SafeLink href={a.externalUrl}>open the assessment link</SafeLink></p>}
      </header>
      <QuestionSet fields={a.questions} values={done ? a.answers : answers} readOnly={done} onChange={(k, v) => setAnswers((old) => ({ ...old, [k]: v }))} />
      {!done && (
        <div className="mt-7 border-t border-line pt-5">
          <Button tone="primary" disabled={busy} onClick={async () => { if (await act(() => submit({ id: a._id, answers: Object.fromEntries(Object.entries(answers).filter(([, v]) => v.trim())) }), "Sent to Tamika. Thank you.")) router.push("/portal"); }}>
            Send to Tamika
          </Button>
        </div>
      )}
    </div>
  );
}
