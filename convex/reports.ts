import { v } from "convex/values";
import { query } from "./_generated/server";
import { requirePermission } from "./lib/auth";
import { readSettings } from "./settings";

const DAY = 86400_000;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const pct = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 100));

/** Practice reporting. Coach only: it includes revenue. */
export const overview = query({
  args: { from: v.number(), to: v.number(), today: v.string() },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "reports");
    const settings = await readSettings(ctx);
    const inRange = (t: number | undefined) => t !== undefined && t >= args.from && t <= args.to;
    const clients = await ctx.db.query("clients").collect();
    const engagements = await ctx.db.query("engagements").collect();
    const sessions = await ctx.db.query("sessions").collect();
    const actions = await ctx.db.query("actions").collect();
    const coSessions = await ctx.db.query("coworkingSessions").collect();
    const coRegs = await ctx.db.query("coworkingRegistrations").collect();
    const messages = await ctx.db.query("messages").collect();
    const feedback = await ctx.db.query("feedback").collect();
    const testimonials = await ctx.db.query("testimonials").collect();
    const name = new Map(clients.map((c) => [c._id, c.preferredName]));

    // Discovery to enrollment
    const cohort = clients.filter((c) => inRange(c.createdAt));
    const hadDiscovery = cohort.filter((c) => c.discoveryAt !== undefined);
    const recommended = cohort.filter((c) => !!c.recommendedServiceKey);
    const enrolled = cohort.filter((c) => c.enrolledAt !== undefined);
    const daysToEnroll = enrolled.map((c) => (c.enrolledAt! - c.createdAt) / DAY);
    const funnel = {
      inquiries: cohort.length,
      discovery: hadDiscovery.length,
      recommended: recommended.length,
      enrolled: enrolled.length,
      notProceeding: cohort.filter((c) => c.pipelineStage === "not_proceeding").length,
      referredOut: cohort.filter((c) => c.pipelineStage === "referred_out").length,
      followUpLater: cohort.filter((c) => c.pipelineStage === "follow_up_later").length,
      discoveryToEnrolled: pct(hadDiscovery.filter((c) => c.enrolledAt !== undefined).length, hadDiscovery.length),
      medianDaysToEnroll: median(daysToEnroll),
      bySource: Object.entries(
        cohort.reduce<Record<string, { inquiries: number; enrolled: number }>>((acc, c) => {
          const key = c.source?.trim() || "Not recorded";
          acc[key] ??= { inquiries: 0, enrolled: 0 };
          acc[key].inquiries++;
          if (c.enrolledAt) acc[key].enrolled++;
          return acc;
        }, {}),
      ).map(([source, n]) => ({ source, ...n })),
    };

    // Service uptake and revenue
    const started = engagements.filter((e) => inRange(e.createdAt) && e.status !== "cancelled");
    const byService = new Map<string, { service: string; count: number; agreedCents: number; collectedCents: number }>();
    for (const e of started) {
      const row = byService.get(e.serviceName) ?? { service: e.serviceName, count: 0, agreedCents: 0, collectedCents: 0 };
      row.count++;
      row.agreedCents += e.priceCents;
      row.collectedCents += e.amountPaidCents;
      byService.set(e.serviceName, row);
    }
    const coPaid = coRegs.filter((r) => r.paymentStatus === "paid" && r.status === "registered");
    let coworkingCollected = 0;
    for (const r of coPaid) {
      const s = coSessions.find((x) => x._id === r.sessionId);
      if (s && inRange(s.startsAt)) coworkingCollected += s.priceCents;
    }
    const months: { month: string; coachingCents: number; coworkingCents: number }[] = [];
    const end = new Date(args.to);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1));
      const key = d.toISOString().slice(0, 7);
      const coaching = engagements
        .filter((e) => e.paymentVerifiedAt && new Date(e.paymentVerifiedAt).toISOString().slice(0, 7) === key)
        .reduce((sum, e) => sum + e.amountPaidCents, 0);
      let co = 0;
      for (const r of coPaid) {
        const s = coSessions.find((x) => x._id === r.sessionId);
        if (s && new Date(s.startsAt).toISOString().slice(0, 7) === key) co += s.priceCents;
      }
      months.push({ month: key, coachingCents: coaching, coworkingCents: co });
    }
    const open = engagements.filter((e) => e.status === "active" || e.status === "onboarding" || e.status === "paused");
    const revenue = {
      agreedCents: started.reduce((s, e) => s + e.priceCents, 0),
      collectedCents: started.reduce((s, e) => s + e.amountPaidCents, 0),
      coworkingCollectedCents: coworkingCollected,
      outstandingCents: open
        .filter((e) => e.paymentStatus === "unpaid" || e.paymentStatus === "partial")
        .reduce((s, e) => s + Math.max(0, e.priceCents - e.amountPaidCents), 0),
      byService: [...byService.values()].sort((a, b) => b.count - a.count),
      months,
    };

    // Coaching capacity by week (last 8 weeks ending at "to")
    const weeks: { weekOf: string; completed: number; scheduled: number; missed: number; hours: number }[] = [];
    const toDate = new Date(args.to);
    const dow = (toDate.getUTCDay() + 6) % 7;
    const thisMonday = Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate() - dow);
    for (let i = 7; i >= -2; i--) {
      const start = thisMonday - i * 7 * DAY;
      const stop = start + 7 * DAY;
      const wk = sessions.filter((s) => s.scheduledAt >= start && s.scheduledAt < stop);
      weeks.push({
        weekOf: new Date(start).toISOString().slice(0, 10),
        completed: wk.filter((s) => s.status === "completed").length,
        scheduled: wk.filter((s) => s.status === "scheduled").length,
        missed: wk.filter((s) => s.status === "missed").length,
        hours:
          Math.round(
            (wk.filter((s) => s.status === "completed" || s.status === "scheduled").reduce((sum, s) => sum + s.durationMinutes, 0) / 60) * 10,
          ) / 10,
      });
    }

    // Session outcomes
    const ranged = sessions.filter((s) => inRange(s.scheduledAt) && s.scheduledAt <= Date.now());
    const sessionStats = {
      completed: ranged.filter((s) => s.status === "completed").length,
      missed: ranged.filter((s) => s.status === "missed").length,
      rescheduled: ranged.filter((s) => s.status === "rescheduled").length,
      cancelled: ranged.filter((s) => s.status === "cancelled").length,
      recapsShared: ranged.filter((s) => s.status === "completed" && s.recapShared).length,
      showRate: pct(
        ranged.filter((s) => s.status === "completed").length,
        ranged.filter((s) => s.status === "completed" || s.status === "missed").length,
      ),
    };

    // Commitment follow-through
    const due = actions.filter(
      (a) => a.owner === "client" && a.dueDate && inRange(new Date(a.dueDate + "T12:00:00Z").getTime()) && a.dueDate <= args.today,
    );
    const completed = due.filter((a) => a.status === "completed");
    const onTime = completed.filter((a) => new Date(a.completedAt!).toISOString().slice(0, 10) <= a.dueDate!);
    const followThrough = {
      due: due.length,
      completed: completed.length,
      onTime: onTime.length,
      revised: due.filter((a) => a.status === "revised").length,
      dropped: due.filter((a) => a.status === "dropped").length,
      stillOpen: due.filter((a) => a.status === "open" || a.status === "in_progress").length,
      completionRate: pct(completed.length, due.length),
      byClient: [...new Set(due.map((a) => a.clientId))]
        .map((id) => {
          const mine = due.filter((a) => a.clientId === id);
          return {
            clientId: id,
            name: name.get(id) ?? "Client",
            due: mine.length,
            completed: mine.filter((a) => a.status === "completed").length,
            revised: mine.filter((a) => a.status === "revised").length,
            open: mine.filter((a) => a.status === "open" || a.status === "in_progress").length,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    };

    // Observable client progress
    const progress = engagements
      .filter((e) => e.measureName && e.status !== "cancelled" && (inRange(e.createdAt) || e.status === "active"))
      .map((e) => ({
        clientId: e.clientId,
        name: name.get(e.clientId) ?? "Client",
        service: e.serviceName,
        status: e.status,
        measure: e.measureName!,
        start: e.measureStart ?? "",
        target: e.measureTarget ?? "",
        actual: e.measureActual ?? "",
      }));

    // Co-working
    const held = coSessions.filter((s) => inRange(s.startsAt) && s.status !== "draft" && s.status !== "cancelled");
    const heldIds = new Set(held.map((s) => s._id));
    const regs = coRegs.filter((r) => heldIds.has(r.sessionId) && r.status === "registered");
    const past = held.filter((s) => s.startsAt < Date.now());
    const pastIds = new Set(past.map((s) => s._id));
    const pastRegs = regs.filter((r) => pastIds.has(r.sessionId));
    const attendedByEmail = new Map<string, number>();
    for (const r of coRegs.filter((r) => r.attended)) attendedByEmail.set(r.email, (attendedByEmail.get(r.email) ?? 0) + 1);
    const attendees = [...new Set(pastRegs.filter((r) => r.attended).map((r) => r.email))];
    const clientEmails = new Set(clients.filter((c) => c.enrolledAt).map((c) => c.email));
    const coworking = {
      sessions: held.length,
      seats: held.reduce((s, x) => s + x.capacity, 0),
      registrations: regs.length,
      fillRate: pct(regs.length, held.reduce((s, x) => s + x.capacity, 0)),
      attended: pastRegs.filter((r) => r.attended).length,
      attendanceRate: pct(pastRegs.filter((r) => r.attended).length, pastRegs.length),
      uniqueAttendees: attendees.length,
      repeatAttendees: attendees.filter((e) => (attendedByEmail.get(e) ?? 0) > 1).length,
      interestedInCoaching: new Set(regs.filter((r) => r.interestedInCoaching).map((r) => r.email)).size,
      becameClients: attendees.filter((e) => clientEmails.has(e)).length,
      waitlist: coRegs.filter((r) => heldIds.has(r.sessionId) && r.status === "waitlist").length,
    };

    // Retention
    const finished = engagements.filter((e) => e.status === "completed" && e.completedOn && inRange(new Date(e.completedOn + "T12:00:00Z").getTime()));
    const perClient = new Map<string, number>();
    for (const e of engagements.filter((e) => e.status !== "cancelled")) perClient.set(e.clientId, (perClient.get(e.clientId) ?? 0) + 1);
    const retention = {
      completed: finished.length,
      renewing: finished.filter((e) => e.renewalDecision === "renewing").length,
      notRenewing: finished.filter((e) => e.renewalDecision === "not_renewing").length,
      undecided: finished.filter((e) => !e.renewalDecision || e.renewalDecision === "undecided").length,
      repeatClients: [...perClient.values()].filter((n) => n > 1).length,
      totalClients: perClient.size,
    };

    // Response time: first coach reply after each client message
    const byThread = new Map<string, typeof messages>();
    for (const m of messages) {
      const list = byThread.get(m.threadId) ?? [];
      list.push(m);
      byThread.set(m.threadId, list);
    }
    const replyHours: number[] = [];
    for (const list of byThread.values()) {
      list.sort((a, b) => a.createdAt - b.createdAt);
      let waitingSince: number | null = null;
      for (const m of list) {
        if (m.from === "client" && waitingSince === null) waitingSince = m.createdAt;
        if (m.from === "coach" && waitingSince !== null) {
          if (inRange(waitingSince)) replyHours.push((m.createdAt - waitingSince) / 3600_000);
          waitingSince = null;
        }
      }
    }
    const med = median(replyHours);

    return {
      funnel,
      revenue,
      capacity: { weeklyTarget: settings.weeklySessionCapacity, weeks },
      sessionStats,
      followThrough,
      progress,
      coworking,
      retention,
      responsiveness: {
        replies: replyHours.length,
        medianHours: med === null ? null : Math.round(med * 10) / 10,
        agreedWindow: settings.responseWindow,
      },
      voice: {
        feedbackReceived: feedback.filter((f) => inRange(f.submittedAt)).length,
        testimonialsGranted: testimonials.filter((t) => t.status === "granted").length,
        testimonialsPending: testimonials.filter((t) => t.status === "requested").length,
      },
    };
  },
});

