import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requirePermission } from "./lib/auth";
import { computeBalance } from "./lib/balance";
import { readSettings } from "./settings";

/**
 * Session preparation.
 *
 * `prep` builds a brief from the record itself with no AI and no cost. Every
 * line names its source. `aiContext` gathers the same permitted material for
 * the optional AI draft, with identifying details removed first.
 *
 * Co-working is never a source. Private one-on-one transcripts are used only
 * when the client has granted BOTH transcription and AI permission.
 */

type Line = { text: string; source: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Short date label. Shifted five hours so evening Eastern times keep their date.
const day = (ms: number) => {
  const d = new Date(ms - 5 * 3600_000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

function whenLabel(ms: number, timeZone: string): string {
  try {
    return `${new Date(ms).toLocaleString("en-US", { timeZone, dateStyle: "full", timeStyle: "short" })} (${timeZone})`;
  } catch {
    return new Date(ms).toISOString();
  }
}

const clip = (s: string, n = 260) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

async function gather(ctx: QueryCtx, sessionId: Id<"sessions">, todayStr: string) {
  const session = await ctx.db.get(sessionId);
  if (!session) throw new ConvexError({ code: "NOT_FOUND", message: "Session was not found." });
  const client = (await ctx.db.get(session.clientId))!;
  const engagement = (await ctx.db.get(session.engagementId))!;
  const sessions = await ctx.db
    .query("sessions")
    .withIndex("by_client", (q) => q.eq("clientId", client._id))
    .collect();
  const previous = sessions
    .filter((s) => s.scheduledAt < session.scheduledAt && s.status === "completed")
    .sort((a, b) => b.scheduledAt - a.scheduledAt)[0] as Doc<"sessions"> | undefined;
  const since = previous?.scheduledAt ?? 0;
  const actions = await ctx.db
    .query("actions")
    .withIndex("by_client", (q) => q.eq("clientId", client._id))
    .collect();
  const assessments = (
    await ctx.db
      .query("assessments")
      .withIndex("by_client", (q) => q.eq("clientId", client._id))
      .collect()
  ).filter((a) => a.status === "completed");
  const worksheets = await ctx.db
    .query("worksheetAssignments")
    .withIndex("by_client", (q) => q.eq("clientId", client._id))
    .collect();
  const thread = await ctx.db
    .query("threads")
    .withIndex("by_client", (q) => q.eq("clientId", client._id))
    .first();
  const messages = thread
    ? await ctx.db
        .query("messages")
        .withIndex("by_thread", (q) => q.eq("threadId", thread._id).gt("createdAt", since))
        .collect()
    : [];
  const previousNotes = previous
    ? await ctx.db
        .query("sessionNotes")
        .withIndex("by_session", (q) => q.eq("sessionId", previous._id))
        .unique()
    : null;

  const changed: Line[] = [];
  const obstacles: Line[] = [];
  const plan: Line[] = [];

  if (previous?.recapShared) {
    plan.push({ text: clip(previous.recapShared, 600), source: `Approved recap, session ${previous.number} (${day(previous.scheduledAt)})` });
  } else if (previous?.priority) {
    plan.push({ text: `Priority agreed: ${previous.priority}`, source: `Session ${previous.number} (${day(previous.scheduledAt)})` });
  }

  const clientActions = actions.filter((a) => a.owner === "client");
  const open = clientActions.filter((a) => a.status === "open" || a.status === "in_progress");
  const doneSince = clientActions.filter((a) => a.status === "completed" && (a.completedAt ?? 0) > since);
  for (const a of doneSince) {
    changed.push({
      text: `Completed: ${a.title}${a.clientNote ? `. She noted: ${clip(a.clientNote, 160)}` : ""}`,
      source: `Commitment marked done ${day(a.completedAt!)}`,
    });
  }
  for (const a of open) {
    if (a.clientNote) {
      changed.push({ text: `On "${a.title}": ${clip(a.clientNote, 200)}`, source: "Client update on her commitment" });
    }
    if (a.obstacle) obstacles.push({ text: `${a.obstacle} (on "${a.title}")`, source: "Commitment record" });
  }

  const intake = assessments.find((a) => a.kind === "intake");
  const recent = assessments
    .filter((a) => a.kind !== "intake" && (a.completedAt ?? 0) > since)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  for (const a of recent) {
    const src = `${a.title}, ${day(a.completedAt!)}`;
    for (const q of a.questions) {
      const ans = a.answers[q.key];
      if (!ans) continue;
      if (q.key === "obstacle") obstacles.push({ text: clip(ans), source: src });
      else changed.push({ text: `${q.label} ${clip(ans)}`, source: src });
    }
  }
  if (!previous && intake) {
    const src = `Intake, ${day(intake.completedAt!)}`;
    if (intake.answers.outcome) changed.push({ text: `What would make this worthwhile: ${clip(intake.answers.outcome)}`, source: src });
    if (intake.answers.tried) changed.push({ text: `Already tried: ${clip(intake.answers.tried)}`, source: src });
    if (intake.answers.hours) changed.push({ text: `Can protect about ${intake.answers.hours} hours a week`, source: src });
    if (intake.answers.obstacle) obstacles.push({ text: clip(intake.answers.obstacle), source: src });
  }
  for (const m of messages.filter((m) => m.from === "client")) {
    changed.push({ text: clip(m.body, 240), source: `Message from her, ${day(m.createdAt)}` });
  }
  for (const w of worksheets.filter((w) => (w.submittedAt ?? 0) > since && (w.status === "submitted" || w.status === "reviewed"))) {
    changed.push({ text: `Submitted the worksheet "${w.title}"`, source: `Workbook, ${day(w.submittedAt!)}` });
  }
  if (previousNotes?.obstacle) {
    obstacles.push({ text: clip(previousNotes.obstacle), source: `Your private notes, session ${previous!.number}` });
  }

  const commitments = open
    .map((a) => ({
      _id: a._id,
      title: a.title,
      dueDate: a.dueDate,
      status: a.status,
      overdue: !!a.dueDate && a.dueDate < todayStr,
      doneLooksLike: a.doneLooksLike,
      source: a.sessionId ? "Agreed in session" : "Added to her plan",
    }))
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));

  return {
    session,
    client,
    engagement,
    sessions,
    previous,
    intake,
    worksheets,
    plan,
    changed,
    obstacles,
    commitments,
    doneSince,
    hasRecentCheckin: recent.some((a) => a.kind === "checkin"),
  };
}

function suggestQuestions(g: Awaited<ReturnType<typeof gather>>): string[] {
  const out: string[] = [];
  const overdue = g.commitments.find((c) => c.overdue);
  const stuck = g.obstacles[0];
  if (!g.previous) {
    out.push("What would have to be true six weeks from now for this to have been worth your time?");
    if (stuck) out.push(`You named this as your biggest obstacle: "${clip(stuck.text, 120)}" What does it look like on a normal week?`);
    out.push("What have you already tried, and what part of it helped even a little?");
  } else {
    if (g.doneSince[0] && g.commitments.length > 0) {
      out.push(`You finished "${clip(g.doneSince[0].title, 90)}". What happened when you did it, and what did you learn?`);
    } else if (g.doneSince[0]) {
      out.push(`You finished "${clip(g.doneSince[0].title, 90)}". What made that one doable?`);
    }
    if (overdue) {
      out.push(`What happened with "${clip(overdue.title, 90)}"? Was it unclear, too large, waiting on someone else, or no longer useful?`);
    }
    if (stuck) out.push(`You said: "${clip(stuck.text, 120)}" Where exactly did it get difficult?`);
    if (out.length < 3) out.push("Is the goal we set still the right goal?");
  }
  if (out.length < 3) out.push("What are you choosing to do next, when will you do it, and what could get in the way?");
  return out.slice(0, 3);
}

const BY_SESSION: Record<string, string[]> = {
  structure: ["starting_point", "thirty_day", "repeatable", "progress_review"],
  next_step: ["action_plan"],
  keep_moving: ["session_prep", "progress_review"],
};

function suggestWorksheet(g: Awaited<ReturnType<typeof gather>>) {
  const assigned = new Set(g.worksheets.map((w) => w.templateKey));
  const plan = BY_SESSION[g.engagement.serviceKey] ?? [];
  const pick = plan[Math.min(g.session.number - 1, plan.length - 1)];
  const reasons: Record<string, string> = {
    starting_point: "First meeting: clarify the starting point and the change she wants.",
    one_page: "Gets her to a clear, plain business description.",
    thirty_day: "Second meeting: choose priorities and a realistic 30-day plan.",
    action_plan: "Turns today's decision into actions with dates.",
    repeatable: "Third meeting: make one task repeatable.",
    progress_review: "Compare the starting point with where she is now.",
    session_prep: "A short page she can fill in before each meeting.",
    keep_change: "Useful before adding more work.",
  };
  const candidates = [pick, "keep_change", "one_page", "action_plan"].filter(Boolean) as string[];
  const key = candidates.find((k) => !assigned.has(k));
  if (!key) return null;
  return { key, reason: reasons[key] ?? "Fits where she is now." };
}

export const prep = query({
  args: { sessionId: v.id("sessions"), today: v.string() },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "coaching");
    const g = await gather(ctx, args.sessionId, args.today);
    const settings = await readSettings(ctx);
    const balance = computeBalance(g.engagement, g.sessions.filter((s) => s.engagementId === g.engagement._id));
    const missing: string[] = [];
    if (g.previous && !g.hasRecentCheckin && g.changed.length === 0) missing.push("No check-in, message, or update since the last meeting.");
    if (!g.engagement.goal) missing.push("No coaching goal recorded yet.");
    if (!g.engagement.measureName) missing.push("No observable progress measure set.");
    if (g.engagement.aiPermission === "not_asked") missing.push("AI and recording permissions have not been asked.");
    if (!g.previous && !g.intake) missing.push("Intake has not been completed.");

    const sheet = suggestWorksheet(g);
    let sheetTitle: string | null = null;
    if (sheet) {
      const t = await ctx.db
        .query("worksheetTemplates")
        .withIndex("by_key", (q) => q.eq("key", sheet.key))
        .unique();
      sheetTitle = t?.title ?? null;
    }

    let aiReason: string | null = null;
    if (!settings.aiEnabled) aiReason = "AI drafting is turned off in Settings.";
    else if (!process.env.ANTHROPIC_API_KEY) aiReason = "AI drafting needs an API key added to Convex.";
    else if (g.engagement.aiPermission !== "granted") aiReason = "This client has not agreed to AI-assisted processing.";

    const aiBrief = await ctx.db
      .query("aiBriefs")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .collect();

    return {
      goal: g.engagement.goal ?? null,
      measure: g.engagement.measureName
        ? { name: g.engagement.measureName, start: g.engagement.measureStart, target: g.engagement.measureTarget, actual: g.engagement.measureActual }
        : null,
      balance,
      lastPlan: g.plan,
      changed: g.changed,
      commitments: g.commitments,
      obstacles: g.obstacles,
      questions: suggestQuestions(g),
      worksheet: sheet && sheetTitle ? { ...sheet, title: sheetTitle } : null,
      missing,
      ai: { available: aiReason === null, reason: aiReason },
      aiPrep: aiBrief.find((b) => b.kind === "prep") ?? null,
      aiRecap: aiBrief.find((b) => b.kind === "recap") ?? null,
    };
  },
});

