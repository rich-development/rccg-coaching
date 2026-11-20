import { internalMutation } from "./_generated/server";
import { computeBalance } from "./lib/balance";
import { assignAssessmentOnce, DEFAULT_CHECKIN_DAYS, serviceFor } from "./lib/automation";

const DAY = 86400_000;

/**
 * Runs once a day (see crons.ts). For each active engagement it sends the
 * forms Tamika would otherwise assign by hand:
 *   - a check-in on the package's rhythm, if the last one was answered
 *   - a midpoint review halfway through a multi-week package
 *   - a completion review and feedback form when the sessions are used up
 * Nothing is emailed. The forms simply appear in the client's portal.
 */
export const daily = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    const active = await ctx.db
      .query("engagements")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    let sent = 0;
    for (const e of active) {
      if (e.automationOff) continue;
      const client = await ctx.db.get(e.clientId);
      if (!client || client.archived) continue;
      const service = await serviceFor(ctx, e.serviceKey);
      const every = service?.checkinEveryDays ?? DEFAULT_CHECKIN_DAYS[e.serviceKey] ?? 0;
      const mine = (
        await ctx.db
          .query("assessments")
          .withIndex("by_client", (q) => q.eq("clientId", e.clientId))
          .collect()
      ).filter((a) => a.engagementId === e._id);
      const sessions = await ctx.db
        .query("sessions")
        .withIndex("by_engagement", (q) => q.eq("engagementId", e._id))
        .collect();
      const balance = computeBalance(e, sessions);
      const startMs = new Date(e.startDate + "T12:00:00Z").getTime();
      const finished = balance.remaining === 0 || (e.endDate !== undefined && e.endDate <= today);

      if (finished) {
        if (!mine.some((a) => a.kind === "completion")) {
          await assignAssessmentOnce(ctx, e, "completion");
          sent++;
        }
        if (!mine.some((a) => a.kind === "feedback")) {
          await assignAssessmentOnce(ctx, e, "feedback");
          sent++;
        }
        continue;
      }

      if (every > 0 && now - startMs >= (every - 2) * DAY) {
        const checkins = mine.filter((a) => a.kind === "checkin");
        const waiting = checkins.some((a) => a.status === "assigned");
        const last = Math.max(0, ...checkins.map((a) => a.assignedAt));
        if (!waiting && now - last >= every * DAY - 6 * 3600_000) {
          await assignAssessmentOnce(ctx, e, "checkin");
          sent++;
        }
      }

      if (e.endDate && !mine.some((a) => a.kind === "midpoint")) {
        const endMs = new Date(e.endDate + "T12:00:00Z").getTime();
        const weeks = (endMs - startMs) / (7 * DAY);
        if (weeks >= 4 && now >= startMs + (endMs - startMs) / 2) {
          await assignAssessmentOnce(ctx, e, "midpoint");
          sent++;
        }
      }
    }
    return sent;
  },
});
