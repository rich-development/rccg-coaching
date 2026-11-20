"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Empty, Field, Input, Loading, Modal, PageTitle, Select, useAct } from "@/components/ui";
import { Composer, countBlanks, RichText } from "@/components/rich";
import { ago, dateTime, todayIso } from "@/lib/format";
import { fillTemplate } from "@/lib/merge";

const statusLabel = { needs_reply: "Needs reply", waiting_on_client: "Waiting on client", resolved: "Resolved" } as const;
const statusTone = { needs_reply: "clay", waiting_on_client: "gold", resolved: "moss" } as const;

function Thread({ clientId }: { clientId: Id<"clients"> }) {
  const data = useQuery(api.messages.thread, { clientId });
  const templates = useQuery(api.library.templates, {});
  const send = useMutation(api.messages.send);
  const setStatus = useMutation(api.messages.setStatus);
  const markRead = useMutation(api.messages.markRead);
  const toTask = useMutation(api.messages.toTask);
  const { act, busy } = useAct();
  const [body, setBody] = useState("");
  const [task, setTask] = useState<{ id: Id<"messages">; title: string; dueDate: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const count = data?.messages.length ?? 0;
  const unread = data?.thread?.unreadForCoach ?? 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [count]);
  useEffect(() => {
    if (unread > 0) markRead({ clientId }).catch(() => {});
  }, [unread, clientId, markRead]);
  if (data === undefined) return <Loading />;
  if (data === null) return <Empty>This conversation was not found.</Empty>;
  const first = data.client.preferredName;
  return (
    <div className="flex min-h-[28rem] flex-col rounded-lg border border-line bg-paper">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <Link href={`/coach/clients/${clientId}`} className="display text-lg underline-offset-2 hover:underline">{data.client.fullName}</Link>
          <div className="text-[13px] text-soft">
            Agreed channel: {data.supportChannel}. Reply {data.responseWindow.toLowerCase()}.{!data.client.portalLinked && " She has not signed in to her portal yet, so she will not see messages here."}
          </div>
        </div>
        {data.thread && (
          <Select aria-label="Conversation status" value={data.thread.status} className="!w-auto" disabled={busy} onChange={(e) => act(() => setStatus({ clientId, status: e.target.value as "resolved" }), "Status updated")}>
            <option value="needs_reply">Needs reply</option>
            <option value="waiting_on_client">Waiting on client</option>
            <option value="resolved">Resolved</option>
          </Select>
        )}
      </div>
      <div className="max-h-[52vh] flex-1 space-y-3 overflow-y-auto p-4">
        {data.messages.length === 0 && <Empty>No messages yet. Start with a welcome.</Empty>}
        {data.messages.map((m) => (
          <div key={m._id} className={`flex ${m.from === "coach" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm ${m.from === "coach" ? "bg-pine-50" : "border border-line bg-gold-50"}`}>
              {m.ref && <div className="mb-1 text-xs text-gold-700">About: {m.ref.label}</div>}
              <RichText text={m.body} />
              <div className="mt-1.5 flex items-center gap-3 text-xs text-soft">
                <span>{m.authorName}, {dateTime(m.createdAt)}</span>
                {m.from === "client" && (
                  <button type="button" className="text-pine underline underline-offset-2" onClick={() => setTask({ id: m._id, title: `Follow up with ${first}: `, dueDate: todayIso(2) })}>
                    Make this a task
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form
        className="border-t border-line p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act(() => send({ clientId, body }), "Message sent")) setBody("");
        }}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-soft">Start from a template:</span>
          {(templates ?? []).map((t) => (
            <button key={t._id} type="button" className="rounded-full border border-line px-2.5 py-0.5 text-[13px] hover:bg-mist" onClick={() => setBody(fillTemplate(t.body, first, data.merge))}>
              {t.name}
            </button>
          ))}
        </div>
        <Composer value={body} onChange={setBody} placeholder={`Write to ${first}`} label="Message" />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button type="submit" tone="primary" disabled={busy || !body.trim() || countBlanks(body) > 0}>Send message</Button>
          <span className="text-[13px] text-soft">
            {countBlanks(body) > 0 ? "Fill in or remove each highlighted blank to send." : "Templates fill in what her record already knows."}
          </span>
        </div>
      </form>
      <Modal open={!!task} onClose={() => setTask(null)} title="Make this a task">
        {task && (
          <div className="space-y-3">
            <Field label="Task"><Input value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} maxLength={400} /></Field>
            <Field label="Due date"><Input type="date" value={task.dueDate} onChange={(e) => setTask({ ...task, dueDate: e.target.value })} /></Field>
            <Button tone="primary" disabled={busy} onClick={async () => { if (await act(() => toTask({ messageId: task.id, title: task.title, dueDate: task.dueDate }), "Task added to your follow-ups")) setTask(null); }}>
              Add task
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function InboxPage() {
  const inbox = useQuery(api.messages.inbox, {});
  const clients = useQuery(api.clients.list, {});
  const params = useSearchParams();
  const router = useRouter();
  const selected = params.get("client");
  if (!inbox || !clients) return <Loading />;
  const withoutThread = clients.filter((c) => !inbox.some((t) => t.clientId === c._id));
  const open = (id: string) => router.replace(`/coach/inbox?client=${id}`, { scroll: false });
  return (
    <div>
      <PageTitle title="Messages" sub="One private thread per client. Every conversation lands here." />
      <div className="grid gap-5 lg:grid-cols-[19rem_1fr]">
        <div>
          {inbox.length === 0 ? (
            <Empty>No conversations yet.</Empty>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-paper">
              {inbox.map((t) => (
                <li key={t._id}>
                  <button type="button" onClick={() => open(t.clientId)} className={`block w-full px-4 py-3 text-left hover:bg-gold-50 ${selected === t.clientId ? "bg-gold-50" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{t.fullName}</span>
                      <Badge tone={statusTone[t.status]}>{statusLabel[t.status]}</Badge>
                    </div>
                    <div className="mt-0.5 truncate text-[13px] text-soft">{t.preview}</div>
                    <div className="mt-0.5 text-xs text-faint">{ago(t.lastMessageAt)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {withoutThread.length > 0 && (
            <div className="mt-4">
              <Select aria-label="Start a conversation" value="" onChange={(e) => e.target.value && open(e.target.value)}>
                <option value="">Start a conversation with&hellip;</option>
                {withoutThread.map((c) => (
                  <option key={c._id} value={c._id}>{c.fullName}</option>
                ))}
              </Select>
            </div>
          )}
        </div>
        {selected ? <Thread key={selected} clientId={selected as Id<"clients">} /> : <Empty>Choose a conversation.</Empty>}
      </div>
    </div>
  );
}
