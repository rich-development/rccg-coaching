import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { refDef } from "./schema";
import { bad, notFound, optText, requireClient, text } from "./lib/auth";
import { buildAgreement } from "./lib/agreement";
import { applyIntake, syncChecklist, syncClientChecklists } from "./lib/automation";
import { computeBalance } from "./lib/balance";
import { postMessage } from "./lib/threads";
import { readSettings } from "./settings";

/**
 * THE CLIENT PORTAL. This is the only file a signed-in client can use.
 *
 * Rules for every function here:
 * 1. Start with requireClient(ctx). It returns the client record that belongs
 *    to the person who is signed in.
 * 2. Never accept a clientId argument. When a function takes the id of a
 *    worksheet, action, or assessment, check that it belongs to this client
 *    before reading or writing it.
 * 3. Return hand-picked fields only. Never return a whole document.
 * 4. Never read sessionNotes, transcripts, aiBriefs, or activity.
 */

function sessionForClient(s: Doc<"sessions">) {
  return {
    _id: s._id,
    number: s.number,
    scheduledAt: s.scheduledAt,
    durationMinutes: s.durationMinutes,
    format: s.format,
    meetLink: s.status === "scheduled" ? s.meetLink : undefined,
    location: s.location,
    status: s.status,
    priority: s.priority,
  };
}

function actionForClient(a: Doc<"actions">) {
  return {
    _id: a._id,
    title: a.title,
    owner: a.owner,
    dueDate: a.dueDate,
    doneLooksLike: a.doneLooksLike,
    obstacle: a.obstacle,
    smallerStep: a.smallerStep,
    status: a.status,
    clientNote: a.clientNote,
    completedAt: a.completedAt,
  };
}

export const home = query({
  args: {},
  handler: async (ctx) => {
    const { client } = await requireClient(ctx);
    const settings = await readSettings(ctx);
    const engagements = await ctx.db
      .query("engagements")
      .withIndex("by_client", (q) => q.eq("clientId", client._id))
      .collect();
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_client", (q) => q.eq("clientId", client._id))
      .collect();
    const current =
      engagements.find((e) => e.status === "active") ??
      engagements.find((e) => e.status === "onboarding") ??
      engagements.find((e) => e.status === "paused") ??
      null;
    const now = Date.now();
    const upcoming = sessions
      .filter((s) => s.status === "scheduled" && s.scheduledAt > now - 2 * 3600_000)
      .sort((a, b) => a.scheduledAt - b.scheduledAt);
    const actions = await ctx.db
      .query("actions")
      .withIndex("by_client", (q) => q.eq("clientId", client._id))
      .collect();
    const worksheets = await ctx.db
      .query("worksheetAssignments")
      .withIndex("by_client", (q) => q.eq("clientId", client._id))
      .collect();
    const assessments = await ctx.db
      .query("assessments")
      .withIndex("by_client", (q) => q.eq("clientId", client._id))
      .collect();
    const thread = await ctx.db
      .query("threads")
      .withIndex("by_client", (q) => q.eq("clientId", client._id))
      .first();
    const testimonials = await ctx.db
      .query("testimonials")
      .withIndex("by_client", (q) => q.eq("clientId", client._id))
      .collect();
    const recaps = sessions.filter((s) => s.recapShared);

    // Co-working she is confirmed for. The link is private to registrants.
    const regs = await ctx.db
      .query("coworkingRegistrations")
      .withIndex("by_email", (q) => q.eq("email", client.email))
      .collect();
    const coworking = [];
    for (const r of regs) {
      if (r.status !== "registered") continue;
      const s = await ctx.db.get(r.sessionId);
      if (!s || s.startsAt < now - 3 * 3600_000 || s.status === "cancelled" || s.status === "draft") continue;
      const confirmed = r.paymentStatus === "paid" || r.paymentStatus === "waived";
      coworking.push({
        _id: r._id,
        title: s.title,
        startsAt: s.startsAt,
        durationMinutes: s.durationMinutes,
        format: s.format,
        location: s.location,
        instructions: s.instructions,
        confirmed,
        meetLink: confirmed ? s.meetLink : undefined,
        paymentLink: confirmed ? undefined : s.paymentLink,
      });
    }

    return {
      preferredName: client.preferredName,
      coachName: settings.coachName,
      sharedFolderUrl: client.sharedFolderUrl,
      schedulingLink: settings.schedulingLink,
      engagement: current
        ? {
            serviceName: current.serviceName,
            status: current.status,
            startDate: current.startDate,
            endDate: current.endDate,
            goal: current.goal,
            measureName: current.measureName,
            measureStart: current.measureStart,
            measureTarget: current.measureTarget,
            measureActual: current.measureActual,
            supportTerms: current.supportTerms,
            supportChannel: current.supportChannel,
            responseWindow: current.responseWindow,
            paymentStatus: current.paymentStatus,
            paymentLink:
              current.paymentStatus === "unpaid" || current.paymentStatus === "partial"
                ? current.paymentLink
                : undefined,
            agreementUrl: current.agreementUrl,
            agreementAccepted: current.agreementStatus === "signed",
            agreementAcceptedAt: current.agreementAcceptedAt,
            agreementSignature: current.agreementSignature,
            // Shown until she accepts. After that she sees what she accepted.
            agreementText: current.agreementAcceptedText ?? buildAgreement(current, settings.coachName, settings.agreementTerms),
            consentAnswered:
              current.recordingPermission !== "not_asked" &&
              current.transcriptionPermission !== "not_asked" &&
              current.aiPermission !== "not_asked",
            recordingPermission: current.recordingPermission,
            transcriptionPermission: current.transcriptionPermission,
            aiPermission: current.aiPermission,
            balance: computeBalance(
              current,
              sessions.filter((s) => s.engagementId === current._id),
            ),
          }
        : null,
      upcoming: upcoming.map(sessionForClient),
      actions: actions
        .filter((a) => a.visibleToClient && (a.status === "open" || a.status === "in_progress"))
        .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
        .map(actionForClient),
      recentlyDone: actions
        .filter((a) => a.visibleToClient && a.status === "completed")
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
        .slice(0, 5)
        .map(actionForClient),
      worksheets: worksheets
        .sort((a, b) => b.assignedAt - a.assignedAt)
        .map((w) => ({
          _id: w._id,
          title: w.title,
          status: w.status,
          dueDate: w.dueDate,
          note: w.note,
          linkUrl: w.linkUrl,
          hasComment: !!w.coachComment,
        })),
      assessments: assessments
        .sort((a, b) => b.assignedAt - a.assignedAt)
        .map((a) => ({ _id: a._id, title: a.title, kind: a.kind, status: a.status, externalUrl: a.externalUrl })),
      latestRecap: recaps.sort((a, b) => b.scheduledAt - a.scheduledAt)[0]
        ? {
            _id: recaps[0]._id,
            number: recaps[0].number,
            scheduledAt: recaps[0].scheduledAt,
            body: recaps[0].recapShared!,
          }
        : null,
      recapCount: recaps.length,
      unreadMessages: thread?.unreadForClient ?? 0,
      testimonialRequests: testimonials
        .filter((t) => t.status === "requested")
        .map((t) => ({ _id: t._id, quote: t.quote, attribution: t.attribution, placements: t.placements })),
      coworking,
    };
  },
});

