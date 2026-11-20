import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  bad,
  DEFAULT_ROLE_PERMISSIONS,
  logActivity,
  notFound,
  PERMISSIONS,
  requirePermission,
  rolePermissions,
  text,
  validEmail,
  type Viewer,
} from "./lib/auth";
import { ensureIntake, syncClientChecklists } from "./lib/automation";
import { clerkConfigured, revokeSessions, sendInvitation } from "./lib/clerk";

/**
 * The Access page: who is on the team, what each role may do, and which
 * clients can use their portal. Everything here needs the "access" permission.
 *
 * Two rules protect against someone raising their own privileges:
 *   - Nobody can change their own access.
 *   - Only an owner can add, change, or end an admin, or change what the
 *     admin role may do. Owners themselves are marked in Clerk.
 */

const memberRole = v.union(v.literal("admin"), v.literal("staff"));

function ownerOnlyForAdmins(viewer: Viewer, role: "admin" | "staff") {
  if (role === "admin" && viewer.role !== "owner") bad("Only an owner can manage admins.");
}

function notYourself(viewer: Viewer, memberId: Id<"members">) {
  if (viewer.member && viewer.member._id === memberId) bad("You cannot change your own access.");
}

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requirePermission(ctx, "access");
    const users = await ctx.db.query("users").collect();
    const members = await ctx.db.query("members").collect();
    const clients = await ctx.db.query("clients").collect();
    return {
      clerkConfigured: clerkConfigured(),
      viewerRole: viewer.role,
      viewerMemberId: viewer.member?._id ?? null,
      catalog: PERMISSIONS.map((p) => ({ ...p })),
      roles: {
        admin: await rolePermissions(ctx, "admin"),
        staff: await rolePermissions(ctx, "staff"),
      },
      owners: users.filter((u) => u.isOwner).map((u) => ({ _id: u._id, name: u.name ?? u.email, email: u.email, lastChecked: u.syncedAt })),
      members: members
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((m) => ({ ...m, signedIn: m.userId !== undefined })),
      clients: clients
        .filter((c) => !c.archived || c.access !== "none")
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
        .map((c) => ({
          _id: c._id,
          fullName: c.fullName,
          email: c.email,
          access: c.access,
          signedIn: c.userId !== undefined,
          inviteSentAt: c.inviteSentAt,
          accessChangedAt: c.accessChangedAt,
          accessNote: c.accessNote,
          pipelineStage: c.pipelineStage,
          archived: c.archived,
        })),
    };
  },
});

/* ---------- Roles and permissions ---------- */

export const setRolePermissions = mutation({
  args: { role: memberRole, permissions: v.array(v.string()) },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "access");
    ownerOnlyForAdmins(viewer, args.role);
    const known = PERMISSIONS.map((p) => p.key as string);
    const permissions = [...new Set(args.permissions)].filter((p) => known.includes(p));
    if (viewer.role !== "owner") {
      // An admin cannot hand staff a permission the admin role itself lacks.
      const extra = permissions.filter((p) => !(viewer.permissions as string[]).includes(p));
      if (extra.length > 0) bad("You cannot give a permission you do not have.");
    }
    const row = await ctx.db
      .query("rolePermissions")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .unique();
    if (row) await ctx.db.patch(row._id, { permissions });
    else await ctx.db.insert("rolePermissions", { role: args.role, permissions });
    await logActivity(ctx, viewer, "access.role_permissions", `Changed what the ${args.role} role can do: ${permissions.join(", ") || "day-to-day work only"}`);
  },
});

export const resetRolePermissions = mutation({
  args: { role: memberRole },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "access");
    if (viewer.role !== "owner") bad("Only an owner can reset a role.");
    const row = await ctx.db
      .query("rolePermissions")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .unique();
    if (row) await ctx.db.patch(row._id, { permissions: [...DEFAULT_ROLE_PERMISSIONS[args.role]] });
    await logActivity(ctx, viewer, "access.role_permissions", `Reset the ${args.role} role to its default permissions`);
  },
});

/* ---------- Team members ---------- */

export const addMember = mutation({
  args: { email: v.string(), name: v.string(), role: memberRole },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "access");
    ownerOnlyForAdmins(viewer, args.role);
    const email = validEmail(args.email);
    const name = text(args.name, 120, "Name");
    if (!name) bad("Enter a name.");
    const existing = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existing) bad(`${existing.name} is already on the team list. Change her access there.`);
    const id = await ctx.db.insert("members", { email, name, role: args.role, status: "invited", addedAt: Date.now() });
    await logActivity(ctx, viewer, "access.member_added", `Added ${name} (${email}) to the team as ${args.role}`);
    return id;
  },
});

