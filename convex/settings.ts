import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  bad,
  link,
  logActivity,
  normalizeEmail,
  requireCoach,
  requireTeam,
  text,
} from "./lib/auth";
import {
  DEFAULT_SERVICES,
  DEFAULT_SETTINGS,
  DEFAULT_TEMPLATES,
  DEFAULT_WORKSHEETS,
} from "./lib/defaults";

export async function readSettings(ctx: QueryCtx) {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", "main"))
    .unique();
  return row ?? { ...DEFAULT_SETTINGS, _id: null };
}

/** Loads the Starter Kit defaults the first time the coach signs in. */
export async function ensureDefaults(ctx: MutationCtx) {
  const existing = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", "main"))
    .unique();
  if (existing) return;
  await ctx.db.insert("settings", DEFAULT_SETTINGS);
  for (const s of DEFAULT_SERVICES) await ctx.db.insert("services", s);
  let sort = 1;
  for (const w of DEFAULT_WORKSHEETS) {
    await ctx.db.insert("worksheetTemplates", { ...w, active: true, sort: sort++ });
  }
  for (const t of DEFAULT_TEMPLATES) await ctx.db.insert("messageTemplates", t);
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireTeam(ctx);
    const s = await readSettings(ctx);
    return {
      ...s,
      aiKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
    };
  },
});

export const update = mutation({
  args: {
    coachName: v.string(),
    businessName: v.string(),
    timeZone: v.string(),
    responseWindow: v.string(),
    supportChannel: v.string(),
    discoveryLink: v.string(),
    schedulingLink: v.string(),
    assessmentsLink: v.string(),
    officeAddress: v.string(),
    weeklySessionCapacity: v.number(),
    aiEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const viewer = await requireCoach(ctx);
    await ensureDefaults(ctx);
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "main"))
      .unique();
    if (args.weeklySessionCapacity < 0 || args.weeklySessionCapacity > 100) {
      bad("Weekly capacity must be between 0 and 100.");
    }
    await ctx.db.patch(row!._id, {
      coachName: text(args.coachName, 120),
      businessName: text(args.businessName, 160),
      timeZone: text(args.timeZone, 80),
      responseWindow: text(args.responseWindow, 200),
      supportChannel: text(args.supportChannel, 120),
      discoveryLink: link(args.discoveryLink, "Discovery link") ?? "",
      schedulingLink: link(args.schedulingLink, "Scheduling link") ?? "",
      assessmentsLink: link(args.assessmentsLink, "Assessments link") ?? "",
      officeAddress: text(args.officeAddress, 300),
      weeklySessionCapacity: Math.round(args.weeklySessionCapacity),
      aiEnabled: args.aiEnabled,
    });
    await logActivity(ctx, viewer, "settings.updated", "Updated practice settings");
  },
});

export const team = query({
  args: {},
  handler: async (ctx) => {
    await requireCoach(ctx);
    return await ctx.db.query("teamMembers").collect();
  },
});

export const addStaff = mutation({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireCoach(ctx);
    const email = normalizeEmail(text(args.email, 200, "Email"));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad("Enter a valid email.");
    const existing = await ctx.db
      .query("teamMembers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { active: true, name: text(args.name, 120) });
    } else {
      await ctx.db.insert("teamMembers", {
        email,
        name: text(args.name, 120, "Name"),
        role: "staff",
        active: true,
        addedAt: Date.now(),
      });
    }
    await logActivity(ctx, viewer, "team.added", `Gave staff access to ${email}`);
  },
});

export const setStaffActive = mutation({
  args: { id: v.id("teamMembers"), active: v.boolean() },
  handler: async (ctx, args) => {
    const viewer = await requireCoach(ctx);
    const member = await ctx.db.get(args.id);
    if (!member) return;
    await ctx.db.patch(args.id, { active: args.active });
    await logActivity(
      ctx,
      viewer,
      "team.changed",
      `${args.active ? "Restored" : "Removed"} staff access for ${member.email}`,
    );
  },
});

export const activity = query({
  args: { clientId: v.optional(v.id("clients")), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireCoach(ctx);
    const limit = Math.min(args.limit ?? 100, 300);
    if (args.clientId) {
      return await ctx.db
        .query("activity")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
        .order("desc")
        .take(limit);
    }
    return await ctx.db.query("activity").withIndex("by_time").order("desc").take(limit);
  },
});