/** Remove names and contact details before anything is sent to the AI. */
function deidentify(input: string, client: Doc<"clients">): string {
  let out = input;
  const swaps: [string | undefined, string][] = [
    [client.email, "[email]"],
    [client.phone, "[phone]"],
    [client.businessName, "[Business]"],
    [client.fullName, "[Client]"],
    [client.preferredName, "[Client]"],
    ...client.fullName
      .split(/\s+/)
      .filter((p) => p.length > 2)
      .map((p) => [p, "[Client]"] as [string, string]),
  ];
  for (const [needle, replacement] of swaps) {
    if (!needle || needle.length < 3) continue;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "gi"), replacement);
  }
  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]");
  out = out.replace(/\+?\d[\d\s().-]{8,}\d/g, "[phone]");
  return out;
}

export const aiContext = internalQuery({
  args: { sessionId: v.id("sessions"), kind: v.union(v.literal("prep"), v.literal("recap")), today: v.string() },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "coaching");
    const settings = await readSettings(ctx);
    if (!settings.aiEnabled) throw new ConvexError({ code: "AI_OFF", message: "AI drafting is turned off in Settings." });
    const g = await gather(ctx, args.sessionId, args.today);
    if (g.engagement.aiPermission !== "granted") {
      throw new ConvexError({ code: "NO_PERMISSION", message: "This client has not agreed to AI-assisted processing." });
    }
    const sources: string[] = [];
    const parts: string[] = [];
    const add = (title: string, lines: Line[]) => {
      if (lines.length === 0) return;
      parts.push(`## ${title}\n` + lines.map((l) => `- ${l.text} (source: ${l.source})`).join("\n"));
      for (const l of lines) if (!sources.includes(l.source)) sources.push(l.source);
    };
    parts.push(
      `## Engagement\nService: ${g.engagement.serviceName}. Session ${g.session.number} of ${g.engagement.sessionsIncluded}. Stage: ${g.client.stage ?? "not recorded"}.\nGoal: ${g.engagement.goal ?? "not recorded"}\nProgress measure: ${g.engagement.measureName ?? "not set"} (start: ${g.engagement.measureStart ?? "?"}, target: ${g.engagement.measureTarget ?? "?"}, now: ${g.engagement.measureActual ?? "?"})`,
    );
    if (args.kind === "prep") {
      add("Last approved plan", g.plan);
      add("What changed since the last meeting", g.changed);
      add(
        "Open commitments",
        g.commitments.map((c) => ({
          text: `${c.title}${c.dueDate ? `, due ${c.dueDate}` : ""}${c.overdue ? " (overdue)" : ""}`,
          source: c.source,
        })),
      );
      add("Obstacles", g.obstacles);
    } else {
      const notes = await ctx.db
        .query("sessionNotes")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .unique();
      const noteLines: Line[] = [];
      const src = `Your notes, session ${g.session.number}`;
      if (g.session.priority) noteLines.push({ text: `Priority agreed: ${g.session.priority}`, source: src });
      if (notes?.outcomeAgreed) noteLines.push({ text: `Outcome agreed for the meeting: ${notes.outcomeAgreed}`, source: src });
      if (notes?.questionsAndDecisions) noteLines.push({ text: `Questions explored and decisions: ${notes.questionsAndDecisions}`, source: src });
      if (notes?.coachFollowUp) noteLines.push({ text: `Coach follow-up: ${notes.coachFollowUp}`, source: src });
      add("Session notes", noteLines);
      const acts = await ctx.db
        .query("actions")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .collect();
      add(
        "Actions recorded in this session",
        acts
          .filter((a) => a.status !== "dropped" && a.status !== "revised")
          .map((a) => ({
            text: `${a.owner === "client" ? "Client" : "Coach"}: ${a.title}. Due: ${a.dueDate ?? "MISSING"}. Finished looks like: ${a.doneLooksLike ?? "MISSING"}`,
            source: "Action plan",
          })),
      );
      const next = g.sessions
        .filter((s) => s.scheduledAt > g.session.scheduledAt && s.status === "scheduled")
        .sort((a, b) => a.scheduledAt - b.scheduledAt)[0];
      parts.push(
        `## Next meeting\n${next ? whenLabel(next.scheduledAt, settings.timeZone) : "MISSING: no next meeting booked"}`,
      );
    }
    // Transcript: one-on-one only, and only with both permissions.
    if (g.engagement.transcriptionPermission === "granted") {
      const transcript = await ctx.db
        .query("transcripts")
        .withIndex("by_session", (q) =>
          q.eq("sessionId", args.kind === "recap" ? args.sessionId : (g.previous?._id ?? args.sessionId)),
        )
        .unique();
      if (transcript) {
        const label = `One-on-one transcript, session ${args.kind === "recap" ? g.session.number : (g.previous?.number ?? g.session.number)}`;
        parts.push(`## Transcript (source: ${label})\n${transcript.text.slice(0, 60_000)}`);
        sources.push(label);
      }
    }
    return {
      clientId: g.client._id,
      preferredName: g.client.preferredName,
      coachName: settings.coachName,
      context: deidentify(parts.join("\n\n"), g.client),
      sources,
    };
  },
});

export const saveBrief = internalMutation({
  args: {
    clientId: v.id("clients"),
    sessionId: v.id("sessions"),
    kind: v.union(v.literal("prep"), v.literal("recap")),
    content: v.string(),
    sources: v.array(v.string()),
    missing: v.array(v.string()),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "coaching");
    await ctx.db.insert("aiBriefs", { ...args, createdAt: Date.now() });
    await ctx.db.insert("activity", {
      at: Date.now(),
      actor: viewer.name,
      actorRole: viewer.role,
      action: "ai.draft",
      summary: `Generated an AI ${args.kind === "prep" ? "preparation brief" : "recap draft"} for review`,
      clientId: args.clientId,
      entity: args.sessionId,
    });
  },
});