/** Approved recaps only. Drafts and private notes are never read here. */
export const recaps = query({
  args: {},
  handler: async (ctx) => {
    const { client } = await requireClient(ctx);
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_client", (q) => q.eq("clientId", client._id))
      .collect();
    const actions = await ctx.db
      .query("actions")
      .withIndex("by_client", (q) => q.eq("clientId", client._id))
      .collect();
    return sessions
      .filter((s) => s.status === "completed" || s.recapShared)
      .sort((a, b) => b.scheduledAt - a.scheduledAt)
      .map((s) => ({
        _id: s._id,
        number: s.number,
        scheduledAt: s.scheduledAt,
        priority: s.priority,
        recap: s.recapShared ?? null,
        actions: actions.filter((a) => a.sessionId === s._id && a.visibleToClient).map(actionForClient),
      }));
  },
});

export const messages = query({
  args: {},
  handler: async (ctx) => {
    const { client } = await requireClient(ctx);
    const settings = await readSettings(ctx);
    const thread = await ctx.db
      .query("threads")
      .withIndex("by_client", (q) => q.eq("clientId", client._id))
      .first();
    const rows = thread
      ? await ctx.db
          .query("messages")
          .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
          .collect()
      : [];
    const engagements = await ctx.db
      .query("engagements")
      .withIndex("by_client", (q) => q.eq("clientId", client._id))
      .collect();
    const current = engagements.find((e) => e.status === "active" || e.status === "onboarding");
    return {
      coachName: settings.coachName,
      responseWindow: current?.responseWindow ?? settings.responseWindow,
      supportChannel: current?.supportChannel ?? settings.supportChannel,
      supportTerms: current?.supportTerms ?? null,
      messages: rows.map((m) => ({
        _id: m._id,
        from: m.from,
        authorName: m.authorName,
        body: m.body,
        ref: m.ref,
        createdAt: m.createdAt,
      })),
    };
  },
});

