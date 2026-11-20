"use client";

import { useMutation } from "convex/react";
import Image from "next/image";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Button, Field, Input, Select, TextArea } from "@/components/ui";
import { errorMessage } from "@/lib/format";

type Stage = "starting" | "starting_over" | "pivoting";
const STAGES: [Stage, string][] = [["starting", "I am starting a business"], ["starting_over", "I am starting over"], ["pivoting", "I am changing direction"]];

export default function StartPage() {
  const send = useMutation(api.clients.publicInquiry);
  const [v, setV] = useState({ name: "", email: "", stage: "", business: "", message: "", foundBy: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((old) => ({ ...old, [k]: e.target.value }));

  return (
    <main className="min-h-screen bg-paper px-5 py-10">
      <div className="mx-auto max-w-xl">
        <Image src="/brand/tr-horizontal-dark.png" alt="Tamika Rich" width={900} height={435} priority className="h-auto w-44" />
        {done ? (
          <div className="mt-10">
            <h1 className="text-3xl">Thank you. Your note is in.</h1>
            <span className="swash" aria-hidden />
            <p className="mt-4 leading-relaxed">Tamika reads every note herself. She will email you back to set up a short call. You do not need to do anything else right now.</p>
          </div>
        ) : (
          <>
            <h1 className="mt-10 text-[2.2rem] leading-tight">Tell Tamika about your business</h1>
            <span className="swash" aria-hidden />
            <p className="mt-4 leading-relaxed">Starting a business, starting over, or changing direction? Share a little about where you are. Tamika will write back to set up a short call. There is no cost and nothing to prepare.</p>
            <form
              className="mt-8 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await send({
                    name: v.name,
                    email: v.email,
                    stage: (v.stage || undefined) as Stage | undefined,
                    business: v.business || undefined,
                    message: v.message || undefined,
                    foundBy: v.foundBy || undefined,
                    website: v.website || undefined,
                  });
                  setDone(true);
                } catch (err) {
                  setError(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label="Your name"><Input required value={v.name} onChange={set("name")} maxLength={160} autoComplete="name" /></Field>
              <Field label="Email"><Input required type="email" value={v.email} onChange={set("email")} maxLength={200} autoComplete="email" /></Field>
              <Field label="Where are you right now?">
                <Select value={v.stage} onChange={set("stage")}>
                  <option value="">Choose one</option>
                  {STAGES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </Select>
              </Field>
              <Field label="Your business or idea" hint="A sentence is plenty."><Input value={v.business} onChange={set("business")} maxLength={300} /></Field>
              <Field label="What do you want help with?"><TextArea rows={5} value={v.message} onChange={set("message")} maxLength={2000} /></Field>
              <Field label="How did you hear about Tamika?"><Input value={v.foundBy} onChange={set("foundBy")} maxLength={200} /></Field>
              <div className="hidden" aria-hidden>
                <label>Website<input tabIndex={-1} autoComplete="off" value={v.website} onChange={set("website")} /></label>
              </div>
              {error && <p role="alert" className="text-sm text-clay">{error}</p>}
              <Button type="submit" tone="primary" disabled={busy}>{busy ? "Sending" : "Send to Tamika"}</Button>
              <p className="text-[13px] text-soft">Your answers go only to Tamika and her team. They are not shared or sold.</p>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
