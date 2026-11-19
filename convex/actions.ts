import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { actionStatus } from "./schema";
import { bad, isoDate, logActivity, notFound, optText, requireTeam, text } from "./lib/auth";

const MAX_PER_SESSION = 3;

/** One priority and up to three client actions per session. */
export const create = mutation({
  args: {
    clientId: v.id("clients"),
    sessionId: v.optional(v.id("sessions")),
    title: v.string(),
    owner: v.union(v.literal("client"), v.literal("coach")),
    visibleToClient: v.optional(v.boolean()),
    dueDate: v.optional(v.string()),
    doneLooksLike: v.optional(v.string()),
    obstacle: v.optional(v.string()),
    smallerStep: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const client = await ctx.db.get(args.clientId);
    if (!client) notFound("Client");
    const title = text(args.title, 400, "Action");
    if (!title) bad("Describe the action.");
    let engagementId = undefined;
    if (args.sessionId) {
      const session = await ctx.db.get(args.sessionId);
      if (!session || session.clientId !== args.clientId) bad("That session belongs to a different client.");
      engagementId = session.engagementId;
      if (args.owner === "client") {
        const existing = await ctx.db
          .query("actions")
          .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
          .collect();
        const live = existing.filter((a) => a.owner === "client" && a.status !== "dropped" && a.status !== "revised");
        if (live.length >= MAX_PER_SESSION) {
          bad("Keep it to three client actions per session. Drop or revise one before adding another.");
        }
      }
    }
    const id = await ctx.db.insert("actions", {
      clientId: args.clientId,
      engagementId,
      sessionId: args.sessionId,
      title,
      owner: args.owner,
      visibleToClient: args.owner === "client" ? true : (args.visibleToClient ?? false),
      dueDate: isoDate(args.dueDate, "Due date"),
      doneLooksLike: optText(args.doneLooksLike, 600),
      obstacle: optText(args.obstacle, 600),
      smallerStep: optText(args.smallerStep, 600),
      status: "open",
      createdAt: Date.now(),
    });
    await logActivity(ctx, viewer, "action.created", `Added action for ${args.owner === "client" ? client.preferredName : "Tamika"}: ${title}`, args.clientId, id);
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("actions"),
    title: v.string(),
    dueDate: v.optional(v.string()),
    doneLooksLike: v.optional(v.string()),
    obstacle: v.optional(v.string()),
    smallerStep: v.optional(v.string()),
    visibleToClient: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...args }) => {
    await requireTeam(ctx);
    const a = await ctx.db.get(id);
    if (!a) notFound("Action");
    await ctx.db.patch(id, {
      title: text(args.title, 400, "Action"),
      dueDate: isoDate(args.dueDate, "Due date"),
      doneLooksLike: optText(args.doneLooksLike, 600),
      obstacle: optText(args.obstacle, 600),
      smallerStep: optText(args.smallerStep, 600),
      visibleToClient: a.owner === "client" ? true : (args.visibleToClient ?? a.visibleToClient),
    });
  },
});

export const setStatus = mutation({
  args: { id: v.id("actions"), status: actionStatus, evidence: v.optional(v.string()), reviewNote: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const a = await ctx.db.get(args.id);
    if (!a) notFound("Action");
    await ctx.db.patch(args.id, {
      status: args.status,
      evidence: optText(args.evidence, 1000) ?? a.evidence,
      reviewNote: optText(args.reviewNote, 1000) ?? a.reviewNote,
      completedAt: args.status === "completed" ? (a.completedAt ?? Date.now()) : undefined,
    });
    await logActivity(ctx, viewer, "action.status", `Marked "${a.title}" as ${args.status.replace("_", " ")}`, a.clientId, args.id);
  },
});

/**
 * Revise instead of carrying an unrealistic task forward. The old action is
 * kept as history and a new, smaller or changed one takes its place.
 */
export const revise = mutation({
  args: {
    id: v.id("actions"),
    whatHappened: v.string(),
    title: v.string(),
    dueDate: v.optional(v.string()),
    doneLooksLike: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const a = await ctx.db.get(args.id);
    if (!a) notFound("Action");
    const title = text(args.title, 400, "Action");
    if (!title) bad("Describe the revised action.");
    await ctx.db.patch(args.id, { status: "revised", reviewNote: text(args.whatHappened, 1000, "What happened") });
    const id = await ctx.db.insert("actions", {
      clientId: a.clientId,
      engagementId: a.engagementId,
      sessionId: a.sessionId,
      title,
      owner: a.owner,
      visibleToClient: a.visibleToClient,
      dueDate: isoDate(args.dueDate, "Due date"),
      doneLooksLike: optText(args.doneLooksLike, 600),
      status: "open",
      revisedFromId: args.id,
      createdAt: Date.now(),
    });
    await logActivity(ctx, viewer, "action.revised", `Revised "${a.title}" to "${title}"`, a.clientId, id);
    return id;
  },
});
