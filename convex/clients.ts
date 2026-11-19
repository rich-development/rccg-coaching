import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { pipelineStage, stage } from "./schema";
import {
  bad,
  isoDate,
  link,
  logActivity,
  normalizeEmail,
  notFound,
  optText,
  requireCoach,
  requireTeam,
  text,
  type Viewer,
} from "./lib/auth";
import { computeBalance } from "./lib/balance";

/** Staff do not see the private folder link. */
function forViewer(client: Doc<"clients">, viewer: Viewer) {
  if (viewer.role === "coach") return client;
  const { privateFolderUrl: _hidden, ...rest } = client;
  void _hidden;
  return rest;
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireTeam(ctx);
    const clients = await ctx.db.query("clients").collect();
    const engagements = await ctx.db.query("engagements").collect();
    const sessions = await ctx.db.query("sessions").collect();
    const threads = await ctx.db.query("threads").collect();
    const now = Date.now();
    return clients
      .filter((c) => args.includeArchived || !c.archived)
      .map((c) => {
        const mine = engagements.filter((e) => e.clientId === c._id);
        const current =
          mine.find((e) => e.status === "active") ??
          mine.find((e) => e.status === "onboarding") ??
          mine.find((e) => e.status === "paused");
        const mySessions = sessions.filter((s) => s.clientId === c._id);
        const next = mySessions
          .filter((s) => s.status === "scheduled" && s.scheduledAt >= now - 3600_000)
          .sort((a, b) => a.scheduledAt - b.scheduledAt)[0];
        const balance = current
          ? computeBalance(current, mySessions.filter((s) => s.engagementId === current._id))
          : null;
        const thread = threads.find((t) => t.clientId === c._id);
        return {
          _id: c._id,
          fullName: c.fullName,
          preferredName: c.preferredName,
          email: c.email,
          businessName: c.businessName,
          stage: c.stage,
          pipelineStage: c.pipelineStage,
          archived: c.archived,
          followUpAction: c.followUpAction,
          followUpDate: c.followUpDate,
          portalEnabled: c.portalEnabled,
          portalLinked: c.userId !== undefined,
          engagementCount: mine.length,
          currentService: current?.serviceName,
          currentStatus: current?.status,
          balance,
          nextSessionAt: next?.scheduledAt,
          needsReply: thread?.status === "needs_reply",
        };
      })
      .sort((a, b) => a.preferredName.localeCompare(b.preferredName));
  },
});

export const get = query({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const client = await ctx.db.get(args.id);
    if (!client) return null;
    const engagements = await ctx.db
      .query("engagements")
      .withIndex("by_client", (q) => q.eq("clientId", args.id))
      .collect();
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_client", (q) => q.eq("clientId", args.id))
      .collect();
    const actions = await ctx.db
      .query("actions")
      .withIndex("by_client", (q) => q.eq("clientId", args.id))
      .collect();
    const worksheets = await ctx.db
      .query("worksheetAssignments")
      .withIndex("by_client", (q) => q.eq("clientId", args.id))
      .collect();
    const assessments = await ctx.db
      .query("assessments")
      .withIndex("by_client", (q) => q.eq("clientId", args.id))
      .collect();
    const registrations = await ctx.db
      .query("coworkingRegistrations")
      .withIndex("by_email", (q) => q.eq("email", client.email))
      .collect();
    const coworking = [];
    for (const r of registrations) {
      const s = await ctx.db.get(r.sessionId);
      if (s) {
        coworking.push({
          _id: r._id,
          sessionId: s._id,
          title: s.title,
          startsAt: s.startsAt,
          status: r.status,
          attended: r.attended,
          chosenTask: r.chosenTask,
          reportedProgress: r.reportedProgress,
        });
      }
    }
    const thread = await ctx.db
      .query("threads")
      .withIndex("by_client", (q) => q.eq("clientId", args.id))
      .first();
    const feedback = await ctx.db
      .query("feedback")
      .withIndex("by_client", (q) => q.eq("clientId", args.id))
      .collect();
    const testimonials = await ctx.db
      .query("testimonials")
      .withIndex("by_client", (q) => q.eq("clientId", args.id))
      .collect();
    return {
      client: forViewer(client, viewer),
      portalLinked: client.userId !== undefined,
      engagements: engagements
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((e) => ({
          ...e,
          balance: computeBalance(e, sessions.filter((s) => s.engagementId === e._id)),
        })),
      sessions: sessions
        .sort((a, b) => b.scheduledAt - a.scheduledAt)
        .map((s) => {
          // The recap draft is the coach's working copy.
          if (viewer.role === "coach") return s;
          const { recapDraft: _d, ...rest } = s;
          void _d;
          return rest;
        }),
      actions: actions.sort((a, b) => b.createdAt - a.createdAt),
      worksheets: worksheets.sort((a, b) => b.assignedAt - a.assignedAt),
      assessments: assessments.sort((a, b) => b.assignedAt - a.assignedAt),
      coworking: coworking.sort((a, b) => b.startsAt - a.startsAt),
      thread,
      feedback: viewer.role === "coach" ? feedback : [],
      testimonials: viewer.role === "coach" ? testimonials : [],
    };
  },
});

