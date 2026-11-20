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
  can,
  requirePermission,
  requireTeam,
  text,
  type Viewer,
} from "./lib/auth";
import { computeBalance } from "./lib/balance";

/** Staff do not see the private folder link. */
function forViewer(client: Doc<"clients">, viewer: Viewer) {
  if (can(viewer, "coaching")) return client;
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
          access: c.access,
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
          if (can(viewer, "coaching")) return s;
          const { recapDraft: _d, ...rest } = s;
          void _d;
          return rest;
        }),
      actions: actions.sort((a, b) => b.createdAt - a.createdAt),
      worksheets: worksheets.sort((a, b) => b.assignedAt - a.assignedAt),
      assessments: assessments.sort((a, b) => b.assignedAt - a.assignedAt),
      coworking: coworking.sort((a, b) => b.startsAt - a.startsAt),
      thread,
      feedback: can(viewer, "coaching") ? feedback : [],
      testimonials: can(viewer, "coaching") ? testimonials : [],
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
      access: "none",
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
    if (!can(viewer, "coaching")) {
      // Staff cannot change the private folder link.
      patch.privateFolderUrl = client.privateFolderUrl;
    }
    if (profile.email !== client.email && client.userId) {
      // A changed email breaks the sign-in link on purpose. Access must be re-granted.
      await ctx.db.patch(client.userId, { clientId: undefined });
      patch.userId = undefined;
      patch.access = "none";
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
    // Recommending a service sets the next step, so it is not typed twice.
    const recommended = optText(args.recommendedServiceKey, 60);
    if (recommended && recommended !== client.recommendedServiceKey && !client.followUpAction) {
      const service = await ctx.db
        .query("services")
        .withIndex("by_key", (q) => q.eq("key", recommended))
        .unique();
      const due = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
      await ctx.db.patch(id, { followUpAction: `Send ${client.preferredName} the written details for ${service?.name ?? "the recommended service"}`, followUpDate: due });
    }
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

export const setArchived = mutation({
  args: { id: v.id("clients"), archived: v.boolean() },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "export");
    const client = await ctx.db.get(args.id);
    if (!client) notFound("Client");
    await ctx.db.patch(args.id, {
      archived: args.archived,
      ...(args.archived && client.access !== "none" ? { access: "ended" as const, accessChangedAt: Date.now() } : {}),
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
    const viewer = await requirePermission(ctx, "export");
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

const INQUIRY_SOURCE = "Inquiry form";
const INQUIRIES_PER_DAY = 40;

/**
 * The public "work with Tamika" form. No sign-in. It only ever creates an
 * inquiry record. It never gives portal access and never reveals whether an
 * email is already on file.
 */
export const publicInquiry = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    stage: v.optional(stage),
    business: v.optional(v.string()),
    message: v.optional(v.string()),
    foundBy: v.optional(v.string()),
    website: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // "website" is a hidden field real people never fill in.
    if (args.website) return { ok: true };
    const fullName = text(args.name, 160, "Name");
    if (fullName.length < 2) bad("Enter your name.");
    const email = normalizeEmail(text(args.email, 200, "Email"));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad("Enter a valid email.");
    const message = optText(args.message, 2000, "Message");
    const now = Date.now();
    const existing = await ctx.db
      .query("clients")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existing) {
      await ctx.db.insert("activity", {
        at: now,
        actor: fullName,
        actorRole: "public",
        action: "inquiry.repeat",
        summary: `${fullName} sent the inquiry form again${message ? `: ${message.slice(0, 160)}` : ""}`,
        clientId: existing._id,
      });
      if (!existing.followUpAction) {
        await ctx.db.patch(existing._id, { followUpAction: `Reply to ${existing.preferredName}'s new inquiry`, followUpDate: new Date(now).toISOString().slice(0, 10) });
      }
      return { ok: true };
    }
    const recent = await ctx.db
      .query("clients")
      .withIndex("by_pipeline", (q) => q.eq("pipelineStage", "inquiry"))
      .collect();
    if (recent.filter((c) => c.source === INQUIRY_SOURCE && c.createdAt > now - 86400_000).length >= INQUIRIES_PER_DAY) {
      bad("We are getting a lot of requests right now. Please try again tomorrow.");
    }
    const id = await ctx.db.insert("clients", {
      fullName,
      preferredName: fullName.split(" ")[0],
      email,
      businessName: optText(args.business, 200),
      stage: args.stage,
      source: optText(args.foundBy, 200) ? `${INQUIRY_SOURCE}: ${optText(args.foundBy, 200)}` : INQUIRY_SOURCE,
      discoveryNeed: message,
      pipelineStage: "inquiry",
      pipelineChangedAt: now,
      followUpAction: `Invite ${fullName.split(" ")[0]} to book a discovery call`,
      followUpDate: new Date(now).toISOString().slice(0, 10),
      access: "none",
      archived: false,
      createdAt: now,
    });
    await ctx.db.insert("activity", {
      at: now,
      actor: fullName,
      actorRole: "public",
      action: "inquiry.received",
      summary: `${fullName} sent the inquiry form`,
      clientId: id,
    });
    return { ok: true };
  },
});
