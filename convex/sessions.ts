import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { transcriptStatus } from "./schema";
import {
  bad,
  link,
  logActivity,
  notFound,
  optText,
  can,
  requirePermission,
  requireTeam,
  text,
} from "./lib/auth";
import { computeBalance } from "./lib/balance";

export const schedule = mutation({
  args: {
    engagementId: v.id("engagements"),
    scheduledAt: v.number(),
    durationMinutes: v.optional(v.number()),
    format: v.union(v.literal("virtual"), v.literal("in_person")),
    meetLink: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const e = await ctx.db.get(args.engagementId);
    if (!e) notFound("Engagement");
    if (e.status === "completed" || e.status === "cancelled") {
      bad("This engagement is closed. Start a new one to book more sessions.");
    }
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_engagement", (q) => q.eq("engagementId", args.engagementId))
      .collect();
    const balance = computeBalance(e, existing);
    if (balance.unscheduled <= 0) {
      bad("All included sessions are already used or booked.");
    }
    const live = existing.filter((s) => s.status !== "rescheduled" && s.status !== "cancelled");
    const id = await ctx.db.insert("sessions", {
      clientId: e.clientId,
      engagementId: args.engagementId,
      number: live.length + 1,
      scheduledAt: args.scheduledAt,
      durationMinutes: args.durationMinutes ?? e.sessionMinutes,
      format: args.format,
      meetLink: link(args.meetLink, "Meet link"),
      location: optText(args.location, 300),
      status: "scheduled",
      countsAgainstBalance: true,
      transcriptStatus: e.transcriptionPermission === "granted" ? "pending" : "not_permitted",
    });
    await logActivity(ctx, viewer, "session.scheduled", `Booked session ${live.length + 1} of ${e.serviceName}`, e.clientId, id);
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("sessions"),
    scheduledAt: v.number(),
    durationMinutes: v.number(),
    format: v.union(v.literal("virtual"), v.literal("in_person")),
    meetLink: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...args }) => {
    const viewer = await requireTeam(ctx);
    const s = await ctx.db.get(id);
    if (!s) notFound("Session");
    if (args.durationMinutes < 5 || args.durationMinutes > 480) bad("Check the session length.");
    await ctx.db.patch(id, {
      scheduledAt: args.scheduledAt,
      durationMinutes: Math.round(args.durationMinutes),
      format: args.format,
      meetLink: link(args.meetLink, "Meet link"),
      location: optText(args.location, 300),
    });
    await logActivity(ctx, viewer, "session.updated", `Updated session ${s.number} details`, s.clientId, id);
  },
});

/**
 * Rescheduled, missed, and completed are different things:
 * - completed uses a session from the balance
 * - missed uses one only if "counts" is on (follow the client's agreement)
 * - rescheduled never uses one; book the new time as a new session
 */