const profileArgs = {
  fullName: v.string(),
  preferredName: v.string(),
  email: v.string(),
  phone: v.optional(v.string()),
  businessName: v.optional(v.string()),
  businessIdea: v.optional(v.string()),
  stage: v.optional(stage),
  goals: v.optional(v.string()),
  constraints: v.optional(v.string()),
  communicationPrefs: v.optional(v.string()),
  accessibility: v.optional(v.string()),
  source: v.optional(v.string()),
  sharedFolderUrl: v.optional(v.string()),
  privateFolderUrl: v.optional(v.string()),
};

function cleanProfile(args: {
  fullName: string;
  preferredName: string;
  email: string;
  phone?: string;
  businessName?: string;
  businessIdea?: string;
  stage?: Doc<"clients">["stage"];
  goals?: string;
  constraints?: string;
  communicationPrefs?: string;
  accessibility?: string;
  source?: string;
  sharedFolderUrl?: string;
  privateFolderUrl?: string;
}) {
  const fullName = text(args.fullName, 160, "Name");
  if (!fullName) bad("Enter the client's name.");
  const email = normalizeEmail(text(args.email, 200, "Email"));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad("Enter a valid email.");
  return {
    fullName,
    preferredName: text(args.preferredName, 80, "Preferred name") || fullName.split(" ")[0],
    email,
    phone: optText(args.phone, 40, "Phone"),
    businessName: optText(args.businessName, 200),
    businessIdea: optText(args.businessIdea, 2000),
    stage: args.stage,
    goals: optText(args.goals, 3000),
    constraints: optText(args.constraints, 3000),
    communicationPrefs: optText(args.communicationPrefs, 2000),
    accessibility: optText(args.accessibility, 2000),
    source: optText(args.source, 200),
    sharedFolderUrl: link(args.sharedFolderUrl, "Shared folder link"),
    privateFolderUrl: link(args.privateFolderUrl, "Private folder link"),
  };
}

