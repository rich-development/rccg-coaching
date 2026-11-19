import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { paymentStatus, permission } from "./schema";
import {
  bad,
  isoDate,
  link,
  logActivity,
  notFound,
  optText,
  requireCoach,
  requireTeam,
  text,
  today,
} from "./lib/auth";
import { checklistFor } from "./lib/defaults";
import { readSettings } from "./settings";

function addDays(date: string, days: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Starts an engagement from a service. The agreed terms are copied in, so
 * later edits to the service never change this client's agreement.
 */
export const create = mutation({
  args: {
    clientId: v.id("clients"),
    serviceKey: v.string(),
    startDate: v.string(),
    priceCents: v.optional(v.number()),
    paymentArrangement: v.optional(v.string()),
    scopeNote: v.optional(v.string()),
    goal: v.optional(v.string()),
    previousEngagementId: v.optional(v.id("engagements")),
  },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const client = await ctx.db.get(args.clientId);
    if (!client) notFound("Client");
    const service = await ctx.db
      .query("services")
      .withIndex("by_key", (q) => q.eq("key", args.serviceKey))
      .unique();
    if (!service) notFound("Service");
    if (service.kind === "coworking" || service.kind === "discovery") {
      bad("Private coaching engagements use a coaching package.");
    }
    const startDate = isoDate(args.startDate, "Start date");
    if (!startDate) bad("Choose a start date.");
    const price = args.priceCents ?? service.priceCents;
    if (price < 0 || price > 10_000_00) bad("Check the price.");
    const settings = await readSettings(ctx);
    const prior = await ctx.db
      .query("engagements")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    const cycle = prior.filter((e) => e.serviceKey === args.serviceKey).length + 1;
    let previous = null;
    if (args.previousEngagementId) {
      previous = await ctx.db.get(args.previousEngagementId);
      if (!previous || previous.clientId !== args.clientId) bad("That earlier engagement belongs to someone else.");
    }
    const id = await ctx.db.insert("engagements", {
      clientId: args.clientId,
      serviceKey: service.key,
      serviceName: service.name,
      priceCents: Math.round(price),
      sessionsIncluded: service.sessionsIncluded,
      sessionMinutes: service.sessionMinutes,
      supportTerms: service.supportTerms,
      supportChannel: settings.supportChannel,
      responseWindow: settings.responseWindow,
      scopeNote: optText(args.scopeNote, 2000),
      startDate: startDate!,
      endDate: service.durationWeeks ? addDays(startDate!, service.durationWeeks * 7) : undefined,
      status: "onboarding",
      cycle,
      previousEngagementId: args.previousEngagementId,
      paymentArrangement: optText(args.paymentArrangement, 400) ?? "Paid in full before the first session",
      paymentStatus: "unpaid",
      amountPaidCents: 0,
      agreementStatus: "not_sent",
      // Permissions carry forward for a returning client, and can be changed any time.
      recordingPermission: previous?.recordingPermission ?? "not_asked",
      transcriptionPermission: previous?.transcriptionPermission ?? "not_asked",
      aiPermission: previous?.aiPermission ?? "not_asked",
      goal: optText(args.goal, 2000) ?? previous?.next30Plan,
      checklist: checklistFor(service.kind),
      createdAt: Date.now(),
    });
    const now = Date.now();
    await ctx.db.patch(args.clientId, {
      pipelineStage: "enrolled",
      pipelineChangedAt: now,
      ...(client.enrolledAt ? {} : { enrolledAt: now }),
    });
    await logActivity(
      ctx,
      viewer,
      "engagement.started",
      `Started ${service.name} for ${client.preferredName}`,
      args.clientId,
      id,
    );
    return id;
  },
});

