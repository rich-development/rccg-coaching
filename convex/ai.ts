import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Optional AI drafting. Costs money per use, so it only runs when ALL of
 * these are true:
 *   - Tamika clicks the button (never automatic)
 *   - ANTHROPIC_API_KEY is set in Convex
 *   - AI drafting is turned on in Settings
 *   - the client granted AI permission on this engagement
 * Names and contact details are removed before anything is sent, and every
 * draft is saved for Tamika's review. Nothing is shared with a client here.
 */

const PREP_SYSTEM = `You help a business coach prepare for a one-on-one session. The coach works with women who are starting a business, starting over, or pivoting. The client is called [Client].

Use ONLY the material provided. Do not diagnose the client or assume motives. Do not invent commitments, outcomes, or facts. The coach lets the client do the thinking, so suggest open questions, never answers.

Write a short brief with exactly these sections:
WHAT CHANGED: 2 to 4 bullets. End each bullet with its source in parentheses.
OPEN COMMITMENTS: bullets with due dates. Say if overdue.
OBSTACLES: bullets with sources.
THREE QUESTIONS: three open coaching questions grounded in the material.
SUGGESTED EXERCISE: one workbook exercise and one sentence on why.
MISSING: anything important that is not in the material. Write "Nothing" if complete.

Plain language. No em dashes.`;

const RECAP_SYSTEM = `You draft a session recap for a business coach to review and edit before she shares it with her client. The client is called [Client]. Write in the coach's voice: warm, concise, plain language, second person ("you decided"). No em dashes.

Use ONLY the material provided. Do not invent commitments, decisions, dates, or outcomes. If a detail is marked MISSING or is not in the material, leave it out of the recap and list it under MISSING instead of guessing.

Reply in exactly this format:
RECAP:
<the recap message: the priority, what the client decided, her next actions with due dates and what finished looks like, the coach's follow-up, and the next meeting. Close by inviting her to say if a decision or commitment was misunderstood. Sign off with the coach's first name.>
MISSING:
<one bullet per missing detail, or "Nothing">`;

export const draft = action({
  args: {
    sessionId: v.id("sessions"),
    kind: v.union(v.literal("prep"), v.literal("recap")),
    today: v.string(),
  },
  handler: async (ctx, args): Promise<null> => {
    await ctx.runQuery(internal.access.assertCan, { permission: "coaching" });
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new ConvexError({ code: "NO_KEY", message: "AI drafting needs an API key added to Convex." });
    }
    const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
    const c: {
      clientId: import("./_generated/dataModel").Id<"clients">;
      preferredName: string;
      coachName: string;
      context: string;
      sources: string[];
    } = await ctx.runQuery(internal.briefs.aiContext, args);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        system: args.kind === "prep" ? PREP_SYSTEM : RECAP_SYSTEM,
        messages: [
          {
            role: "user",
            content: `The coach's first name is ${c.coachName.split(" ")[0]}.\n\nMaterial:\n\n${c.context}`,
          },
        ],
      }),
    });
    if (!response.ok) {
      // Do not pass provider error bodies to the browser.
      console.error("AI request failed", response.status, await response.text());
      throw new ConvexError({ code: "AI_FAILED", message: `The AI service did not respond (status ${response.status}). Nothing was changed.` });
    }
    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const raw = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
    if (!raw) throw new ConvexError({ code: "AI_EMPTY", message: "The AI service returned nothing. Try again." });

    // Put her name back after the response returns.
    const named = raw.replace(/\[Client\]/g, c.preferredName).replace(/—/g, ", ");
    let content = named;
    let missing: string[] = [];
    const split = named.split(/\n\s*MISSING:\s*\n?/i);
    if (split.length > 1) {
      content = args.kind === "recap" ? split[0].replace(/^\s*RECAP:\s*\n?/i, "").trim() : named;
      missing = split[1]
        .split("\n")
        .map((l) => l.replace(/^[-*•]\s*/, "").trim())
        .filter((l) => l && !/^nothing\.?$/i.test(l));
    }
    await ctx.runMutation(internal.briefs.saveBrief, {
      clientId: c.clientId,
      sessionId: args.sessionId,
      kind: args.kind,
      content,
      sources: c.sources,
      missing,
      model,
    });
    return null;
  },
});
