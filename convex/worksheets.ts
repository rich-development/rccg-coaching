import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { bad, isoDate, link, logActivity, notFound, optText, requireTeam } from "./lib/auth";

/** Assign only the exercise needed now. The client gets her own copy. */
export const assign = mutation({
  args: {
    clientId: v.id("clients"),
    templateKey: v.string(),
    engagementId: v.optional(v.id("engagements")),
    note: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    linkUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const client = await ctx.db.get(args.clientId);
    if (!client) notFound("Client");
    const template = await ctx.db
      .query("worksheetTemplates")
      .withIndex("by_key", (q) => q.eq("key", args.templateKey))
      .unique();
    if (!template) notFound("Worksheet");
    const id = await ctx.db.insert("worksheetAssignments", {
      clientId: args.clientId,
      engagementId: args.engagementId,
      templateKey: template.key,
      title: template.title,
      intro: template.intro,
      fields: template.fields,
      responses: {},
      status: "assigned",
      note: optText(args.note, 1000),
      dueDate: isoDate(args.dueDate, "Due date"),
      linkUrl: link(args.linkUrl, "Worksheet link"),
      assignedAt: Date.now(),
    });
    await logActivity(ctx, viewer, "worksheet.assigned", `Assigned "${template.title}" to ${client.preferredName}`, args.clientId, id);
    return id;
  },
});

export const review = mutation({
  args: { id: v.id("worksheetAssignments"), comment: v.optional(v.string()), reopen: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const w = await ctx.db.get(args.id);
    if (!w) notFound("Worksheet");
    await ctx.db.patch(args.id, {
      status: args.reopen ? "draft" : "reviewed",
      coachComment: optText(args.comment, 2000) ?? w.coachComment,
    });
    await logActivity(ctx, viewer, "worksheet.reviewed", `${args.reopen ? "Reopened" : "Reviewed"} "${w.title}"`, w.clientId, args.id);
  },
});

export const remove = mutation({
  args: { id: v.id("worksheetAssignments") },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const w = await ctx.db.get(args.id);
    if (!w) return;
    if (w.status !== "assigned") {
      // Never delete a client's writing by accident.
      bad("This worksheet has answers. It cannot be removed.");
    }
    await ctx.db.delete(args.id);
    await logActivity(ctx, viewer, "worksheet.removed", `Removed unstarted worksheet "${w.title}"`, w.clientId);
  },
});
