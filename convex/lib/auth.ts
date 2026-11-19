import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Access control. Every public function in this backend starts with one of:
 *
 *   requirePermission(ctx, key)  Team member whose role has that permission.
 *   requireTeam(ctx)             Any active team member (owner, admin, staff).
 *   requireClient(ctx)           A signed-in client. Returns HER record only.
 *
 * How identity works:
 * - Clerk proves who is signed in. The only thing trusted from the sign-in
 *   token is the user's Clerk id.
 * - After sign-in the app asks Clerk directly (server to server) for that
 *   user's verified email and whether she is marked as an owner. See
 *   users.sync. Nothing depends on custom claims inside the token.
 * - Roles, permissions, and access status live in this database and are
 *   managed on the Access page. They are checked on every request, so a
 *   pause or a role change takes effect immediately.
 * - A client's record is always found from her own sign-in. Portal functions
 *   never accept a clientId argument.
 */

export type Role = "owner" | "admin" | "staff" | "client" | "none";

export const PERMISSIONS = [
  {
    key: "coaching",
    label: "Private coaching material",
    detail: "Session notes, transcripts, recap drafts and approval, AI drafts, client consent, completion reviews, feedback.",
  },
  { key: "reports", label: "Reports and revenue", detail: "Practice reports and the engagement download." },
  { key: "payments", label: "Payments and agreed terms", detail: "Record confirmed payments and edit a client's agreed terms." },
  { key: "export", label: "Export and archive records", detail: "Download a client's full record and archive or restore it." },
  { key: "access", label: "Manage access", detail: "Add people, change roles and permissions, and invite, pause, or end access." },
  { key: "settings", label: "Settings and library", detail: "Practice settings, services, workbook masters, and message templates." },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];
const ALL: Permission[] = PERMISSIONS.map((p) => p.key);

export const DEFAULT_ROLE_PERMISSIONS: Record<"admin" | "staff", Permission[]> = {
  admin: [...ALL],
  staff: ["payments"],
};

/** An owner flag is only trusted for a day without a fresh check against Clerk. */
const OWNER_FRESH_MS = 24 * 60 * 60 * 1000;

type Ctx = QueryCtx | MutationCtx;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type Blocked = "not_synced" | "unverified" | "paused" | "ended" | "unknown";

export type Viewer = {
  role: Role;
  permissions: Permission[];
  name: string;
  email: string | null;
  emailVerified: boolean;
  tokenIdentifier: string;
  user: Doc<"users"> | null;
  client: Doc<"clients"> | null;
  member: Doc<"members"> | null;
  blocked: Blocked | null;
};

export async function rolePermissions(ctx: Ctx, role: "admin" | "staff"): Promise<Permission[]> {
  const row = await ctx.db
    .query("rolePermissions")
    .withIndex("by_role", (q) => q.eq("role", role))
    .unique();
  if (!row) return DEFAULT_ROLE_PERMISSIONS[role];
  return row.permissions.filter((p): p is Permission => (ALL as string[]).includes(p));
}

export async function getViewer(ctx: Ctx): Promise<Viewer | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  const base = {
    permissions: [] as Permission[],
    name: user?.name ?? "Unknown",
    email: user?.email || null,
    emailVerified: user?.emailVerified ?? false,
    tokenIdentifier: identity.tokenIdentifier,
    user,
    client: null,
    member: null,
    blocked: null,
  };
  if (!user) return { ...base, role: "none", blocked: "not_synced" };

  if (user.isOwner && Date.now() - user.syncedAt < OWNER_FRESH_MS) {
    return { ...base, role: "owner", permissions: [...ALL] };
  }
  if (!user.emailVerified || !user.email) {
    return { ...base, role: "none", blocked: "unverified" };
  }

  const member = await ctx.db
    .query("members")
    .withIndex("by_email", (q) => q.eq("email", user.email))
    .first();
  if (member && (member.userId === undefined || member.userId === user._id)) {
    if (member.status === "active" || member.status === "invited") {
      return {
        ...base,
        role: member.role,
        name: member.name,
        member,
        permissions: await rolePermissions(ctx, member.role),
      };
    }
    return { ...base, role: "none", member, blocked: member.status };
  }

  if (user.clientId) {
    const client = await ctx.db.get(user.clientId);
    // The link must hold in both directions.
    if (client && !client.archived && client.userId === user._id) {
      if (client.access === "active") return { ...base, role: "client", client };
      if (client.access === "paused" || client.access === "ended") {
        return { ...base, role: "none", blocked: client.access };
      }
    }
  }
  return { ...base, role: "none", blocked: "unknown" };
}