export const setStatus = mutation({
  args: {
    id: v.id("sessions"),
    status: v.union(
      v.literal("scheduled"),
      v.literal("completed"),
      v.literal("rescheduled"),
      v.literal("missed"),
      v.literal("cancelled"),
    ),
    countsAgainstBalance: v.optional(v.boolean()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const s = await ctx.db.get(args.id);
    if (!s) notFound("Session");
    await ctx.db.patch(args.id, {
      status: args.status,
      countsAgainstBalance:
        args.status === "missed" ? (args.countsAgainstBalance ?? false) : true,
      statusNote: optText(args.note, 600),
      completedAt: args.status === "completed" ? (s.completedAt ?? Date.now()) : undefined,
    });
    await logActivity(ctx, viewer, "session.status", `Marked session ${s.number} as ${args.status}`, s.clientId, args.id);
  },
});

/** Everything Today's Coaching needs on one screen. */
export const workspace = query({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const session = await ctx.db.get(args.id);
    if (!session) return null;
    const isCoach = can(viewer, "coaching");
    const client = await ctx.db.get(session.clientId);
    const engagement = await ctx.db.get(session.engagementId);
    if (!client || !engagement) return null;
    const all = await ctx.db
      .query("sessions")
      .withIndex("by_engagement", (q) => q.eq("engagementId", engagement._id))
      .collect();
    const actions = await ctx.db
      .query("actions")
      .withIndex("by_client", (q) => q.eq("clientId", client._id))
      .collect();
    const notes = isCoach
      ? await ctx.db
          .query("sessionNotes")
          .withIndex("by_session", (q) => q.eq("sessionId", args.id))
          .unique()
      : null;
    const transcript = isCoach
      ? await ctx.db
          .query("transcripts")
          .withIndex("by_session", (q) => q.eq("sessionId", args.id))
          .unique()
      : null;
    const previous = all
      .filter((s) => s.scheduledAt < session.scheduledAt && s.status === "completed")
      .sort((a, b) => b.scheduledAt - a.scheduledAt)[0];
    const next = all
      .filter((s) => s.scheduledAt > session.scheduledAt && s.status === "scheduled")
      .sort((a, b) => a.scheduledAt - b.scheduledAt)[0];
    const { privateFolderUrl, ...safeClient } = client;
    const { recapDraft, ...safeSession } = session;
    return {
      isCoach,
      session: isCoach ? session : safeSession,
      recapDraft: isCoach ? (recapDraft ?? null) : null,
      client: isCoach ? client : safeClient,
      privateFolderUrl: isCoach ? (privateFolderUrl ?? null) : null,
      engagement,
      balance: computeBalance(engagement, all),
      notes,
      transcript: transcript
        ? { _id: transcript._id, source: transcript.source, attachedAt: transcript.attachedAt, length: transcript.text.length, text: transcript.text }
        : null,
      sessionActions: actions.filter((a) => a.sessionId === args.id),
      openActions: actions.filter(
        (a) => a.sessionId !== args.id && (a.status === "open" || a.status === "in_progress"),
      ),
      previous: previous
        ? { _id: previous._id, number: previous.number, scheduledAt: previous.scheduledAt, priority: previous.priority, recapShared: previous.recapShared }
        : null,
      next: next ? { _id: next._id, scheduledAt: next.scheduledAt } : null,
    };
  },
});

export const savePriority = mutation({
  args: { id: v.id("sessions"), priority: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireTeam(ctx);
    const s = await ctx.db.get(args.id);
    if (!s) notFound("Session");
    await ctx.db.patch(args.id, { priority: optText(args.priority, 600, "Priority") });
  },
});

/** Private coach notes. Coach only, stored apart from anything shared. */
export const saveNotes = mutation({
  args: {
    id: v.id("sessions"),
    progressSince: v.optional(v.string()),
    outcomeAgreed: v.optional(v.string()),
    questionsAndDecisions: v.optional(v.string()),
    obstacle: v.optional(v.string()),
    coachFollowUp: v.optional(v.string()),
    interpretation: v.optional(v.string()),
    prepQuestions: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...args }) => {
    await requirePermission(ctx, "coaching");
    const s = await ctx.db.get(id);
    if (!s) notFound("Session");
    const fields = {
      progressSince: optText(args.progressSince, 6000),
      outcomeAgreed: optText(args.outcomeAgreed, 6000),
      questionsAndDecisions: optText(args.questionsAndDecisions, 12000),
      obstacle: optText(args.obstacle, 6000),
      coachFollowUp: optText(args.coachFollowUp, 3000),
      interpretation: optText(args.interpretation, 6000),
      prepQuestions: optText(args.prepQuestions, 3000),
      updatedAt: Date.now(),
    };
    const existing = await ctx.db
      .query("sessionNotes")
      .withIndex("by_session", (q) => q.eq("sessionId", id))
      .unique();
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("sessionNotes", { sessionId: id, clientId: s.clientId, ...fields });
  },
});

export const saveRecapDraft = mutation({
  args: { id: v.id("sessions"), draft: v.string() },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "coaching");
    const s = await ctx.db.get(args.id);
    if (!s) notFound("Session");
    await ctx.db.patch(args.id, { recapDraft: text(args.draft, 8000, "Recap") });
  },
});

