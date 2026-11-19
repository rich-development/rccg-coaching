import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fieldDef } from "./schema";
import { bad, logActivity, notFound, requirePermission, requireTeam, text } from "./lib/auth";
import { ASSESSMENT_KINDS, DISCOVERY_GUIDE } from "./lib/defaults";

export const services = query({
  args: {},
  handler: async (ctx) => {
    await requireTeam(ctx);
    const rows = await ctx.db.query("services").collect();
    return rows.sort((a, b) => a.sort - b.sort);
  },
});

/** Changes apply to future clients only. Existing engagements keep their terms. */
export const saveService = mutation({
  args: {
    id: v.id("services"),
    name: v.string(),
    priceCents: v.number(),
    priceNote: v.string(),
    sessionsIncluded: v.number(),
    sessionMinutes: v.number(),
    durationWeeks: v.optional(v.number()),
    supportTerms: v.string(),
    description: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "settings");
    const row = await ctx.db.get(args.id);
    if (!row) notFound("Service");
    if (args.priceCents < 0 || args.priceCents > 10_000_00) bad("Check the price.");
    if (args.sessionsIncluded < 1 || args.sessionsIncluded > 60) bad("Check the session count.");
    if (args.sessionMinutes < 5 || args.sessionMinutes > 480) bad("Check the session length.");
    await ctx.db.patch(args.id, {
      name: text(args.name, 120, "Name"),
      priceCents: Math.round(args.priceCents),
      priceNote: text(args.priceNote, 120),
      sessionsIncluded: Math.round(args.sessionsIncluded),
      sessionMinutes: Math.round(args.sessionMinutes),
      durationWeeks: args.durationWeeks,
      supportTerms: text(args.supportTerms, 600),
      description: text(args.description, 800),
      active: args.active,
    });
    await logActivity(ctx, viewer, "service.updated", `Updated the ${args.name} offering for future clients`);
  },
});

export const worksheets = query({
  args: {},
  handler: async (ctx) => {
    await requireTeam(ctx);
    const rows = await ctx.db.query("worksheetTemplates").collect();
    return rows.sort((a, b) => a.sort - b.sort);
  },
});

export const saveWorksheet = mutation({
  args: {
    id: v.id("worksheetTemplates"),
    title: v.string(),
    intro: v.string(),
    fields: v.array(fieldDef),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "settings");
    const row = await ctx.db.get(args.id);
    if (!row) notFound("Worksheet");
    if (args.fields.length === 0 || args.fields.length > 30) bad("A worksheet needs 1 to 30 questions.");
    await ctx.db.patch(args.id, {
      title: text(args.title, 160, "Title"),
      intro: text(args.intro, 1200),
      fields: args.fields.map((f) => ({ ...f, label: text(f.label, 300, "Question") })),
      active: args.active,
    });
    await logActivity(ctx, viewer, "worksheet.updated", `Updated the "${args.title}" master worksheet`);
  },
});

export const templates = query({
  args: {},
  handler: async (ctx) => {
    await requireTeam(ctx);
    const rows = await ctx.db.query("messageTemplates").collect();
    return rows.sort((a, b) => a.sort - b.sort);
  },
});

export const saveTemplate = mutation({
  args: { id: v.id("messageTemplates"), name: v.string(), subject: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "settings");
    const row = await ctx.db.get(args.id);
    if (!row) notFound("Template");
    await ctx.db.patch(args.id, {
      name: text(args.name, 120, "Name"),
      subject: text(args.subject, 200, "Subject"),
      body: text(args.body, 4000, "Message"),
    });
    await logActivity(ctx, viewer, "template.updated", `Updated the ${args.name} message template`);
  },
});

export const guides = query({
  args: {},
  handler: async (ctx) => {
    await requireTeam(ctx);
    return {
      discovery: DISCOVERY_GUIDE,
      assessmentKinds: Object.entries(ASSESSMENT_KINDS).map(([kind, def]) => ({
        kind,
        title: def.title,
        questionCount: def.questions.length,
      })),
    };
  },
});