export const updateTerms = mutation({
  args: {
    id: v.id("engagements"),
    priceCents: v.number(),
    sessionsIncluded: v.number(),
    sessionMinutes: v.number(),
    supportTerms: v.string(),
    supportChannel: v.string(),
    responseWindow: v.string(),
    scopeNote: v.optional(v.string()),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    paymentArrangement: v.string(),
    paymentLink: v.optional(v.string()),
    agreementStatus: v.union(v.literal("not_sent"), v.literal("sent"), v.literal("signed")),
    agreementUrl: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...args }) => {
    const viewer = await requireCoach(ctx);
    const e = await ctx.db.get(id);
    if (!e) notFound("Engagement");
    if (args.sessionsIncluded < 1 || args.sessionsIncluded > 60) bad("Check the session count.");
    if (args.priceCents < 0 || args.priceCents > 10_000_00) bad("Check the price.");
    await ctx.db.patch(id, {
      priceCents: Math.round(args.priceCents),
      sessionsIncluded: Math.round(args.sessionsIncluded),
      sessionMinutes: Math.round(args.sessionMinutes),
      supportTerms: text(args.supportTerms, 600),
      supportChannel: text(args.supportChannel, 120),
      responseWindow: text(args.responseWindow, 200),
      scopeNote: optText(args.scopeNote, 2000),
      startDate: isoDate(args.startDate, "Start date") ?? e.startDate,
      endDate: isoDate(args.endDate, "End date"),
      paymentArrangement: text(args.paymentArrangement, 400),
      paymentLink: link(args.paymentLink, "Payment link"),
      agreementStatus: args.agreementStatus,
      agreementUrl: link(args.agreementUrl, "Agreement link"),
    });
    await logActivity(ctx, viewer, "engagement.terms", `Updated agreed terms for ${e.serviceName}`, e.clientId, id);
  },
});

export const toggleChecklist = mutation({
  args: { id: v.id("engagements"), key: v.string(), done: v.boolean() },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const e = await ctx.db.get(args.id);
    if (!e) notFound("Engagement");
    const item = e.checklist.find((c) => c.key === args.key);
    if (!item) notFound("Checklist step");
    if (args.key === "payment" && args.done && e.paymentStatus !== "paid" && e.paymentStatus !== "waived") {
      bad("Record the confirmed payment first. This step checks itself off when payment is confirmed.");
    }
    const checklist = e.checklist.map((c) =>
      c.key === args.key ? { ...c, done: args.done, doneAt: args.done ? Date.now() : undefined } : c,
    );
    const allDone = checklist.every((c) => c.done);
    await ctx.db.patch(args.id, {
      checklist,
      ...(allDone && e.status === "onboarding" ? { status: "active" as const } : {}),
    });
    await logActivity(
      ctx,
      viewer,
      "onboarding.step",
      `${args.done ? "Completed" : "Reopened"} onboarding step: ${item.label}`,
      e.clientId,
      args.id,
    );
  },
});

/** Payment is confirmed directly by a person. Nothing here charges a card. */
export const recordPayment = mutation({
  args: {
    id: v.id("engagements"),
    status: paymentStatus,
    amountPaidCents: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const e = await ctx.db.get(args.id);
    if (!e) notFound("Engagement");
    if (args.amountPaidCents < 0 || args.amountPaidCents > 10_000_00) bad("Check the amount.");
    const confirmed = args.status === "paid" || args.status === "waived";
    await ctx.db.patch(args.id, {
      paymentStatus: args.status,
      amountPaidCents: Math.round(args.amountPaidCents),
      paymentNote: optText(args.note, 600),
      paymentVerifiedAt: args.status === "unpaid" ? undefined : Date.now(),
      checklist: e.checklist.map((c) =>
        c.key === "payment" ? { ...c, done: confirmed, doneAt: confirmed ? Date.now() : undefined } : c,
      ),
    });
    await logActivity(
      ctx,
      viewer,
      "payment.recorded",
      `Recorded payment status "${args.status}" for ${e.serviceName}`,
      e.clientId,
      args.id,
    );
  },
});

