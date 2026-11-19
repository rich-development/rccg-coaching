import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { bad, logActivity, notFound, requirePermission, text } from "./lib/auth";

const PLACEMENTS = ["Website", "Social media", "Printed materials", "Other materials"];

/**
 * Testimonial permission is separate from feedback. The client sees the exact
 * quote, the attribution, and where it may appear, then says yes or no.
 */
export const draftTestimonial = mutation({
  args: {
    clientId: v.id("clients"),
    quote: v.string(),
    attribution: v.string(),
    placements: v.array(v.string()),
    request: v.boolean(),
  },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "coaching");
    const client = await ctx.db.get(args.clientId);
    if (!client) notFound("Client");
    const quote = text(args.quote, 1500, "Quote");
    const attribution = text(args.attribution, 200, "Attribution");
    if (!quote || !attribution) bad("Enter the exact quote and how it would be attributed.");
    const placements = args.placements.filter((p) => PLACEMENTS.includes(p));
    if (placements.length === 0) bad("Choose where the quote may be used.");
    const id = await ctx.db.insert("testimonials", {
      clientId: args.clientId,
      quote,
      attribution,
      placements,
      status: args.request ? "requested" : "draft",
      requestedAt: args.request ? Date.now() : undefined,
      createdAt: Date.now(),
    });
    await logActivity(ctx, viewer, "testimonial.requested", `Asked ${client.preferredName} for permission to use a quote`, args.clientId, id);
    return id;
  },
});

/** For permission given outside the portal, for example by email. */
export const recordTestimonialAnswer = mutation({
  args: { id: v.id("testimonials"), granted: v.boolean() },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "coaching");
    const t = await ctx.db.get(args.id);
    if (!t) notFound("Testimonial");
    await ctx.db.patch(args.id, { status: args.granted ? "granted" : "declined", respondedAt: Date.now() });
    await logActivity(ctx, viewer, "testimonial.answer", `Recorded testimonial permission: ${args.granted ? "granted" : "declined"}`, t.clientId, args.id);
  },
});
