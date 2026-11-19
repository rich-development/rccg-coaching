"use client";

import { useMutation, useQuery } from "convex/react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Button, Field, Input, LinkButton } from "@/components/ui";
import { errorMessage, money } from "@/lib/format";

export default function CoworkRegistration() {
  const { slug } = useParams<{ slug: string }>();
  const info = useQuery(api.coworking.publicInfo, { slug });
  const register = useMutation(api.coworking.publicRegister);
  const [v, setV] = useState({ name: "", email: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ status: "registered" | "waitlist"; paymentLink: string | null } | null>(null);

  return (
    <main className="min-h-screen bg-paper px-5 py-10">
      <div className="mx-auto max-w-xl">
        <Image src="/brand/tr-horizontal-dark.png" alt="Tamika Rich" width={900} height={435} priority className="h-auto w-44" />
        {info === undefined ? (
          <p className="mt-10 text-soft">Loading&hellip;</p>
        ) : info === null ? (
          <div className="mt-10">
            <h1 className="text-3xl">This session is not open</h1>
            <p className="mt-3 text-soft">The link may be old, or sign-up has not started yet. Message Tamika to ask about the next co-working date.</p>
          </div>
        ) : (
          <>
            <h1 className="mt-10 text-[2.2rem] leading-tight">{info.title}</h1>
            <span className="swash" aria-hidden />
            <p className="mt-4 text-lg">
              {new Date(info.startsAt).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: info.timeZone })}
              <span className="text-soft"> ({info.timeZone.replace("America/New_York", "Eastern Time")})</span>
            </p>
            <p className="text-soft">
              {info.durationMinutes / 60} hours, {info.format === "virtual" ? "online. You will get the link after you sign up and pay." : `in person at ${info.location}`}. {info.priceCents === 0 ? "Free." : `${money(info.priceCents)} per person.`}
            </p>
            <p className="mt-5 leading-relaxed">
              Make time for the business task you keep putting off. Join women who are starting a business, starting over, or changing direction. Bring one task, settle into focused work time, and leave with a next step.
            </p>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-soft">{info.instructions}</p>
            {info.cancellationTerms && <p className="mt-3 text-sm text-soft">If you need to cancel: {info.cancellationTerms}</p>}

            <div className="mt-8 rounded-lg border border-line border-l-4 border-l-gold-500 p-5">
              {result ? (
                result.status === "registered" ? (
                  <>
                    <h2 className="text-xl">You have a spot</h2>
                    <p className="mt-2 text-soft">{result.paymentLink ? "One more step: pay to confirm your spot. Tamika will then send you the details." : "Tamika will send you the details and how to pay."}</p>
                    {result.paymentLink && <div className="mt-4"><LinkButton href={result.paymentLink} tone="primary" external>Pay {money(info.priceCents)} now</LinkButton></div>}
                  </>
                ) : (
                  <>
                    <h2 className="text-xl">You are on the waitlist</h2>
                    <p className="mt-2 text-soft">This session is full. Tamika will email you if a spot opens up.</p>
                  </>
                )
              ) : info.status !== "open" || info.startsAt < now ? (
                <p className="text-soft">Sign-up for this session is closed.</p>
              ) : info.spotsLeft === 0 && !info.waitlistOpen ? (
                <p className="text-soft">This session and its waitlist are full.</p>
              ) : (
                <form
                  className="space-y-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setError("");
                    try {
                      setResult(await register({ slug, name: v.name, email: v.email, website: v.website || undefined }));
                    } catch (err) {
                      setError(errorMessage(err));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <h2 className="text-xl">{info.spotsLeft > 0 ? `Save your spot (${info.spotsLeft} left)` : "Join the waitlist"}</h2>
                  <Field label="Your name"><Input required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={120} autoComplete="name" /></Field>
                  <Field label="Your email" hint="Used only to send you details about this session."><Input required type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} maxLength={200} autoComplete="email" /></Field>
                  <div className="hidden" aria-hidden>
                    <label>Website<input tabIndex={-1} autoComplete="off" value={v.website} onChange={(e) => setV({ ...v, website: e.target.value })} /></label>
                  </div>
                  {error && <p className="rounded-md bg-clay-50 p-3 text-sm text-clay" role="alert">{error}</p>}
                  <Button type="submit" tone="primary" disabled={busy}>{info.spotsLeft > 0 ? "Sign me up" : "Add me to the waitlist"}</Button>
                  <p className="text-xs text-faint">This is a group work session, not private coaching. It is not recorded.</p>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