export const sendMessage = mutation({
  args: { body: v.string(), ref: v.optional(refDef) },
  handler: async (ctx, args) => {
    const { client } = await requireClient(ctx);
    const body = text(args.body, 4000, "Message");
    if (!body) bad("Write a message first.");
    let ref = args.ref;
    if (ref) {
      // A reference must point at something that belongs to this client.
      let ok = false;
      if (ref.type === "session") {
        const id = ctx.db.normalizeId("sessions", ref.id);
        const doc = id ? await ctx.db.get(id) : null;
        ok = !!doc && doc.clientId === client._id;
      } else if (ref.type === "worksheet") {
        const id = ctx.db.normalizeId("worksheetAssignments", ref.id);
        const doc = id ? await ctx.db.get(id) : null;
        ok = !!doc && doc.clientId === client._id;
      } else if (ref.type === "action") {
        const id = ctx.db.normalizeId("actions", ref.id);
        const doc = id ? await ctx.db.get(id) : null;
        ok = !!doc && doc.clientId === client._id && doc.visibleToClient;
      } else {
        const id = ctx.db.normalizeId("assessments", ref.id);
        const doc = id ? await ctx.db.get(id) : null;
        ok = !!doc && doc.clientId === client._id;
      }
      if (!ok) ref = undefined;
      else ref = { ...ref, label: text(ref.label, 200) };
    }
    await postMessage(ctx, client._id, "client", client.preferredName, body, ref);
  },
});

export const markMessagesRead = mutation({
  args: {},
  handler: async (ctx) => {
    const { client } = await requireClient(ctx);
    const thread = await ctx.db
      .query("threads")
      .withIndex("by_client", (q) => q.eq("clientId", client._id))
      .first();
    if (thread && thread.unreadForClient > 0) {
      await ctx.db.patch(thread._id, { unreadForClient: 0 });
    }
  },
});

/** A client can report progress on her own commitments. Revisions happen with Tamika. */
export const updateAction = mutation({
  args: {
    id: v.id("actions"),
    status: v.union(v.literal("open"), v.literal("in_progress"), v.literal("completed")),
    clientNote: v.optional(v.string()),
    obstacle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { client } = await requireClient(ctx);
    const action = await ctx.db.get(args.id);
    if (!action || action.clientId !== client._id || !action.visibleToClient) notFound("Action");
    if (action.owner !== "client") bad("This one is Tamika's to update.");
    if (action.status === "revised" || action.status === "dropped") {
      bad("This action was changed. Check your current list.");
    }
    await ctx.db.patch(args.id, {
      status: args.status,
      clientNote: optText(args.clientNote, 1000),
      obstacle: optText(args.obstacle, 600) ?? action.obstacle,
      completedAt: args.status === "completed" ? (action.completedAt ?? Date.now()) : undefined,
    });
    await ctx.db.insert("activity", {
      at: Date.now(),
      actor: client.preferredName,
      actorRole: "client",
      action: "action.client_update",
      summary: `${client.preferredName} marked "${action.title}" as ${args.status.replace("_", " ")}`,
      clientId: client._id,
      entity: args.id,
    });
  },
});

export const worksheet = query({
  args: { id: v.id("worksheetAssignments") },
  handler: async (ctx, args) => {
    const { client } = await requireClient(ctx);
    const w = await ctx.db.get(args.id);
    if (!w || w.clientId !== client._id) return null;
    return {
      _id: w._id,
      title: w.title,
      intro: w.intro,
      fields: w.fields,
      responses: w.responses,
      status: w.status,
      note: w.note,
      dueDate: w.dueDate,
      linkUrl: w.linkUrl,
      coachComment: w.coachComment,
      submittedAt: w.submittedAt,
    };
  },
});

function cleanResponses(
  allowed: { key: string; type: string; columns?: string[]; rows?: string[]; rowCount?: number }[],
  input: Record<string, string>,
) {
  const keys = new Set<string>();
  for (const f of allowed) {
    if (f.type === "table") {
      const rows = f.rows ? f.rows.length : (f.rowCount ?? 3);
      const cols = f.columns?.length ?? 1;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) keys.add(`${f.key}.${r}.${c}`);
    } else {
      keys.add(f.key);
    }
  }
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(input)) {
    if (!keys.has(k)) bad("That answer does not match this page.");
    const t = text(val, 4000, "Answer");
    if (t) out[k] = t;
  }
  return out;
}