export const create = mutation({
  args: profileArgs,
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const profile = cleanProfile(args);
    const existing = await ctx.db
      .query("clients")
      .withIndex("by_email", (q) => q.eq("email", profile.email))
      .first();
    if (existing) {
      bad(`${existing.preferredName} already has a record with this email. Open her record instead.`);
    }
    const now = Date.now();
    const id = await ctx.db.insert("clients", {
      ...profile,
      pipelineStage: "inquiry",
      pipelineChangedAt: now,
      portalEnabled: false,
      archived: false,
      createdAt: now,
    });
    await logActivity(ctx, viewer, "client.created", `Added ${profile.preferredName} as a new inquiry`, id);
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("clients"), ...profileArgs },
  handler: async (ctx, { id, ...args }) => {
    const viewer = await requireTeam(ctx);
    const client = await ctx.db.get(id);
    if (!client) notFound("Client");
    const profile = cleanProfile(args);
    if (profile.email !== client.email) {
      const other = await ctx.db
        .query("clients")
        .withIndex("by_email", (q) => q.eq("email", profile.email))
        .first();
      if (other && other._id !== id) bad("Another client already uses that email.");
    }
    const patch: Partial<Doc<"clients">> = { ...profile };
    if (viewer.role !== "coach") {
      // Staff cannot change the private folder link.
      patch.privateFolderUrl = client.privateFolderUrl;
    }
    if (profile.email !== client.email && client.userId) {
      // A changed email breaks the sign-in link on purpose. Access must be re-granted.
      await ctx.db.patch(client.userId, { clientId: undefined });
      patch.userId = undefined;
      patch.portalEnabled = false;
    }
    await ctx.db.patch(id, patch);
    await logActivity(ctx, viewer, "client.updated", `Updated ${profile.preferredName}'s record`, id);
  },
});

export const saveDiscovery = mutation({
  args: {
    id: v.id("clients"),
    discoveryAt: v.optional(v.number()),
    discoveryNeed: v.optional(v.string()),
    discoveryOutcome: v.optional(v.string()),
    discoveryReadiness: v.optional(v.string()),
    hoursPerWeek: v.optional(v.number()),
    recommendedServiceKey: v.optional(v.string()),
    recommendationReason: v.optional(v.string()),
    decisionNote: v.optional(v.string()),
    referralNote: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...args }) => {
    const viewer = await requireTeam(ctx);
    const client = await ctx.db.get(id);
    if (!client) notFound("Client");
    if (args.hoursPerWeek !== undefined && (args.hoursPerWeek < 0 || args.hoursPerWeek > 168)) {
      bad("Check the hours per week.");
    }
    await ctx.db.patch(id, {
      discoveryAt: args.discoveryAt,
      discoveryNeed: optText(args.discoveryNeed, 3000),
      discoveryOutcome: optText(args.discoveryOutcome, 3000),
      discoveryReadiness: optText(args.discoveryReadiness, 3000),
      hoursPerWeek: args.hoursPerWeek,
      recommendedServiceKey: optText(args.recommendedServiceKey, 60),
      recommendationReason: optText(args.recommendationReason, 2000),
      decisionNote: optText(args.decisionNote, 2000),
      referralNote: optText(args.referralNote, 2000),
    });
    await logActivity(ctx, viewer, "discovery.saved", `Saved discovery notes for ${client.preferredName}`, id);
  },
});

export const setPipelineStage = mutation({
  args: { id: v.id("clients"), stage: pipelineStage },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const client = await ctx.db.get(args.id);
    if (!client) notFound("Client");
    if (client.pipelineStage === args.stage) return;
    const now = Date.now();
    await ctx.db.patch(args.id, {
      pipelineStage: args.stage,
      pipelineChangedAt: now,
      ...(args.stage === "enrolled" && !client.enrolledAt ? { enrolledAt: now } : {}),
    });
    await logActivity(
      ctx,
      viewer,
      "pipeline.moved",
      `Moved ${client.preferredName} to ${args.stage.replace(/_/g, " ")}`,
      args.id,
    );
  },
});

export const setFollowUp = mutation({
  args: { id: v.id("clients"), action: v.optional(v.string()), date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const client = await ctx.db.get(args.id);
    if (!client) notFound("Client");
    const action = optText(args.action, 300, "Follow-up");
    await ctx.db.patch(args.id, {
      followUpAction: action,
      followUpDate: action ? isoDate(args.date, "Follow-up date") : undefined,
    });
    await logActivity(
      ctx,
      viewer,
      "followup.set",
      action ? `Set follow-up for ${client.preferredName}: ${action}` : `Cleared follow-up for ${client.preferredName}`,
      args.id,
    );
  },
});