/** Recording, transcription, and AI use are three separate permissions. */
export const setPermissions = mutation({
  args: {
    id: v.id("engagements"),
    recordingPermission: permission,
    transcriptionPermission: permission,
    aiPermission: permission,
  },
  handler: async (ctx, { id, ...args }) => {
    const viewer = await requireCoach(ctx);
    const e = await ctx.db.get(id);
    if (!e) notFound("Engagement");
    await ctx.db.patch(id, { ...args, permissionsUpdatedAt: Date.now() });
    await logActivity(
      ctx,
      viewer,
      "permissions.set",
      `Permissions set. Recording: ${args.recordingPermission}. Transcript: ${args.transcriptionPermission}. AI: ${args.aiPermission}.`,
      e.clientId,
      id,
    );
  },
});

export const setGoal = mutation({
  args: {
    id: v.id("engagements"),
    goal: v.optional(v.string()),
    measureName: v.optional(v.string()),
    measureStart: v.optional(v.string()),
    measureTarget: v.optional(v.string()),
    measureActual: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...args }) => {
    const viewer = await requireTeam(ctx);
    const e = await ctx.db.get(id);
    if (!e) notFound("Engagement");
    await ctx.db.patch(id, {
      goal: optText(args.goal, 2000),
      measureName: optText(args.measureName, 300),
      measureStart: optText(args.measureStart, 300),
      measureTarget: optText(args.measureTarget, 300),
      measureActual: optText(args.measureActual, 300),
    });
    await logActivity(ctx, viewer, "goal.updated", "Updated the coaching goal and progress measure", e.clientId, id);
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("engagements"),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("cancelled")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireCoach(ctx);
    const e = await ctx.db.get(args.id);
    if (!e) notFound("Engagement");
    await ctx.db.patch(args.id, {
      status: args.status,
      pausedOn: args.status === "paused" ? today() : undefined,
      pauseReason: args.status === "paused" ? optText(args.reason, 600) : undefined,
    });
    await logActivity(ctx, viewer, "engagement.status", `Marked ${e.serviceName} as ${args.status}`, e.clientId, args.id);
  },
});

/** Completion review: compare the start with the result and agree on the next 30 days. */
export const complete = mutation({
  args: {
    id: v.id("engagements"),
    startingPoint: v.optional(v.string()),
    currentResult: v.optional(v.string()),
    nowIndependent: v.optional(v.string()),
    next30Plan: v.optional(v.string()),
    supportChoice: v.optional(v.string()),
    measureActual: v.optional(v.string()),
    renewalDecision: v.union(v.literal("undecided"), v.literal("renewing"), v.literal("not_renewing")),
    markComplete: v.boolean(),
  },
  handler: async (ctx, { id, markComplete, ...args }) => {
    const viewer = await requireCoach(ctx);
    const e = await ctx.db.get(id);
    if (!e) notFound("Engagement");
    await ctx.db.patch(id, {
      startingPoint: optText(args.startingPoint, 3000),
      currentResult: optText(args.currentResult, 3000),
      nowIndependent: optText(args.nowIndependent, 3000),
      next30Plan: optText(args.next30Plan, 3000),
      supportChoice: optText(args.supportChoice, 1000),
      measureActual: optText(args.measureActual, 300) ?? e.measureActual,
      renewalDecision: args.renewalDecision,
      ...(markComplete ? { status: "completed" as const, completedOn: today() } : {}),
    });
    if (markComplete) {
      const others = await ctx.db
        .query("engagements")
        .withIndex("by_client", (q) => q.eq("clientId", e.clientId))
        .collect();
      const stillOpen = others.some(
        (o) => o._id !== id && (o.status === "active" || o.status === "onboarding" || o.status === "paused"),
      );
      if (!stillOpen && args.renewalDecision !== "renewing") {
        await ctx.db.patch(e.clientId, { pipelineStage: "alumni", pipelineChangedAt: Date.now() });
      }
    }
    await logActivity(
      ctx,
      viewer,
      markComplete ? "engagement.completed" : "engagement.review",
      markComplete ? `Completed ${e.serviceName}` : `Saved the completion review for ${e.serviceName}`,
      e.clientId,
      id,
    );
  },
});