export function can(viewer: Pick<Viewer, "permissions">, permission: Permission): boolean {
  return viewer.permissions.includes(permission);
}

function deny(message: string): never {
  throw new ConvexError({ code: "FORBIDDEN", message });
}

export async function requireSignedIn(ctx: Ctx): Promise<Viewer> {
  const viewer = await getViewer(ctx);
  if (!viewer) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in first." });
  }
  return viewer;
}

export async function requireTeam(ctx: Ctx): Promise<Viewer> {
  const viewer = await requireSignedIn(ctx);
  if (viewer.role !== "owner" && viewer.role !== "admin" && viewer.role !== "staff") {
    deny("Only the coaching team can do this.");
  }
  return viewer;
}

export async function requirePermission(ctx: Ctx, permission: Permission): Promise<Viewer> {
  const viewer = await requireTeam(ctx);
  if (!can(viewer, permission)) {
    const label = PERMISSIONS.find((p) => p.key === permission)!.label.toLowerCase();
    deny(`Your role does not include: ${label}.`);
  }
  return viewer;
}

export async function requireClient(
  ctx: Ctx,
): Promise<Viewer & { client: Doc<"clients">; user: Doc<"users"> }> {
  const viewer = await requireSignedIn(ctx);
  if (viewer.role !== "client" || !viewer.client || !viewer.user) {
    deny("This page is for clients.");
  }
  return viewer as Viewer & { client: Doc<"clients">; user: Doc<"users"> };
}

export async function logActivity(
  ctx: MutationCtx,
  viewer: Pick<Viewer, "name" | "role">,
  action: string,
  summary: string,
  clientId?: Id<"clients">,
  entity?: string,
) {
  await ctx.db.insert("activity", {
    at: Date.now(),
    actor: viewer.name,
    actorRole: viewer.role,
    action,
    summary: summary.slice(0, 300),
    clientId,
    entity,
  });
}

/** Reject oversized text so nobody can stuff the database. */
export function text(value: string, max = 4000, label = "Text"): string {
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new ConvexError({
      code: "TOO_LONG",
      message: `${label} is too long. Keep it under ${max} characters.`,
    });
  }
  return trimmed;
}

export function optText(
  value: string | undefined,
  max = 4000,
  label = "Text",
): string | undefined {
  if (value === undefined) return undefined;
  const t = text(value, max, label);
  return t === "" ? undefined : t;
}

/** Only allow http(s) links so a stored link can never run script. */
export function link(value: string | undefined, label = "Link"): string | undefined {
  if (value === undefined) return undefined;
  const t = value.trim();
  if (t === "") return undefined;
  if (t.length > 600 || !/^https?:\/\//i.test(t)) {
    throw new ConvexError({
      code: "BAD_LINK",
      message: `${label} must start with https:// or http://`,
    });
  }
  return t;
}

export function isoDate(value: string | undefined, label = "Date"): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ConvexError({ code: "BAD_DATE", message: `${label} must be a date.` });
  }
  return value;
}

export function validEmail(value: string): string {
  const email = normalizeEmail(text(value, 200, "Email"));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad("Enter a valid email.");
  return email;
}

export function notFound(what: string): never {
  throw new ConvexError({ code: "NOT_FOUND", message: `${what} was not found.` });
}

export function bad(message: string): never {
  throw new ConvexError({ code: "INVALID", message });
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
