import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fieldDef } from "./schema";
import { bad, logActivity, notFound, requirePermission, requireTeam, text } from "./lib/auth";
import { ASSESSMENT_KINDS, DEFAULT_GUIDES, DISCOVERY_GUIDE } from "./lib/defaults";

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

/* ---------- Adding new masters ---------- */

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40) || "item"
  );
}

export const addService = mutation({
  args: {
    name: v.string(),
    kind: v.union(v.literal("single"), v.literal("package"), v.literal("monthly")),
    priceCents: v.number(),
    priceNote: v.string(),
    sessionsIncluded: v.number(),
    sessionMinutes: v.number(),
    durationWeeks: v.optional(v.number()),
    supportTerms: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "settings");
    const name = text(args.name, 120, "Name");
    if (!name) bad("Name the service.");
    if (args.priceCents < 0 || args.priceCents > 10_000_00) bad("Check the price.");
    if (args.sessionsIncluded < 1 || args.sessionsIncluded > 60) bad("Check the session count.");
    if (args.sessionMinutes < 5 || args.sessionMinutes > 480) bad("Check the session length.");
    const all = await ctx.db.query("services").collect();
    let key = slug(name);
    while (all.some((s) => s.key === key)) key = `${key}_${Math.random().toString(36).slice(2, 5)}`;
    await ctx.db.insert("services", {
      key,
      name,
      kind: args.kind,
      priceCents: Math.round(args.priceCents),
      priceNote: text(args.priceNote, 120) || `$${(args.priceCents / 100).toFixed(0)}`,
      sessionsIncluded: Math.round(args.sessionsIncluded),
      sessionMinutes: Math.round(args.sessionMinutes),
      durationWeeks: args.durationWeeks,
      supportTerms: text(args.supportTerms, 600),
      description: text(args.description, 800),
      trackNote: "Goal, sessions remaining, and progress",
      active: true,
      sort: Math.max(0, ...all.map((s) => s.sort)) + 1,
    });
    await logActivity(ctx, viewer, "service.added", `Added the ${name} service`);
  },
});

/** Workbook page order and check-in rhythm for a service. */
export const saveServiceAutomation = mutation({
  args: { id: v.id("services"), worksheetOrder: v.array(v.string()), checkinEveryDays: v.number() },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "settings");
    const row = await ctx.db.get(args.id);
    if (!row) notFound("Service");
    if (args.checkinEveryDays < 0 || args.checkinEveryDays > 90) bad("Check-ins can be 0 to 90 days apart.");
    const known = new Set((await ctx.db.query("worksheetTemplates").collect()).map((w) => w.key));
    const order = [...new Set(args.worksheetOrder)].filter((k) => known.has(k)).slice(0, 20);
    await ctx.db.patch(args.id, { worksheetOrder: order, checkinEveryDays: Math.round(args.checkinEveryDays) });
    await logActivity(ctx, viewer, "service.automation", `Updated the automatic pages and check-ins for ${row.name}`);
  },
});

export const addWorksheet = mutation({
  args: { title: v.string(), intro: v.string(), fields: v.array(fieldDef) },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "settings");
    const title = text(args.title, 160, "Title");
    if (!title) bad("Give the page a title.");
    if (args.fields.length === 0 || args.fields.length > 30) bad("A page needs 1 to 30 questions.");
    const all = await ctx.db.query("worksheetTemplates").collect();
    let key = slug(title);
    while (all.some((w) => w.key === key)) key = `${key}_${Math.random().toString(36).slice(2, 5)}`;
    const used = new Set<string>();
    const fields = args.fields.map((f, i) => {
      let k = slug(f.label) || `q${i + 1}`;
      while (used.has(k)) k = `${k}_${i + 1}`;
      used.add(k);
      return { ...f, key: k, label: text(f.label, 300, "Question") };
    });
    if (fields.some((f) => !f.label)) bad("Every question needs wording.");
    await ctx.db.insert("worksheetTemplates", {
      key,
      title,
      page: "Added",
      intro: text(args.intro, 1200),
      fields,
      active: true,
      sort: Math.max(0, ...all.map((w) => w.sort)) + 1,
    });
    await logActivity(ctx, viewer, "worksheet.added", `Added the workbook page "${title}"`);
  },
});

export const addTemplate = mutation({
  args: { name: v.string(), subject: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "settings");
    const name = text(args.name, 120, "Name");
    const body = text(args.body, 4000, "Message");
    if (!name || !body) bad("A template needs a name and a message.");
    const all = await ctx.db.query("messageTemplates").collect();
    let key = slug(name);
    while (all.some((t) => t.key === key)) key = `${key}_${Math.random().toString(36).slice(2, 5)}`;
    await ctx.db.insert("messageTemplates", { key, name, subject: text(args.subject, 200, "Subject"), body, sort: Math.max(0, ...all.map((t) => t.sort)) + 1 });
    await logActivity(ctx, viewer, "template.added", `Added the ${name} message template`);
  },
});

export const removeTemplate = mutation({
  args: { id: v.id("messageTemplates") },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "settings");
    const row = await ctx.db.get(args.id);
    if (!row) return;
    await ctx.db.delete(args.id);
    await logActivity(ctx, viewer, "template.removed", `Removed the ${row.name} message template`);
  },
});

/** Coaching guides. Starts from the Starter Kit and is Tamika's to rewrite. */
export const guideList = query({
  args: {},
  handler: async (ctx) => {
    await requireTeam(ctx);
    const rows = await ctx.db.query("guides").collect();
    if (rows.length === 0) {
      return DEFAULT_GUIDES.map((g) => ({ ...g, _id: null as string | null }));
    }
    return rows.sort((a, b) => a.sort - b.sort).map((g) => ({ key: g.key, title: g.title, body: g.body, sort: g.sort, _id: g._id as string | null }));
  },
});

export const saveGuide = mutation({
  args: { key: v.optional(v.string()), title: v.string(), body: v.string(), remove: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "settings");
    // The first edit copies the starter guides into the database.
    let rows = await ctx.db.query("guides").collect();
    if (rows.length === 0) {
      for (const g of DEFAULT_GUIDES) await ctx.db.insert("guides", g);
      rows = await ctx.db.query("guides").collect();
    }
    const title = text(args.title, 160, "Title");
    const body = text(args.body, 12000, "Guide");
    const existing = args.key ? rows.find((g) => g.key === args.key) : undefined;
    if (args.remove) {
      if (existing) await ctx.db.delete(existing._id);
      await logActivity(ctx, viewer, "guide.removed", `Removed the guide "${existing?.title ?? args.key}"`);
      return;
    }
    if (!title || !body) bad("A guide needs a title and some text.");
    if (existing) {
      await ctx.db.patch(existing._id, { title, body });
    } else {
      let key = slug(title);
      while (rows.some((g) => g.key === key)) key = `${key}_${Math.random().toString(36).slice(2, 5)}`;
      await ctx.db.insert("guides", { key, title, body, sort: Math.max(0, ...rows.map((g) => g.sort)) + 1 });
    }
    await logActivity(ctx, viewer, "guide.saved", `Saved the guide "${title}"`);
  },
});
