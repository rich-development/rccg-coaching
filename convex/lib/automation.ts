import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { computeBalance } from "./balance";
import { ASSESSMENT_KINDS } from "./defaults";

/**
 * Work the app does so Tamika does not have to:
 *   - the onboarding checklist checks itself when each thing really happens
 *   - intake is assigned with the invitation and fills the client record
 *   - the next workbook page is assigned after each session
 *   - check-ins and reviews go out on a schedule (see automation.ts)
 * Every automatic step can be turned off per engagement (automationOff).
 */

export const DEFAULT_WORKSHEET_ORDER: Record<string, string[]> = {
  structure: ["starting_point", "thirty_day", "repeatable", "progress_review"],
  next_step: ["action_plan"],
  keep_moving: ["session_prep", "progress_review"],
};

export const DEFAULT_CHECKIN_DAYS: Record<string, number> = {
  structure: 7,
  keep_moving: 14,
};

export async function serviceFor(ctx: MutationCtx, key: string) {
  return await ctx.db
    .query("services")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

async function insertAssessment(
  ctx: MutationCtx,
  clientId: Id<"clients">,
  kind: keyof typeof ASSESSMENT_KINDS,
  engagementId?: Id<"engagements">,
) {
  const def = ASSESSMENT_KINDS[kind];
  return await ctx.db.insert("assessments", {
    clientId,
    engagementId,
    kind,
    title: def.title,
    questions: def.questions.map((q) => ({ ...q })),
    answers: {},
    status: "assigned",
    assignedAt: Date.now(),
  });
}

/** Assigns intake once per client. Returns true if it was added. */
export async function ensureIntake(ctx: MutationCtx, clientId: Id<"clients">, engagementId?: Id<"engagements">) {
  const existing = await ctx.db
    .query("assessments")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))
    .collect();
  if (existing.some((a) => a.kind === "intake")) return false;
  await insertAssessment(ctx, clientId, "intake", engagementId);
  return true;
}

export async function assignAssessmentOnce(
  ctx: MutationCtx,
  engagement: Doc<"engagements">,
  kind: "checkin" | "midpoint" | "completion" | "feedback",
) {
  await insertAssessment(ctx, engagement.clientId, kind, engagement._id);
}

const STAGE: Record<string, "starting" | "starting_over" | "pivoting"> = {
  Starting: "starting",
  "Starting over": "starting_over",
  Pivoting: "pivoting",
};

/**
 * Copies intake answers into the client record so nobody retypes them.
 * Only fills fields that are still empty, except the preferred name, which
 * is hers to set.
 */
export async function applyIntake(ctx: MutationCtx, assessment: Doc<"assessments">, answers: Record<string, string>) {
  if (assessment.kind !== "intake") return;
  const client = await ctx.db.get(assessment.clientId);
  if (!client) return;
  const patch: Partial<Doc<"clients">> = { intakeAppliedAt: Date.now() };
  if (answers.preferred_name) patch.preferredName = answers.preferred_name.slice(0, 80);
  if (answers.business && !client.businessName) patch.businessName = answers.business.slice(0, 200);
  if (answers.stage && STAGE[answers.stage] && !client.stage) patch.stage = STAGE[answers.stage];
  if (answers.outcome && !client.goals) patch.goals = answers.outcome;
  const hours = Number(answers.hours);
  if (answers.hours && Number.isFinite(hours) && hours >= 0 && hours <= 168 && client.hoursPerWeek === undefined) {
    patch.hoursPerWeek = hours;
  }
  if (!client.constraints) {
    const parts = [answers.limits, answers.hours ? `About ${answers.hours} hours a week.` : ""].filter(Boolean);
    if (parts.length) patch.constraints = parts.join("\n");
  }
  if (answers.preferences && !client.communicationPrefs) patch.communicationPrefs = answers.preferences;
  await ctx.db.patch(client._id, patch);

  // Give the engagement a starting goal for Tamika to sharpen in session one.
  const engagements = await ctx.db
    .query("engagements")
    .withIndex("by_client", (q) => q.eq("clientId", client._id))
    .collect();
  for (const e of engagements) {
    if ((e.status === "onboarding" || e.status === "active") && !e.goal && answers.outcome) {
      await ctx.db.patch(e._id, { goal: answers.outcome });
    }
  }
}

