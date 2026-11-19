import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { paymentStatus } from "./schema";
import { bad, link, logActivity, normalizeEmail, notFound, optText, requireTeam, text } from "./lib/auth";
import { COWORKING_INSTRUCTIONS } from "./lib/defaults";
import { readSettings } from "./settings";

/**
 * Co-working has NO transcripts, virtual or in person. Nothing in this file
 * reads or writes the transcripts, sessionNotes, or aiBriefs tables, and the
 * AI features never read co-working data. Only attendance, each person's
 * chosen task, and progress she expressly reports are kept.
 */

const WAITLIST_LIMIT = 25;

function slugify(title: string, startsAt: number): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "co-working"}-${new Date(startsAt).toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`;
}

function counts(regs: Doc<"coworkingRegistrations">[]) {
  return {
    registered: regs.filter((r) => r.status === "registered").length,
    waitlist: regs.filter((r) => r.status === "waitlist").length,
    attended: regs.filter((r) => r.attended === true).length,
    paid: regs.filter((r) => r.status === "registered" && (r.paymentStatus === "paid" || r.paymentStatus === "waived")).length,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireTeam(ctx);
    const sessions = await ctx.db.query("coworkingSessions").withIndex("by_time").order("desc").collect();
    const out = [];
    for (const s of sessions) {
      const regs = await ctx.db
        .query("coworkingRegistrations")
        .withIndex("by_session", (q) => q.eq("sessionId", s._id))
        .collect();
      out.push({ ...s, ...counts(regs) });
    }
    return out;
  },
});

export const get = query({
  args: { id: v.id("coworkingSessions") },
  handler: async (ctx, args) => {
    await requireTeam(ctx);
    const session = await ctx.db.get(args.id);
    if (!session) return null;
    const regs = await ctx.db
      .query("coworkingRegistrations")
      .withIndex("by_session", (q) => q.eq("sessionId", args.id))
      .collect();
    const roster = [];
    for (const r of regs) {
      const history = await ctx.db
        .query("coworkingRegistrations")
        .withIndex("by_email", (q) => q.eq("email", r.email))
        .collect();
      const client = await ctx.db
        .query("clients")
        .withIndex("by_email", (q) => q.eq("email", r.email))
        .first();
      roster.push({
        ...r,
        timesAttended: history.filter((h) => h.attended === true).length,
        clientId: client?._id,
        isCoachingClient: !!client && client.pipelineStage === "enrolled",
      });
    }
    return {
      session,
      roster: roster.sort((a, b) => a.registeredAt - b.registeredAt),
      ...counts(regs),
    };
  },
});

const sessionArgs = {
  title: v.string(),
  startsAt: v.number(),
  timeZone: v.string(),
  durationMinutes: v.number(),
  format: v.union(v.literal("virtual"), v.literal("in_person")),
  location: v.optional(v.string()),
  meetLink: v.optional(v.string()),
  capacity: v.number(),
  priceCents: v.number(),
  paymentLink: v.optional(v.string()),
  instructions: v.optional(v.string()),
  cancellationTerms: v.optional(v.string()),
};

export const create = mutation({
  args: sessionArgs,
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    if (args.capacity < 1 || args.capacity > 100) bad("Capacity must be between 1 and 100.");
    if (args.priceCents < 0 || args.priceCents > 1_000_00) bad("Check the price.");
    const settings = await readSettings(ctx);
    const title = text(args.title, 160, "Title") || "Co-working session";
    const id = await ctx.db.insert("coworkingSessions", {
      slug: slugify(title, args.startsAt),
      title,
      startsAt: args.startsAt,
      timeZone: text(args.timeZone, 80),
      durationMinutes: Math.round(args.durationMinutes),
      format: args.format,
      location: args.format === "in_person" ? (optText(args.location, 300) ?? settings.officeAddress) : undefined,
      meetLink: args.format === "virtual" ? link(args.meetLink, "Meeting link") : undefined,
      capacity: Math.round(args.capacity),
      priceCents: Math.round(args.priceCents),
      paymentLink: link(args.paymentLink, "Payment link"),
      instructions: optText(args.instructions, 3000) ?? COWORKING_INSTRUCTIONS,
      cancellationTerms: optText(args.cancellationTerms, 1000),
      status: "draft",
      createdAt: Date.now(),
    });
    await logActivity(ctx, viewer, "coworking.created", `Created co-working session "${title}"`, undefined, id);
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("coworkingSessions"),
    ...sessionArgs,
    status: v.union(v.literal("draft"), v.literal("open"), v.literal("closed"), v.literal("completed"), v.literal("cancelled")),
  },
  handler: async (ctx, { id, ...args }) => {
    const viewer = await requireTeam(ctx);
    const s = await ctx.db.get(id);
    if (!s) notFound("Co-working session");
    if (args.capacity < 1 || args.capacity > 100) bad("Capacity must be between 1 and 100.");
    await ctx.db.patch(id, {
      title: text(args.title, 160, "Title"),
      startsAt: args.startsAt,
      timeZone: text(args.timeZone, 80),
      durationMinutes: Math.round(args.durationMinutes),
      format: args.format,
      location: args.format === "in_person" ? optText(args.location, 300) : undefined,
      meetLink: args.format === "virtual" ? link(args.meetLink, "Meeting link") : undefined,
      capacity: Math.round(args.capacity),
      priceCents: Math.round(args.priceCents),
      paymentLink: link(args.paymentLink, "Payment link"),
      instructions: optText(args.instructions, 3000) ?? s.instructions,
      cancellationTerms: optText(args.cancellationTerms, 1000),
      status: args.status,
    });
    await logActivity(ctx, viewer, "coworking.updated", `Updated co-working session "${args.title}" (${args.status})`, undefined, id);
  },
});

/** Public page data. Never includes the meeting link or anyone's name. */
export const publicInfo = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const s = await ctx.db
      .query("coworkingSessions")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug.slice(0, 120)))
      .unique();
    if (!s || s.status === "draft") return null;
    const regs = await ctx.db
      .query("coworkingRegistrations")
      .withIndex("by_session", (q) => q.eq("sessionId", s._id))
      .collect();
    const c = counts(regs);
    return {
      title: s.title,
      startsAt: s.startsAt,
      timeZone: s.timeZone,
      durationMinutes: s.durationMinutes,
      format: s.format,
      location: s.format === "in_person" ? s.location : undefined,
      priceCents: s.priceCents,
      instructions: s.instructions,
      cancellationTerms: s.cancellationTerms,
      status: s.status,
      spotsLeft: Math.max(0, s.capacity - c.registered),
      waitlistOpen: c.waitlist < WAITLIST_LIMIT,
    };
  },
});

/**
 * Public registration. No sign-in. Registering does not enroll anyone in
 * private coaching and never reveals the private meeting link.
 */
export const publicRegister = mutation({
  args: { slug: v.string(), name: v.string(), email: v.string(), website: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // "website" is a hidden field real people never fill in.
    if (args.website) return { status: "registered" as const, paymentLink: null };
    const s = await ctx.db
      .query("coworkingSessions")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug.slice(0, 120)))
      .unique();
    if (!s || s.status !== "open") bad("Registration is not open for this session.");
    if (s.startsAt < Date.now()) bad("This session has already started.");
    const name = text(args.name, 120, "Name");
    const email = normalizeEmail(text(args.email, 200, "Email"));
    if (name.length < 2) bad("Enter your name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad("Enter a valid email.");
    const regs = await ctx.db
      .query("coworkingRegistrations")
      .withIndex("by_session", (q) => q.eq("sessionId", s._id))
      .collect();
    const mine = regs.find((r) => r.email === email && r.status !== "cancelled");
    if (mine) return { status: mine.status as "registered" | "waitlist", paymentLink: mine.status === "registered" ? (s.paymentLink ?? null) : null };
    const c = counts(regs);
    const hasSpot = c.registered < s.capacity;
    if (!hasSpot && c.waitlist >= WAITLIST_LIMIT) bad("This session and its waitlist are full.");
    await ctx.db.insert("coworkingRegistrations", {
      sessionId: s._id,
      name,
      email,
      status: hasSpot ? "registered" : "waitlist",
      paymentStatus: s.priceCents === 0 ? "waived" : "unpaid",
      registeredAt: Date.now(),
    });
    await ctx.db.insert("activity", {
      at: Date.now(),
      actor: name,
      actorRole: "public",
      action: "coworking.registered",
      summary: `${name} ${hasSpot ? "registered for" : "joined the waitlist for"} "${s.title}"`,
      entity: s._id,
    });
    return { status: hasSpot ? ("registered" as const) : ("waitlist" as const), paymentLink: hasSpot ? (s.paymentLink ?? null) : null };
  },
});

export const addRegistration = mutation({
  args: { sessionId: v.id("coworkingSessions"), name: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const s = await ctx.db.get(args.sessionId);
    if (!s) notFound("Co-working session");
    const email = normalizeEmail(text(args.email, 200, "Email"));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad("Enter a valid email.");
    const regs = await ctx.db
      .query("coworkingRegistrations")
      .withIndex("by_session", (q) => q.eq("sessionId", s._id))
      .collect();
    if (regs.some((r) => r.email === email && r.status !== "cancelled")) bad("She is already on the roster.");
    const hasSpot = counts(regs).registered < s.capacity;
    await ctx.db.insert("coworkingRegistrations", {
      sessionId: s._id,
      name: text(args.name, 120, "Name"),
      email,
      status: hasSpot ? "registered" : "waitlist",
      paymentStatus: "unpaid",
      registeredAt: Date.now(),
    });
    await logActivity(ctx, viewer, "coworking.added", `Added ${args.name} to "${s.title}"`, undefined, s._id);
  },
});

export const updateRegistration = mutation({
  args: {
    id: v.id("coworkingRegistrations"),
    status: v.optional(v.union(v.literal("registered"), v.literal("waitlist"), v.literal("cancelled"))),
    paymentStatus: v.optional(paymentStatus),
    attended: v.optional(v.boolean()),
    chosenTask: v.optional(v.string()),
    reportedProgress: v.optional(v.string()),
    interestedInCoaching: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...args }) => {
    const viewer = await requireTeam(ctx);
    const r = await ctx.db.get(id);
    if (!r) notFound("Registration");
    const s = await ctx.db.get(r.sessionId);
    if (args.status === "registered" && r.status !== "registered" && s) {
      const regs = await ctx.db
        .query("coworkingRegistrations")
        .withIndex("by_session", (q) => q.eq("sessionId", s._id))
        .collect();
      if (counts(regs).registered >= s.capacity) bad("The session is full. Raise the capacity or free a spot first.");
    }
    const patch: Partial<Doc<"coworkingRegistrations">> = {};
    if (args.status !== undefined) patch.status = args.status;
    if (args.paymentStatus !== undefined) patch.paymentStatus = args.paymentStatus;
    if (args.attended !== undefined) patch.attended = args.attended;
    if (args.chosenTask !== undefined) patch.chosenTask = optText(args.chosenTask, 600);
    if (args.reportedProgress !== undefined) patch.reportedProgress = optText(args.reportedProgress, 1000);
    if (args.interestedInCoaching !== undefined) patch.interestedInCoaching = args.interestedInCoaching;
    await ctx.db.patch(id, patch);
    if (args.attended !== undefined || args.status !== undefined || args.paymentStatus !== undefined) {
      await logActivity(ctx, viewer, "coworking.roster", `Updated ${r.name} on the roster for "${s?.title ?? "co-working"}"`, undefined, r.sessionId);
    }
  },
});
