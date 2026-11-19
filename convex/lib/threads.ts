import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function postMessage(
  ctx: MutationCtx,
  clientId: Id<"clients">,
  from: "client" | "coach",
  authorName: string,
  body: string,
  ref?: Doc<"messages">["ref"],
) {
  const now = Date.now();
  let thread = await ctx.db
    .query("threads")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))
    .first();
  if (!thread) {
    const id = await ctx.db.insert("threads", {
      clientId,
      status: from === "client" ? "needs_reply" : "waiting_on_client",
      lastMessageAt: now,
      lastFrom: from,
      unreadForCoach: 0,
      unreadForClient: 0,
    });
    thread = (await ctx.db.get(id))!;
  }
  await ctx.db.insert("messages", {
    threadId: thread._id,
    clientId,
    from,
    authorName,
    body,
    ref,
    createdAt: now,
  });
  await ctx.db.patch(thread._id, {
    lastMessageAt: now,
    lastFrom: from,
    status: from === "client" ? "needs_reply" : "waiting_on_client",
    unreadForCoach: from === "client" ? thread.unreadForCoach + 1 : 0,
    unreadForClient: from === "coach" ? thread.unreadForClient + 1 : thread.unreadForClient,
  });
  return thread._id;
}