/** Save a draft any time, or submit when ready. */
export const saveWorksheet = mutation({
  args: {
    id: v.id("worksheetAssignments"),
    responses: v.record(v.string(), v.string()),
    submit: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { client } = await requireClient(ctx);
    const w = await ctx.db.get(args.id);
    if (!w || w.clientId !== client._id) notFound("Worksheet");
    if (w.status === "reviewed") bad("Tamika has reviewed this page. Message her if you want to reopen it.");
    const responses = cleanResponses(w.fields, args.responses);
    await ctx.db.patch(args.id, {
      responses,
      status: args.submit ? "submitted" : "draft",
      submittedAt: args.submit ? Date.now() : w.submittedAt,
    });
    if (args.submit) {
      await ctx.db.insert("activity", {
        at: Date.now(),
        actor: client.preferredName,
        actorRole: "client",
        action: "worksheet.submitted",
        summary: `${client.preferredName} submitted "${w.title}"`,
        clientId: client._id,
        entity: args.id,
      });
    }
  },
});

export const assessment = query({
  args: { id: v.id("assessments") },
  handler: async (ctx, args) => {
    const { client } = await requireClient(ctx);
    const a = await ctx.db.get(args.id);
    if (!a || a.clientId !== client._id) return null;
    return {
      _id: a._id,
      title: a.title,
      kind: a.kind,
      questions: a.questions,
      answers: a.answers,
      status: a.status,
      externalUrl: a.externalUrl,
      completedAt: a.completedAt,
    };
  },
});

export const submitAssessment = mutation({
  args: { id: v.id("assessments"), answers: v.record(v.string(), v.string()) },
  handler: async (ctx, args) => {
    const { client } = await requireClient(ctx);
    const a = await ctx.db.get(args.id);
    if (!a || a.clientId !== client._id) notFound("Assessment");
    if (a.status === "completed") bad("You already sent this one in.");
    const answers = cleanResponses(a.questions, args.answers);
    const missing = a.questions.filter((q) => !q.optional && !answers[q.key]);
    if (missing.length > 0) bad(`Please answer: ${missing[0].label}`);
    await ctx.db.patch(args.id, { answers, status: "completed", completedAt: Date.now() });
    await applyIntake(ctx, a, answers);
    await syncClientChecklists(ctx, client._id);
    if (a.kind === "feedback") {
      // Feedback is stored on its own. It is never treated as permission to publish.
      await ctx.db.insert("feedback", {
        clientId: client._id,
        engagementId: a.engagementId,
        mostUseful: answers.most_useful,
        improve: answers.improve,
        canDoNow: answers.can_do_now,
        anythingElse: answers.anything_else,
        submittedAt: Date.now(),
      });
    }
    await ctx.db.insert("activity", {
      at: Date.now(),
      actor: client.preferredName,
      actorRole: "client",
      action: "assessment.completed",
      summary: `${client.preferredName} completed ${a.title.toLowerCase()}`,
      clientId: client._id,
      entity: args.id,
    });
  },
});

/** Yes or no to one exact quote, attribution, and list of places. */
export const answerTestimonial = mutation({
  args: { id: v.id("testimonials"), granted: v.boolean() },
  handler: async (ctx, args) => {
    const { client } = await requireClient(ctx);
    const t = await ctx.db.get(args.id);
    if (!t || t.clientId !== client._id || t.status !== "requested") notFound("Request");
    await ctx.db.patch(args.id, { status: args.granted ? "granted" : "declined", respondedAt: Date.now() });
    await ctx.db.insert("activity", {
      at: Date.now(),
      actor: client.preferredName,
      actorRole: "client",
      action: "testimonial.answer",
      summary: `${client.preferredName} ${args.granted ? "gave" : "declined"} permission to use her quote`,
      clientId: client._id,
      entity: args.id,
    });
  },
});

async function currentEngagement(ctx: MutationCtx, clientId: Id<"clients">) {
  const engagements = await ctx.db
    .query("engagements")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))
    .collect();
  return (
    engagements.find((e) => e.status === "active") ??
    engagements.find((e) => e.status === "onboarding") ??
    engagements.find((e) => e.status === "paused") ??
    null
  );
}

/**
 * Click-to-accept with a typed signature. The agreement text is rebuilt on
 * the server from her saved terms, so what is stored is exactly what she saw.
 */
