"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Button, Empty, Loading, TextArea, useAct } from "@/components/ui";
import { dateTime } from "@/lib/format";

export default function PortalMessages() {
  const data = useQuery(api.portal.messages, {});
  const home = useQuery(api.portal.home, {});
  const send = useMutation(api.portal.sendMessage);
  const markRead = useMutation(api.portal.markMessagesRead);
  const { act, busy } = useAct();
  const [body, setBody] = useState("");
  const [about, setAbout] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const count = data?.messages.length ?? 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
    if (count > 0) markRead({}).catch(() => {});
  }, [count, markRead]);
  if (!data) return <Loading />;
  const first = data.coachName.split(" ")[0];
  const topics = [
    ...(home?.actions ?? []).map((a) => ({ type: "action" as const, id: a._id as string, label: a.title })),
    ...(home?.worksheets ?? []).map((w) => ({ type: "worksheet" as const, id: w._id as string, label: w.title })),
  ];
  return (
    <div>
      <header className="mb-5">
        <h1 className="text-[1.9rem] leading-tight">Messages with {first}</h1>
        <span className="swash" aria-hidden />
        <p className="mt-3 text-sm text-soft">
          {first} replies {data.responseWindow.toLowerCase()}. {data.supportTerms ? `Your plan includes: ${data.supportTerms.charAt(0).toLowerCase() + data.supportTerms.slice(1)}` : ""} For bigger questions, she may save them for your next session.
        </p>
      </header>
      <div className="rounded-lg border border-line">
        <div className="max-h-[55vh] space-y-3 overflow-y-auto p-4">
          {data.messages.length === 0 && <Empty>No messages yet. Say hello or ask a question below.</Empty>}
          {data.messages.map((m) => (
            <div key={m._id} className={`flex ${m.from === "client" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg px-3.5 py-2.5 ${m.from === "client" ? "bg-gold-50" : "bg-pine-50"}`}>
                {m.ref && <div className="mb-1 text-xs text-gold-700">About: {m.ref.label}</div>}
                <div className="whitespace-pre-wrap text-[0.95rem]">{m.body}</div>
                <div className="mt-1 text-xs text-soft">{m.from === "client" ? "You" : m.authorName}, {dateTime(m.createdAt)}</div>
              </div>
            </div>
          ))}
          <div ref={bottom} />
        </div>
        <form
          className="border-t border-line p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const topic = topics.find((t) => t.id === about);
            if (await act(() => send({ body, ref: topic }), "Message sent")) {
              setBody("");
              setAbout("");
            }
          }}
        >
          <TextArea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} placeholder={`Write to ${first}`} aria-label="Your message" />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button type="submit" tone="primary" disabled={busy || !body.trim()}>Send message</Button>
            {topics.length > 0 && (
              <select value={about} onChange={(e) => setAbout(e.target.value)} aria-label="What is this about?" className="max-w-full rounded-md border border-line bg-paper px-2 py-2 text-sm">
                <option value="">This is about&hellip; (optional)</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