export const setMemberRole = mutation({
  args: { id: v.id("members"), role: memberRole },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "access");
    const m = await ctx.db.get(args.id);
    if (!m) notFound("Team member");
    notYourself(viewer, args.id);
    ownerOnlyForAdmins(viewer, m.role);
    ownerOnlyForAdmins(viewer, args.role);
    await ctx.db.patch(args.id, { role: args.role });
    await logActivity(ctx, viewer, "access.member_role", `Changed ${m.name} from ${m.role} to ${args.role}`);
  },
});

/** Pause or restore a team member. Takes effect on her next request. */
export const setMemberStatus = mutation({
  args: { id: v.id("members"), status: v.union(v.literal("active"), v.literal("paused")) },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "access");
    const m = await ctx.db.get(args.id);
    if (!m) notFound("Team member");
    notYourself(viewer, args.id);
    ownerOnlyForAdmins(viewer, m.role);
    const status = args.status === "active" && m.userId === undefined ? "invited" : args.status;
    await ctx.db.patch(args.id, { status, accessNote: undefined });
    await logActivity(ctx, viewer, "access.member_status", `${args.status === "paused" ? "Paused" : "Restored"} team access for ${m.name}`);
  },
});

/* ---------- Clients ---------- */

/**
 * Pause, restore, or quietly grant a client's portal access. Pausing blocks
 * her on her very next request and keeps her record and history intact.
 */
export const setClientAccess = mutation({
  args: { id: v.id("clients"), access: v.union(v.literal("active"), v.literal("paused")) },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "access");
    const c = await ctx.db.get(args.id);
    if (!c) notFound("Client");
    if (c.archived) bad("Restore her record before changing portal access.");
    if (args.access === "paused" && c.access !== "active" && c.access !== "invited") bad("She does not have access to pause.");
    // Restoring someone who never signed in puts her back to "invited".
    const access = args.access === "active" && c.userId === undefined ? "invited" : args.access;
    await ctx.db.patch(args.id, { access, accessChangedAt: Date.now(), accessNote: undefined });
    if (args.access === "active") {
      await ensureIntake(ctx, args.id);
      await syncClientChecklists(ctx, args.id);
    }
    await logActivity(
      ctx,
      viewer,
      "access.client",
      args.access === "paused" ? `Paused portal access for ${c.preferredName}` : `Turned on portal access for ${c.preferredName}`,
      args.id,
    );
  },
});

/** Unlinks her current sign-in so she can link again with her email. */
export const resetClientLink = mutation({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "access");
    const c = await ctx.db.get(args.id);
    if (!c) notFound("Client");
    if (c.userId) {
      const user = await ctx.db.get(c.userId);
      if (user && user.clientId === args.id) await ctx.db.patch(user._id, { clientId: undefined });
    }
    await ctx.db.patch(args.id, { userId: undefined, access: c.access === "active" ? "invited" : c.access });
    await logActivity(ctx, viewer, "access.client_reset", `Reset the portal sign-in link for ${c.preferredName}`, args.id);
  },
});

/* ---------- Actions that also talk to Clerk ---------- */

type Outcome = { note: string };

function cleanOrigin(origin: string | undefined): string | undefined {
  const site = process.env.SITE_URL ?? origin;
  if (!site || !/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(site)) return undefined;
  return `${site}/sign-up`;
}