/** Assigns the next page in the service's order that she does not have yet. */
export async function assignNextWorksheet(ctx: MutationCtx, engagement: Doc<"engagements">) {
  if (engagement.automationOff) return null;
  const service = await serviceFor(ctx, engagement.serviceKey);
  const order = service?.worksheetOrder ?? DEFAULT_WORKSHEET_ORDER[engagement.serviceKey] ?? [];
  if (order.length === 0) return null;
  const mine = await ctx.db
    .query("worksheetAssignments")
    .withIndex("by_client", (q) => q.eq("clientId", engagement.clientId))
    .collect();
  // One page at a time: wait until the last one is sent in.
  if (mine.some((w) => w.engagementId === engagement._id && (w.status === "assigned" || w.status === "draft"))) return null;
  const have = new Set(mine.filter((w) => w.engagementId === engagement._id).map((w) => w.templateKey));
  const nextKey = order.find((k) => !have.has(k));
  if (!nextKey) return null;
  const template = await ctx.db
    .query("worksheetTemplates")
    .withIndex("by_key", (q) => q.eq("key", nextKey))
    .unique();
  if (!template || !template.active) return null;
  return await ctx.db.insert("worksheetAssignments", {
    clientId: engagement.clientId,
    engagementId: engagement._id,
    templateKey: template.key,
    title: template.title,
    intro: template.intro,
    fields: template.fields,
    responses: {},
    status: "assigned",
    assignedAt: Date.now(),
  });
}

/**
 * Checks off onboarding steps that have really happened, and makes the
 * engagement active when every step is done. Never un-checks a step Tamika
 * ticked herself, except payment, which always follows the payment record.
 */
export async function syncChecklist(ctx: MutationCtx, engagementId: Id<"engagements">) {
  const e = await ctx.db.get(engagementId);
  if (!e || (e.status !== "onboarding" && e.status !== "active")) return;
  const sessions = await ctx.db
    .query("sessions")
    .withIndex("by_engagement", (q) => q.eq("engagementId", engagementId))
    .collect();
  const assessments = await ctx.db
    .query("assessments")
    .withIndex("by_client", (q) => q.eq("clientId", e.clientId))
    .collect();
  const worksheets = await ctx.db
    .query("worksheetAssignments")
    .withIndex("by_client", (q) => q.eq("clientId", e.clientId))
    .collect();
  const thread = await ctx.db
    .query("threads")
    .withIndex("by_client", (q) => q.eq("clientId", e.clientId))
    .first();
  let welcomed = false;
  if (thread) {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
      .collect();
    welcomed = messages.some((m) => m.from === "coach" && m.createdAt >= e.createdAt);
  }
  const balance = computeBalance(e, sessions);
  const intake = assessments.find((a) => a.kind === "intake");
  const happened: Record<string, boolean> = {
    terms: true,
    agreement: e.agreementStatus === "signed",
    payment: e.paymentStatus === "paid" || e.paymentStatus === "waived",
    booking: sessions.some((s) => s.status === "scheduled" || s.status === "completed") && balance.unscheduled === 0,
    intake: !!intake,
    workbook: worksheets.some((w) => w.engagementId === engagementId),
    welcome: welcomed,
    permissions: e.recordingPermission !== "not_asked" && e.transcriptionPermission !== "not_asked" && e.aiPermission !== "not_asked",
    prep: !!intake && intake.status === "completed" && intake.reviewedAt !== undefined,
  };
  const now = Date.now();
  let changed = false;
  const checklist = e.checklist.map((c) => {
    const auto = happened[c.key];
    if (c.key === "payment" && auto !== undefined && c.done !== auto) {
      changed = true;
      return { ...c, done: auto, doneAt: auto ? now : undefined };
    }
    if (auto && !c.done) {
      changed = true;
      return { ...c, done: true, doneAt: now };
    }
    return c;
  });
  const allDone = checklist.every((c) => c.done);
  if (changed || (allDone && e.status === "onboarding")) {
    await ctx.db.patch(engagementId, {
      checklist,
      ...(allDone && e.status === "onboarding" ? { status: "active" as const } : {}),
    });
  }
}

/** Runs the checklist sync for every open engagement of one client. */
export async function syncClientChecklists(ctx: MutationCtx, clientId: Id<"clients">) {
  const engagements = await ctx.db
    .query("engagements")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))
    .collect();
  for (const e of engagements) {
    if (e.status === "onboarding" || e.status === "active") await syncChecklist(ctx, e._id);
  }
}
