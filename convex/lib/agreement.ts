import type { Doc } from "../_generated/dataModel";

const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/**
 * The plain-language agreement a client accepts in her portal. It is built
 * from the terms saved on her engagement plus Tamika's own policies from
 * Settings. The exact text is stored at the moment she accepts.
 */
export function buildAgreement(e: Doc<"engagements">, coachName: string, policies: string | undefined): string {
  const lines = [
    `Coaching agreement with ${coachName}`,
    "",
    `Service: ${e.serviceName}`,
    `Price: ${dollars(e.priceCents)}`,
    `Sessions: ${e.sessionsIncluded} session${e.sessionsIncluded === 1 ? "" : "s"}, ${e.sessionMinutes} minutes each`,
    `Dates: starts ${e.startDate}${e.endDate ? `, runs through ${e.endDate}` : ""}`,
    `Between sessions: ${e.supportTerms}`,
    `How to reach ${coachName.split(" ")[0]}: ${e.supportChannel}. Replies ${e.responseWindow.toLowerCase()}.`,
    `Payment: ${e.paymentArrangement}`,
  ];
  if (e.scopeNote) lines.push(`Scope note: ${e.scopeNote}`);
  lines.push(
    "",
    "What coaching includes: questions, planning, accountability, and guided use of worksheets. You make the decisions and do the work in your business.",
    "What it does not include: hands-on setup, document production, website work, or ongoing administration. Those need a separate scope and price.",
    "Coaching does not promise revenue, funding, or a finished business launch.",
  );
  if (policies && policies.trim()) lines.push("", "Policies", policies.trim());
  return lines.join("\n");
}