/** Gives access and, on this click only, sends the Clerk invitation email. */
export const invite = action({
  args: { kind: v.union(v.literal("client"), v.literal("member")), id: v.string(), origin: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Outcome> => {
    const target: { email: string; alreadySignedIn: boolean } = await ctx.runMutation(internal.access.markInvited, { kind: args.kind, id: args.id });
    let note: string;
    if (target.alreadySignedIn) {
      note = "Access is on. She already has a sign-in, so no invitation email was needed.";
    } else if (!clerkConfigured()) {
      note = `Access is on, but no invitation email was sent because CLERK_SECRET_KEY is not set in Convex. She can still sign in with ${target.email}.`;
    } else {
      note = (await sendInvitation(target.email, cleanOrigin(args.origin))).note;
    }
    await ctx.runMutation(internal.access.saveNote, { kind: args.kind, id: args.id, note });
    return { note };
  },
});

/** Ends access: blocks her data right away and signs her out everywhere. */
export const end = action({
  args: { kind: v.union(v.literal("client"), v.literal("member")), id: v.string() },
  handler: async (ctx, args): Promise<Outcome> => {
    const target: { clerkUserId: string | null } = await ctx.runMutation(internal.access.markEnded, { kind: args.kind, id: args.id });
    let note = "Access ended. Her record is kept.";
    if (target.clerkUserId && clerkConfigured()) {
      const closed = await revokeSessions(target.clerkUserId);
      note = `Access ended and ${closed} active sign-in${closed === 1 ? "" : "s"} closed. Her record is kept.`;
    } else if (target.clerkUserId) {
      note = "Access ended in the app. Her open sign-ins were not closed because CLERK_SECRET_KEY is not set, but she can no longer see anything.";
    }
    await ctx.runMutation(internal.access.saveNote, { kind: args.kind, id: args.id, note });
    return { note };
  },
});

export const markInvited = internalMutation({
  args: { kind: v.union(v.literal("client"), v.literal("member")), id: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "access");
    const now = Date.now();
    if (args.kind === "client") {
      const id = ctx.db.normalizeId("clients", args.id);
      const c = id ? await ctx.db.get(id) : null;
      if (!c) notFound("Client");
      if (c.archived) bad("Restore her record before inviting her.");
      const linked = c.userId !== undefined;
      await ctx.db.patch(c._id, { access: linked ? "active" : "invited", accessChangedAt: now, inviteSentAt: now });
      // Intake is the first thing she sees when she signs in.
      await ensureIntake(ctx, c._id);
      await syncClientChecklists(ctx, c._id);
      await logActivity(ctx, viewer, "access.client_invited", `Invited ${c.preferredName} to her portal`, c._id);
      return { email: c.email, alreadySignedIn: linked };
    }
    const id = ctx.db.normalizeId("members", args.id);
    const m = id ? await ctx.db.get(id) : null;
    if (!m) notFound("Team member");
    notYourself(viewer, m._id);
    ownerOnlyForAdmins(viewer, m.role);
    const linked = m.userId !== undefined;
    await ctx.db.patch(m._id, { status: linked ? "active" : "invited", inviteSentAt: now });
    await logActivity(ctx, viewer, "access.member_invited", `Invited ${m.name} to the team as ${m.role}`);
    return { email: m.email, alreadySignedIn: linked };
  },
});

export const markEnded = internalMutation({
  args: { kind: v.union(v.literal("client"), v.literal("member")), id: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "access");
    const now = Date.now();
    let userId: Id<"users"> | undefined;
    if (args.kind === "client") {
      const id = ctx.db.normalizeId("clients", args.id);
      const c = id ? await ctx.db.get(id) : null;
      if (!c) notFound("Client");
      userId = c.userId;
      await ctx.db.patch(c._id, { access: "ended", accessChangedAt: now });
      await logActivity(ctx, viewer, "access.client_ended", `Ended portal access for ${c.preferredName}`, c._id);
    } else {
      const id = ctx.db.normalizeId("members", args.id);
      const m = id ? await ctx.db.get(id) : null;
      if (!m) notFound("Team member");
      notYourself(viewer, m._id);
      ownerOnlyForAdmins(viewer, m.role);
      userId = m.userId;
      await ctx.db.patch(m._id, { status: "ended" });
      await logActivity(ctx, viewer, "access.member_ended", `Ended team access for ${m.name}`);
    }
    const user = userId ? await ctx.db.get(userId) : null;
    return { clerkUserId: user?.clerkUserId ?? null };
  },
});

export const saveNote = internalMutation({
  args: { kind: v.union(v.literal("client"), v.literal("member")), id: v.string(), note: v.string() },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "access");
    const id = args.kind === "client" ? ctx.db.normalizeId("clients", args.id) : ctx.db.normalizeId("members", args.id);
    if (id) await ctx.db.patch(id, { accessNote: args.note.slice(0, 400) });
  },
});

/** Lets an action confirm a permission before doing outside work. */
export const assertCan = internalQuery({
  args: { permission: v.string() },
  handler: async (ctx, args) => {
    const known = PERMISSIONS.find((p) => p.key === args.permission);
    if (!known) bad("Unknown permission.");
    const viewer = await requirePermission(ctx, known.key);
    return { name: viewer.name, role: viewer.role };
  },
});
