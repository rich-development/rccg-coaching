import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { bad, link, logActivity, notFound, requireTeam, text } from "./lib/auth";
import { ASSESSMENT_KINDS } from "./lib/defaults";

const kind = v.union(
  v.literal("intake"),
  v.literal("checkin"),
  v.literal("midpoint"),
  v.literal("completion"),
  v.literal("feedback"),
);

export const assign = mutation({
  args: {
    clientId: v.id("clients"),
    kind,
    engagementId: v.optional(v.id("engagements")),
    externalUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const client = await ctx.db.get(args.clientId);
    if (!client) notFound("Client");
    const def = ASSESSMENT_KINDS[args.kind];
    const id = await ctx.db.insert("assessments", {
      clientId: args.clientId,
      engagementId: args.engagementId,
      kind: args.kind,
      title: def.title,
      questions: def.questions.map((q) => ({ ...q })),
      answers: {},
      status: "assigned",
      externalUrl: link(args.externalUrl, "Assessment link"),
      assignedAt: Date.now(),
    });
    await logActivity(ctx, viewer, "assessment.assigned", `Assigned ${def.title.toLowerCase()} to ${client.preferredName}`, args.clientId, id);
    return id;
  },
});

/** For results that came in through Rich Assessments, email, or on paper. */
export const recordAnswers = mutation({
  args: {
    id: v.id("assessments"),
    answers: v.record(v.string(), v.string()),
    resultUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const a = await ctx.db.get(args.id);
    if (!a) notFound("Assessment");
    const allowed = new Set(a.questions.map((q) => q.key));
    const answers: Record<string, string> = {};
    for (const [k, val] of Object.entries(args.answers)) {
      if (!allowed.has(k)) bad("That answer does not match a question.");
      answers[k] = text(val, 4000, "Answer");
    }
    await ctx.db.patch(args.id, {
      answers,
      resultUrl: link(args.resultUrl, "Result link") ?? a.resultUrl,
      status: "completed",
      completedAt: a.completedAt ?? Date.now(),
    });
    await logActivity(ctx, viewer, "assessment.recorded", `Recorded answers for ${a.title.toLowerCase()}`, a.clientId, args.id);
  },
});

export const markReviewed = mutation({
  args: { id: v.id("assessments") },
  handler: async (ctx, args) => {
    await requireTeam(ctx);
    const a = await ctx.db.get(args.id);
    if (!a) notFound("Assessment");
    await ctx.db.patch(args.id, { reviewedAt: Date.now() });
  },
});

/**
 * Answers to the same question over time, so Tamika can tell progress
 * from a change in priorities.
 */
export const compare = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await requireTeam(ctx);
    const rows = await ctx.db
      .query("assessments")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    const done = rows.filter((r) => r.status === "completed").sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
    const byQuestion = new Map<string, { label: string; entries: { at: number; title: string; answer: string }[] }>();
    for (const r of done) {
      for (const q of r.questions) {
        const answer = r.answers[q.key];
        if (!answer) continue;
        const slot = byQuestion.get(q.key) ?? { label: q.label, entries: [] };
        slot.entries.push({ at: r.completedAt ?? r.assignedAt, title: r.title, answer });
        byQuestion.set(q.key, slot);
      }
    }
    return [...byQuestion.entries()]
      .filter(([, slot]) => slot.entries.length > 1)
      .map(([key, slot]) => ({ key, ...slot }));
  },
});