/** Nothing reaches the client until Tamika approves it here. */
export const approveRecap = mutation({
  args: { id: v.id("sessions"), body: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "coaching");
    const s = await ctx.db.get(args.id);
    if (!s) notFound("Session");
    const body = text(args.body, 8000, "Recap");
    if (!body) bad("Write the recap before approving it.");
    if (/\[[^\]]{2,60}\]/.test(body)) {
      bad("The recap still has a [bracketed] placeholder. Fill it in or remove it before sharing.");
    }
    await ctx.db.patch(args.id, { recapDraft: body, recapShared: body, recapApprovedAt: Date.now() });
    await logActivity(ctx, viewer, "recap.approved", `Approved and shared the recap for session ${s.number}`, s.clientId, args.id);
  },
});

export const unshareRecap = mutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "coaching");
    const s = await ctx.db.get(args.id);
    if (!s) notFound("Session");
    await ctx.db.patch(args.id, { recapShared: undefined, recapApprovedAt: undefined });
    await logActivity(ctx, viewer, "recap.unshared", `Took back the shared recap for session ${s.number}`, s.clientId, args.id);
  },
});

/**
 * Attach a transcript by hand. Only for one-on-one coaching sessions, and only
 * when the client has agreed to transcription on this engagement.
 */
export const attachTranscript = mutation({
  args: { id: v.id("sessions"), text: v.string(), source: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "coaching");
    const s = await ctx.db.get(args.id);
    if (!s) notFound("Session");
    const e = await ctx.db.get(s.engagementId);
    if (!e || e.transcriptionPermission !== "granted") {
      bad("This client has not agreed to transcription. Record her permission on the engagement first.");
    }
    const body = text(args.text, 400_000, "Transcript");
    if (!body) bad("Paste the transcript text.");
    const existing = await ctx.db
      .query("transcripts")
      .withIndex("by_session", (q) => q.eq("sessionId", args.id))
      .unique();
    const doc = {
      sessionId: args.id,
      clientId: s.clientId,
      source: optText(args.source, 120) ?? "Google Meet",
      text: body,
      attachedAt: Date.now(),
    };
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("transcripts", doc);
    await ctx.db.patch(args.id, { transcriptStatus: "ready" });
    await logActivity(ctx, viewer, "transcript.attached", `Attached a transcript to session ${s.number}`, s.clientId, args.id);
  },
});

export const removeTranscript = mutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "coaching");
    const s = await ctx.db.get(args.id);
    if (!s) notFound("Session");
    const existing = await ctx.db
      .query("transcripts")
      .withIndex("by_session", (q) => q.eq("sessionId", args.id))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    await ctx.db.patch(args.id, { transcriptStatus: "unavailable" });
    await logActivity(ctx, viewer, "transcript.removed", `Deleted the transcript for session ${s.number}`, s.clientId, args.id);
  },
});

export const setTranscriptStatus = mutation({
  args: { id: v.id("sessions"), status: transcriptStatus },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "coaching");
    const s = await ctx.db.get(args.id);
    if (!s) notFound("Session");
    if (args.status === "ready") bad("Attach the transcript to mark it ready.");
    await ctx.db.patch(args.id, { transcriptStatus: args.status });
  },
});

export const upcoming = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, args) => {
    await requireTeam(ctx);
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_time", (q) => q.gte("scheduledAt", args.from).lte("scheduledAt", args.to))
      .collect();
    const out = [];
    for (const s of rows) {
      const client = await ctx.db.get(s.clientId);
      const e = await ctx.db.get(s.engagementId);
      out.push({
        _id: s._id,
        scheduledAt: s.scheduledAt,
        durationMinutes: s.durationMinutes,
        status: s.status,
        format: s.format,
        number: s.number,
        meetLink: s.meetLink,
        clientId: s.clientId,
        clientName: client?.preferredName ?? "Client",
        serviceName: e?.serviceName ?? "",
        sessionsIncluded: e?.sessionsIncluded ?? 0,
      });
    }
    return out;
  },
});
