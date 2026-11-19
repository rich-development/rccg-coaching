import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type Balance = {
  included: number;
  used: number;
  scheduled: number;
  remaining: number;
  unscheduled: number;
};

/** A session is "used" when it was completed, or missed and counted. */
export function computeBalance(
  engagement: Pick<Doc<"engagements">, "sessionsIncluded">,
  sessions: Pick<Doc<"sessions">, "status" | "countsAgainstBalance">[],
): Balance {
  const used = sessions.filter(
    (s) =>
      s.status === "completed" ||
      (s.status === "missed" && s.countsAgainstBalance),
  ).length;
  const scheduled = sessions.filter((s) => s.status === "scheduled").length;
  const remaining = Math.max(0, engagement.sessionsIncluded - used);
  return {
    included: engagement.sessionsIncluded,
    used,
    scheduled,
    remaining,
    unscheduled: Math.max(0, remaining - scheduled),
  };
}

export async function engagementBalance(
  ctx: QueryCtx,
  engagement: Doc<"engagements">,
): Promise<Balance> {
  const sessions = await ctx.db
    .query("sessions")
    .withIndex("by_engagement", (q) => q.eq("engagementId", engagement._id))
    .collect();
  return computeBalance(engagement, sessions);
}
