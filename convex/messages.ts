import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { refDef, threadStatus } from "./schema";
import { bad, isoDate, logActivity, notFound, requireTeam, text } from "./lib/auth";
import { syncClientChecklists } from "./lib/automation";
import { postMessage } from "./lib/threads";
import { readSettings } from "./settings";

export const inbox = query({
  args: {},
  handler: async (ctx) => {
    await requireTeam(ctx);
    const threads = await ctx.db.query("threads").collect();
    const out = [];
    for (const t of threads) {
      const client = await ctx.db.get(t.clientId);
      if (!client) continue;
      const last = await ctx.db
        .query("messages")
        .withIndex("by_thread", (q) => q.eq("threadId", t._id))
        .order("desc")
        .first();
      out.push({
        ...t,
        clientName: client.preferredName,
        fullName: client.fullName,
        preview: last ? last.body.slice(0, 140) : "",
      });
    }
    const order = { needs_reply: 0, waiting_on_client: 1, resolved: 2 };
    return out.sort((a, b) => order[a.status] - order[b.status] || b.lastMessageAt - a.lastMessageAt);
  },
});

export const thread = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await requireTeam(ctx);
    const client = await ctx.db.get(args.clientId);
    if (!client) return null;
    const t = await ctx.db
      .query("threads")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .first();
    const messages = t
      ? await ctx.db
          .query("messages")
          .withIndex("by_thread", (q) => q.eq("threadId", t._id))
          .collect()
      : [];
    const engagements = await ctx.db
      .query("engagements")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    const current = engagements.find((e) => e.status === "active" || e.status === "onboarding");
    const settings = await readSettings(ctx);
    // Facts the templates ask for, so most [brackets] fill themselves.
    const sessions = current
      ? await ctx.db
          .query("sessions")
          .withIndex("by_engagement", (q) => q.eq("engagementId", current._id))
          .collect()
      : [];
    const upcoming = sessions.filter((x) => x.status === "scheduled" && x.scheduledAt > Date.now() - 3600_000).sort((a, b) => a.scheduledAt - b.scheduledAt)[0];
    const last = sessions.filter((x) => x.status === "completed").sort((a, b) => b.scheduledAt - a.scheduledAt)[0];
    const actions = await ctx.db
      .query("actions")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    const openActions = actions.filter((a) => a.visibleToClient && (a.status === "open" || a.status === "in_progress"));
    const merge = {
      goal: current?.goal ?? null,
      service: current ? `${current.serviceName} (${current.sessionsIncluded} session${current.sessionsIncluded === 1 ? "" : "s"} of ${current.sessionMinutes} minutes)` : null,
      nextAt: upcoming?.scheduledAt ?? null,
      nextWhere: upcoming ? (upcoming.format === "virtual" ? (upcoming.meetLink ?? null) : (upcoming.location ?? null)) : null,
      support: current ? `${current.supportTerms} Reach me by ${current.supportChannel.toLowerCase()}; I reply ${current.responseWindow.toLowerCase()}.` : null,
      channel: current?.supportChannel ?? settings.supportChannel,
      priority: last?.priority ?? null,
      clientActions: openActions.filter((a) => a.owner === "client").map((a) => ({ title: a.title, dueDate: a.dueDate ?? null, doneLooksLike: a.doneLooksLike ?? null })),
      coachActions: openActions.filter((a) => a.owner === "coach").map((a) => a.title),
      coachFirstName: settings.coachName.split(" ")[0],
    };
    return {
      merge,
      client: { _id: client._id, preferredName: client.preferredName, fullName: client.fullName, email: client.email, portalLinked: client.userId !== undefined },
      thread: t,
      messages,
      responseWindow: current?.responseWindow ?? settings.responseWindow,
      supportChannel: current?.supportChannel ?? settings.supportChannel,
      supportTerms: current?.supportTerms,
    };
  },
});

export const send = mutation({
  args: { clientId: v.id("clients"), body: v.string(), ref: v.optional(refDef) },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const client = await ctx.db.get(args.clientId);
    if (!client) notFound("Client");
    const body = text(args.body, 6000, "Message");
    if (!body) bad("Write a message first.");
    if (/\[[^\]]{2,60}\]/.test(body)) {
      bad("This message still has a [bracketed] placeholder. Fill it in before sending.");
    }
    await postMessage(ctx, args.clientId, "coach", viewer.name, body, args.ref);
    await syncClientChecklists(ctx, args.clientId);
    await logActivity(ctx, viewer, "message.sent", `Sent a message to ${client.preferredName}`, args.clientId);
  },
});

export const setStatus = mutation({
  args: { clientId: v.id("clients"), status: threadStatus },
  handler: async (ctx, args) => {
    await requireTeam(ctx);
    const t = await ctx.db
      .query("threads")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .first();
    if (!t) notFound("Conversation");
    await ctx.db.patch(t._id, { status: args.status });
  },
});

export const markRead = mutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await requireTeam(ctx);
    const t = await ctx.db
      .query("threads")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .first();
    if (t && t.unreadForCoach > 0) await ctx.db.patch(t._id, { unreadForCoach: 0 });
  },
});

/** Turn a client message into a dated task for Tamika. */
export const toTask = mutation({
  args: { messageId: v.id("messages"), title: v.string(), dueDate: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const m = await ctx.db.get(args.messageId);
    if (!m) notFound("Message");
    const title = text(args.title, 400, "Task");
    if (!title) bad("Name the task.");
    const id = await ctx.db.insert("actions", {
      clientId: m.clientId,
      title,
      owner: "coach",
      visibleToClient: false,
      dueDate: isoDate(args.dueDate, "Due date"),
      status: "open",
      createdAt: Date.now(),
    });
    await logActivity(ctx, viewer, "message.task", `Turned a message into a task: ${title}`, m.clientId, id);
    return id;
  },
});
