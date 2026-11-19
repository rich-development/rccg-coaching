import { mutation, query } from "./_generated/server";
import { getViewer, requireSignedIn } from "./lib/auth";
import { ensureDefaults } from "./settings";

/** Who is signed in, and what they are allowed to see. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    return {
      role: viewer.role,
      name: viewer.role === "client" ? viewer.client!.preferredName : viewer.name,
      email: viewer.email,
      emailVerified: viewer.emailVerified,
      registered: viewer.user !== null,
    };
  },
});

/**
 * Called once after sign-in. Stores the user and, for a client, links her
 * sign-in to her client record. Linking only happens when:
 *   - her email is verified by the sign-in provider,
 *   - Tamika has turned on portal access for a client with that exact email,
 *   - and that client record is not already linked to a different sign-in.
 */
export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireSignedIn(ctx);
    const now = Date.now();
    let user = viewer.user;
    if (!user) {
      const id = await ctx.db.insert("users", {
        tokenIdentifier: viewer.tokenIdentifier,
        email: viewer.email ?? "",
        emailVerified: viewer.emailVerified,
        name: viewer.name,
        lastSeenAt: now,
      });
      user = (await ctx.db.get(id))!;
    } else if (
      user.email !== (viewer.email ?? "") ||
      user.emailVerified !== viewer.emailVerified ||
      now - user.lastSeenAt > 60 * 60 * 1000
    ) {
      await ctx.db.patch(user._id, {
        email: viewer.email ?? "",
        emailVerified: viewer.emailVerified,
        name: viewer.name,
        lastSeenAt: now,
      });
    }

    if (viewer.role === "coach") {
      await ensureDefaults(ctx);
      return { role: "coach" as const };
    }
    if (viewer.role === "staff" || viewer.role === "client") {
      return { role: viewer.role };
    }

    if (viewer.email && viewer.emailVerified) {
      const matches = await ctx.db
        .query("clients")
        .withIndex("by_email", (q) => q.eq("email", viewer.email!))
        .collect();
      const client = matches.find(
        (c) =>
          c.portalEnabled &&
          !c.archived &&
          (c.userId === undefined || c.userId === user!._id),
      );
      if (client) {
        await ctx.db.patch(client._id, { userId: user._id });
        await ctx.db.patch(user._id, { clientId: client._id });
        await ctx.db.insert("activity", {
          at: now,
          actor: client.preferredName,
          actorRole: "client",
          action: "portal.linked",
          summary: `${client.preferredName} signed in to her portal for the first time`,
          clientId: client._id,
        });
        return { role: "client" as const };
      }
    }
    return { role: "none" as const };
  },
});
