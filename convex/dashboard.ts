import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireTeam } from "./lib/auth";
import { computeBalance } from "./lib/balance";

type Item = {
  kind: string;
  title: string;
  detail: string;
  href: string;
  clientName?: string;
  when?: number;
  urgent?: boolean;
};

/**
 * The morning view. Two questions:
 *   Who needs my attention?   -> people waiting on Tamika
 *   What needs to happen next? -> things to do, in order
 * Every item links to the record where she can act.
 */
export const today = query({
  args: { dayStart: v.number(), dayEnd: v.number(), today: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const now = args.dayStart;
    const weekEnd = args.dayEnd + 6 * 86400_000;
    const clients = await ctx.db.query("clients").collect();
    const name = new Map(clients.map((c) => [c._id, c.preferredName]));
    const engagements = await ctx.db.query("engagements").collect();
    const sessions = await ctx.db.query("sessions").collect();
    const threads = await ctx.db.query("threads").collect();
    const actions = await ctx.db.query("actions").collect();
    const assessments = await ctx.db.query("assessments").collect();
    const worksheets = await ctx.db.query("worksheetAssignments").collect();
    const coworking = await ctx.db.query("coworkingSessions").collect();

    const appointments = sessions
      .filter((s) => s.status === "scheduled" && s.scheduledAt >= args.dayStart && s.scheduledAt <= weekEnd)
      .sort((a, b) => a.scheduledAt - b.scheduledAt)
      .map((s) => {
        const e = engagements.find((x) => x._id === s.engagementId);
        return {
          _id: s._id,
          kind: "session" as const,
          at: s.scheduledAt,
          isToday: s.scheduledAt <= args.dayEnd,
          clientName: name.get(s.clientId) ?? "Client",
          label: `${e?.serviceName ?? "Session"}, session ${s.number} of ${e?.sessionsIncluded ?? "?"}`,
          durationMinutes: s.durationMinutes,
          meetLink: s.meetLink,
          format: s.format,
          href: `/coach/sessions/${s._id}`,
        };
      });
    const groupEvents = coworking
      .filter((s) => (s.status === "open" || s.status === "closed") && s.startsAt >= args.dayStart && s.startsAt <= weekEnd)
      .map((s) => ({
        _id: s._id,
        kind: "coworking" as const,
        at: s.startsAt,
        isToday: s.startsAt <= args.dayEnd,
        clientName: "Co-working",
        label: s.title,
        durationMinutes: s.durationMinutes,
        meetLink: s.meetLink,
        format: s.format,
        href: `/coach/coworking/${s._id}`,
      }));

    const attention: Item[] = [];
    const next: Item[] = [];

    for (const t of threads.filter((t) => t.status === "needs_reply")) {
      attention.push({
        kind: "Message",
        title: `${name.get(t.clientId) ?? "A client"} is waiting for a reply`,
        detail: t.unreadForCoach > 1 ? `${t.unreadForCoach} new messages` : "New message",
        href: `/coach/inbox?client=${t.clientId}`,
        when: t.lastMessageAt,
        urgent: Date.now() - t.lastMessageAt > 2 * 86400_000,
      });
    }
    for (const a of assessments.filter((a) => a.status === "completed" && !a.reviewedAt)) {
      attention.push({
        kind: a.kind === "intake" ? "Intake" : "Check-in",
        title: `${name.get(a.clientId) ?? "A client"} sent in her ${a.title.toLowerCase()}`,
        detail: "Ready for you to read",
        href: `/coach/clients/${a.clientId}?tab=assessments`,
        when: a.completedAt,
      });
    }
    for (const w of worksheets.filter((w) => w.status === "submitted")) {
      attention.push({
        kind: "Workbook",
        title: `${name.get(w.clientId) ?? "A client"} submitted "${w.title}"`,
        detail: "Ready for you to review",
        href: `/coach/clients/${w.clientId}?tab=workbook`,
        when: w.submittedAt,
      });
    }
    const overdueByClient = new Map<string, number>();
    for (const a of actions) {
      if (a.owner === "client" && (a.status === "open" || a.status === "in_progress") && a.dueDate && a.dueDate < args.today) {
        overdueByClient.set(a.clientId, (overdueByClient.get(a.clientId) ?? 0) + 1);
      }
    }
    for (const [clientId, count] of overdueByClient) {
      const c = clients.find((x) => x._id === clientId);
      if (!c || c.archived) continue;
      attention.push({
        kind: "Commitment",
        title: `${c.preferredName} has ${count} commitment${count > 1 ? "s" : ""} past the due date`,
        detail: "Ask what happened before carrying it forward",
        href: `/coach/clients/${c._id}?tab=actions`,
      });
    }

    for (const c of clients.filter((c) => !c.archived && c.followUpAction && c.followUpDate && c.followUpDate <= args.today)) {
      next.push({
        kind: "Follow-up",
        title: `${c.followUpAction}`,
        detail: `${c.preferredName}, due ${c.followUpDate}`,
        href: `/coach/clients/${c._id}`,
        urgent: c.followUpDate! < args.today,
      });
    }
    for (const a of actions.filter((a) => a.owner === "coach" && (a.status === "open" || a.status === "in_progress") && (!a.dueDate || a.dueDate <= args.today))) {
      next.push({
        kind: "Your task",
        title: a.title,
        detail: `${name.get(a.clientId) ?? "Client"}${a.dueDate ? `, due ${a.dueDate}` : ""}`,
        href: `/coach/clients/${a.clientId}?tab=actions`,
        urgent: !!a.dueDate && a.dueDate < args.today,
      });
    }
    for (const e of engagements.filter((e) => e.status === "onboarding")) {
      const open = e.checklist.filter((c) => !c.done);
      if (open.length === 0) continue;
      next.push({
        kind: "Onboarding",
        title: `${name.get(e.clientId) ?? "Client"}: ${open[0].label}`,
        detail: `${open.length} onboarding step${open.length > 1 ? "s" : ""} left for ${e.serviceName}`,
        href: `/coach/clients/${e.clientId}?tab=engagement`,
      });
    }
    for (const s of sessions) {
      if (s.status === "scheduled" && s.scheduledAt < now - 3600_000) {
        next.push({
          kind: "Session",
          title: `Close out session ${s.number} with ${name.get(s.clientId) ?? "client"}`,
          detail: "Mark it completed, missed, or rescheduled",
          href: `/coach/sessions/${s._id}`,
          urgent: true,
        });
      } else if (s.status === "completed" && !s.recapShared && viewer.role === "coach" && (s.completedAt ?? 0) > now - 30 * 86400_000) {
        next.push({
          kind: "Recap",
          title: `Review and share the recap for ${name.get(s.clientId) ?? "client"}`,
          detail: `Session ${s.number} is complete with no shared recap`,
          href: `/coach/sessions/${s._id}`,
        });
      }
      if (s.status === "completed" && s.transcriptStatus === "pending" && viewer.role === "coach") {
        next.push({
          kind: "Transcript",
          title: `Transcript pending for ${name.get(s.clientId) ?? "client"}, session ${s.number}`,
          detail: "Attach it or mark it unavailable",
          href: `/coach/sessions/${s._id}`,
        });
      }
    }
    for (const e of engagements.filter((e) => e.status === "active" || e.status === "onboarding")) {
      const mine = sessions.filter((s) => s.engagementId === e._id);
      const b = computeBalance(e, mine);
      if (e.paymentStatus === "unpaid" || e.paymentStatus === "partial") {
        next.push({
          kind: "Payment",
          title: `Confirm payment for ${name.get(e.clientId) ?? "client"}`,
          detail: `${e.serviceName} is marked ${e.paymentStatus}. Check Stripe, then record it.`,
          href: `/coach/clients/${e.clientId}?tab=engagement`,
        });
      }
      if (e.status === "active" && b.unscheduled > 0) {
        next.push({
          kind: "Booking",
          title: `Book ${b.unscheduled} more session${b.unscheduled > 1 ? "s" : ""} for ${name.get(e.clientId) ?? "client"}`,
          detail: `${b.remaining} of ${b.included} remaining in ${e.serviceName}`,
          href: `/coach/clients/${e.clientId}?tab=sessions`,
        });
      }
      const ending = e.endDate && e.endDate <= new Date(args.dayStart + 10 * 86400_000).toISOString().slice(0, 10);
      if (e.status === "active" && (b.remaining <= 1 || ending)) {
        next.push({
          kind: "Wrapping up",
          title: `${name.get(e.clientId) ?? "Client"} is near the end of ${e.serviceName}`,
          detail: `${b.remaining} session${b.remaining === 1 ? "" : "s"} left${e.endDate ? `, ends ${e.endDate}` : ""}. Plan the completion review.`,
          href: `/coach/clients/${e.clientId}?tab=engagement`,
        });
      }
    }

    attention.sort((a, b) => Number(b.urgent ?? false) - Number(a.urgent ?? false) || (a.when ?? 0) - (b.when ?? 0));
    next.sort((a, b) => Number(b.urgent ?? false) - Number(a.urgent ?? false));

    return {
      appointments: [...appointments, ...groupEvents].sort((a, b) => a.at - b.at),
      attention,
      next,
      counts: {
        activeClients: new Set(engagements.filter((e) => e.status === "active" || e.status === "onboarding").map((e) => e.clientId)).size,
        openInquiries: clients.filter((c) => !c.archived && ["inquiry", "discovery_booked", "discovery_done", "recommended"].includes(c.pipelineStage)).length,
      },
    };
  },
});