/** Only the coach decides who can sign in to a portal. */
export const setPortalAccess = mutation({
  args: { id: v.id("clients"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const viewer = await requireCoach(ctx);
    const client = await ctx.db.get(args.id);
    if (!client) notFound("Client");
    await ctx.db.patch(args.id, { portalEnabled: args.enabled });
    await logActivity(
      ctx,
      viewer,
      "portal.access",
      `${args.enabled ? "Turned on" : "Turned off"} portal access for ${client.preferredName}`,
      args.id,
    );
  },
});

/** Unlinks the current sign-in so the client can link again with her email. */
export const resetPortalLink = mutation({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    const viewer = await requireCoach(ctx);
    const client = await ctx.db.get(args.id);
    if (!client) notFound("Client");
    if (client.userId) {
      const user = await ctx.db.get(client.userId);
      if (user && user.clientId === args.id) {
        await ctx.db.patch(user._id, { clientId: undefined });
      }
    }
    await ctx.db.patch(args.id, { userId: undefined });
    await logActivity(ctx, viewer, "portal.reset", `Reset the portal sign-in link for ${client.preferredName}`, args.id);
  },
});

export const setArchived = mutation({
  args: { id: v.id("clients"), archived: v.boolean() },
  handler: async (ctx, args) => {
    const viewer = await requireCoach(ctx);
    const client = await ctx.db.get(args.id);
    if (!client) notFound("Client");
    await ctx.db.patch(args.id, {
      archived: args.archived,
      ...(args.archived ? { portalEnabled: false } : {}),
    });
    await logActivity(
      ctx,
      viewer,
      "client.archived",
      `${args.archived ? "Archived" : "Restored"} ${client.preferredName}'s record`,
      args.id,
    );
  },
});

/** Full client record export, including private material. Coach only. */
export const exportRecord = mutation({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    const viewer = await requireCoach(ctx);
    const client = await ctx.db.get(args.id);
    if (!client) notFound("Client");
    const id = args.id;
    const engagements = await ctx.db.query("engagements").withIndex("by_client", (q) => q.eq("clientId", id)).collect();
    const actions = await ctx.db.query("actions").withIndex("by_client", (q) => q.eq("clientId", id)).collect();
    const worksheets = await ctx.db.query("worksheetAssignments").withIndex("by_client", (q) => q.eq("clientId", id)).collect();
    const feedback = await ctx.db.query("feedback").withIndex("by_client", (q) => q.eq("clientId", id)).collect();
    const testimonials = await ctx.db.query("testimonials").withIndex("by_client", (q) => q.eq("clientId", id)).collect();
    const privateSessionNotes = await ctx.db.query("sessionNotes").withIndex("by_client", (q) => q.eq("clientId", id)).collect();
    const transcripts = await ctx.db.query("transcripts").withIndex("by_client", (q) => q.eq("clientId", id)).collect();
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_client", (q) => q.eq("clientId", args.id))
      .collect();
    const assessments = await ctx.db
      .query("assessments")
      .withIndex("by_client", (q) => q.eq("clientId", args.id))
      .collect();
    const thread = await ctx.db
      .query("threads")
      .withIndex("by_client", (q) => q.eq("clientId", args.id))
      .first();
    const messages = thread
      ? await ctx.db
          .query("messages")
          .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
          .collect()
      : [];
    const coworking = await ctx.db
      .query("coworkingRegistrations")
      .withIndex("by_email", (q) => q.eq("email", client.email))
      .collect();
    const activity = await ctx.db
      .query("activity")
      .withIndex("by_client", (q) => q.eq("clientId", args.id))
      .collect();
    await logActivity(ctx, viewer, "client.exported", `Exported ${client.preferredName}'s full record`, args.id);
    return {
      exportedAt: new Date().toISOString(),
      exportedBy: viewer.name,
      client,
      engagements,
      sessions,
      privateSessionNotes,
      transcripts,
      actions,
      worksheets,
      assessments,
      messages,
      coworkingRegistrations: coworking,
      feedback,
      testimonials,
      activity,
    };
  },
});