export const acceptAgreement = mutation({
  args: { typedName: v.string(), agreed: v.boolean() },
  handler: async (ctx, args) => {
    const { client } = await requireClient(ctx);
    const e = await currentEngagement(ctx, client._id);
    if (!e) notFound("Agreement");
    if (e.agreementStatus === "signed") bad("You already accepted this agreement.");
    if (!args.agreed) bad("Check the box to show you agree.");
    const typedName = text(args.typedName, 160, "Your name");
    if (typedName.length < 3 || !typedName.includes(" ")) bad("Type your full name as your signature.");
    const settings = await readSettings(ctx);
    const now = Date.now();
    await ctx.db.patch(e._id, {
      agreementStatus: "signed",
      agreementAcceptedText: buildAgreement(e, settings.coachName, settings.agreementTerms),
      agreementSignature: typedName,
      agreementAcceptedAt: now,
    });
    await syncChecklist(ctx, e._id);
    await ctx.db.insert("activity", {
      at: now,
      actor: client.preferredName,
      actorRole: "client",
      action: "agreement.accepted",
      summary: `${client.preferredName} accepted the ${e.serviceName} agreement, signing as "${typedName}"`,
      clientId: client._id,
      entity: e._id,
    });
  },
});

/** Her own answers on recording, transcripts, and AI help. She can change them any time. */
export const answerConsent = mutation({
  args: { recording: v.boolean(), transcription: v.boolean(), ai: v.boolean() },
  handler: async (ctx, args) => {
    const { client } = await requireClient(ctx);
    const e = await currentEngagement(ctx, client._id);
    if (!e) notFound("Engagement");
    const say = (yes: boolean) => (yes ? ("granted" as const) : ("declined" as const));
    await ctx.db.patch(e._id, {
      recordingPermission: say(args.recording),
      // A transcript needs a recording, so "no recording" also means no transcript.
      transcriptionPermission: say(args.recording && args.transcription),
      aiPermission: say(args.ai),
      permissionsUpdatedAt: Date.now(),
    });
    await syncChecklist(ctx, e._id);
    await ctx.db.insert("activity", {
      at: Date.now(),
      actor: client.preferredName,
      actorRole: "client",
      action: "permissions.client",
      summary: `${client.preferredName} set her choices. Recording: ${args.recording ? "yes" : "no"}. Transcript: ${args.recording && args.transcription ? "yes" : "no"}. AI help: ${args.ai ? "yes" : "no"}.`,
      clientId: client._id,
      entity: e._id,
    });
  },
});

/* ---------- Files ---------- */

const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Shared files only. Private coach files are never read here. */
export const files = query({
  args: {},
  handler: async (ctx) => {
    const { client } = await requireClient(ctx);
    const rows = await ctx.db
      .query("files")
      .withIndex("by_client", (q) => q.eq("clientId", client._id))
      .order("desc")
      .collect();
    const out = [];
    for (const f of rows) {
      if (f.visibility !== "shared") continue;
      out.push({
        _id: f._id,
        name: f.name,
        size: f.size,
        uploadedBy: f.uploadedBy,
        uploaderName: f.uploaderName,
        createdAt: f.createdAt,
        url: await ctx.storage.getUrl(f.storageId),
      });
    }
    return out;
  },
});

export const fileUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireClient(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveFile = mutation({
  args: { storageId: v.id("_storage"), name: v.string() },
  handler: async (ctx, args) => {
    const { client } = await requireClient(ctx);
    const meta = await ctx.db.system.get(args.storageId);
    if (!meta) notFound("Upload");
    const already = await ctx.db
      .query("files")
      .withIndex("by_client", (q) => q.eq("clientId", client._id))
      .collect();
    if (meta.size > MAX_FILE_BYTES || already.length >= 200) {
      await ctx.storage.delete(args.storageId);
      bad(meta.size > MAX_FILE_BYTES ? "That file is too big. The limit is 20 MB." : "This folder is full. Ask Tamika to clear some space.");
    }
    await ctx.db.insert("files", {
      clientId: client._id,
      storageId: args.storageId,
      name: text(args.name, 200, "File name") || "Untitled",
      size: meta.size,
      contentType: meta.contentType ?? "application/octet-stream",
      visibility: "shared",
      uploadedBy: "client",
      uploaderName: client.preferredName,
      createdAt: Date.now(),
    });
    await ctx.db.insert("activity", {
      at: Date.now(),
      actor: client.preferredName,
      actorRole: "client",
      action: "file.uploaded",
      summary: `${client.preferredName} shared a file: ${args.name.slice(0, 120)}`,
      clientId: client._id,
    });
  },
});

/** A client can remove a file she uploaded herself. */
export const removeFile = mutation({
  args: { id: v.id("files") },
  handler: async (ctx, args) => {
    const { client } = await requireClient(ctx);
    const f = await ctx.db.get(args.id);
    if (!f || f.clientId !== client._id || f.visibility !== "shared" || f.uploadedBy !== "client") notFound("File");
    await ctx.storage.delete(f.storageId);
    await ctx.db.delete(args.id);
  },
});