/** Flat rows for a spreadsheet download. */
export const engagementRows = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "reports");
    const clients = await ctx.db.query("clients").collect();
    const engagements = await ctx.db.query("engagements").collect();
    const sessions = await ctx.db.query("sessions").collect();
    return engagements
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((e) => {
        const c = clients.find((x) => x._id === e.clientId);
        const mine = sessions.filter((s) => s.engagementId === e._id);
        const used = mine.filter((s) => s.status === "completed" || (s.status === "missed" && s.countsAgainstBalance)).length;
        return {
          Client: c?.fullName ?? "",
          Email: c?.email ?? "",
          Stage: c?.stage ?? "",
          Service: e.serviceName,
          Cycle: e.cycle,
          Status: e.status,
          "Start date": e.startDate,
          "End date": e.endDate ?? "",
          "Sessions included": e.sessionsIncluded,
          "Sessions used": used,
          "Sessions remaining": Math.max(0, e.sessionsIncluded - used),
          Price: (e.priceCents / 100).toFixed(2),
          "Amount paid": (e.amountPaidCents / 100).toFixed(2),
          "Payment status": e.paymentStatus,
          Goal: e.goal ?? "",
          Measure: e.measureName ?? "",
          "Starting point": e.measureStart ?? "",
          Target: e.measureTarget ?? "",
          "Actual result": e.measureActual ?? "",
          "Renewal decision": e.renewalDecision ?? "",
          "Next follow-up": c?.followUpAction ?? "",
          "Follow-up date": c?.followUpDate ?? "",
        };
      });
  },
});
