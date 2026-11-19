import { ConvexError, v } from "convex/values";
import { action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getViewer } from "./lib/auth";
import { clerkConfigured, fetchClerkPerson } from "./lib/clerk";
import { ensureDefaults } from "./settings";

/** Who is signed in, and what they are allowed to do. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    return {
      role: viewer.role,
      permissions: viewer.permissions,
      name: viewer.role === "client" ? viewer.client!.preferredName : viewer.name,
      email: viewer.email,
      emailVerified: viewer.emailVerified,
      blocked: viewer.blocked,
      // Shown on the "not open yet" screen so a setup problem explains itself.
      diagnostics: {
        synced: viewer.user !== null,
        markedOwnerInClerk: viewer.user?.isOwner ?? false,
        lastChecked: viewer.user?.syncedAt ?? null,
      },
    };
  },
});

/**
 * Called after sign-in. Asks Clerk (server to server) who this user is and
 * stores the answer. The browser cannot influence the result: the only input
 * is the Clerk user id inside the verified sign-in token.
 */
export const sync = action({
  args: {},
  handler: async (ctx): Promise<{ ok: boolean; problem: string | null }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in first." });
    if (!clerkConfigured()) {
      return { ok: false, problem: "CLERK_SECRET_KEY is not set on the Convex deployment, so the app cannot confirm who you are." };
    }
    let person;
    try {
      person = await fetchClerkPerson(identity.subject);
    } catch (e) {
      console.error(e);
      return { ok: false, problem: "Clerk did not answer. Try again in a moment." };
    }
    if (!person) return { ok: false, problem: "Clerk does not recognize this sign-in." };
    await ctx.runMutation(internal.users.applySync, {
      tokenIdentifier: identity.tokenIdentifier,
      ...person,
    });
    return { ok: true, problem: null };
  },
});

/** Internal only. Stores Clerk's answer and links the user to her record. */
export const applySync = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    clerkUserId: v.string(),
    email: v.string(),
    emailVerified: v.boolean(),
    name: v.string(),
    isOwner: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .unique();
    const fields = {
      clerkUserId: args.clerkUserId,
      email: args.email,
      emailVerified: args.emailVerified,
      name: args.name,
      isOwner: args.isOwner,
      syncedAt: now,
    };
    if (!user) {
      const id = await ctx.db.insert("users", { tokenIdentifier: args.tokenIdentifier, ...fields });
      user = (await ctx.db.get(id))!;
    } else {
      await ctx.db.patch(user._id, fields);
    }

    if (args.isOwner) {
      await ensureDefaults(ctx);
      return;
    }
    if (!args.emailVerified || !args.email) return;

    // Team member: first sign-in claims the seat that was set up for this email.
    const member = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (member) {
      if (member.userId === undefined && (member.status === "invited" || member.status === "active")) {
        await ctx.db.patch(member._id, { userId: user._id, status: "active" });
        await ctx.db.insert("activity", {
          at: now,
          actor: member.name,
          actorRole: member.role,
          action: "access.first_sign_in",
          summary: `${member.name} signed in for the first time as ${member.role}`,
        });
      }
      return;
    }

    // Client: links only to a record with this exact verified email that has
    // been given access and is not already linked to a different sign-in.
    const matches = await ctx.db
      .query("clients")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .collect();
    const client = matches.find(
      (c) =>
        !c.archived &&
        (c.access === "invited" || c.access === "active") &&
        (c.userId === undefined || c.userId === user!._id),
    );
    if (client && (client.userId === undefined || client.access === "invited")) {
      await ctx.db.patch(client._id, { userId: user._id, access: "active", accessChangedAt: now });
      await ctx.db.patch(user._id, { clientId: client._id });
      await ctx.db.insert("activity", {
        at: now,
        actor: client.preferredName,
        actorRole: "client",
        action: "portal.linked",
        summary: `${client.preferredName} signed in to her portal for the first time`,
        clientId: client._id,
      });
    }
  },
});
