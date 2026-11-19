import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Access control. Every public function in this backend starts with one of:
 *
 *   requireCoach(ctx)   Tamika only. Private notes, transcripts, AI, exports.
 *   requireTeam(ctx)    Tamika or active staff. Day-to-day operations.
 *   requireClient(ctx)  A signed-in client. Returns HER client record only.
 *
 * Rules:
 * - The coach role comes from the COACH_EMAILS environment variable, checked
 *   on every request against a VERIFIED email. Nobody can promote themselves
 *   from inside the app.
 * - Staff are added by the coach and checked on every request.
 * - A client's record is always looked up from her own sign-in. Portal
 *   functions never accept a clientId argument.
 */

export type Role = "coach" | "staff" | "client" | "none";

type Ctx = QueryCtx | MutationCtx;

function emailList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

type Identity = {
  tokenIdentifier: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
};

async function readIdentity(ctx: {
  auth: QueryCtx["auth"];
}): Promise<Identity | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const email = identity.email ? normalizeEmail(identity.email) : null;
  return {
    tokenIdentifier: identity.tokenIdentifier,
    email,
    // Only trust an email the identity provider has verified.
    emailVerified: identity.emailVerified === true,
    name: identity.name ?? identity.givenName ?? email ?? "Unknown",
  };
}

export function isCoachIdentity(identity: Identity | null): boolean {
  return (
    !!identity &&
    !!identity.email &&
    identity.emailVerified &&
    emailList("COACH_EMAILS").includes(identity.email)
  );
}

export type Viewer = {
  role: Role;
  name: string;
  email: string | null;
  emailVerified: boolean;
  tokenIdentifier: string;
  user: Doc<"users"> | null;
  client: Doc<"clients"> | null;
};

export async function getViewer(ctx: Ctx): Promise<Viewer | null> {
  const identity = await readIdentity(ctx);
  if (!identity) return null;
  const base = {
    name: identity.name,
    email: identity.email,
    emailVerified: identity.emailVerified,
    tokenIdentifier: identity.tokenIdentifier,
  };
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();

  if (isCoachIdentity(identity)) {
    return { ...base, role: "coach", user, client: null };
  }
  if (identity.email && identity.emailVerified) {
    const member = await ctx.db
      .query("teamMembers")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();
    if (member && member.active) {
      return { ...base, role: "staff", name: member.name, user, client: null };
    }
  }
  if (user && user.clientId) {
    const client = await ctx.db.get(user.clientId);
    // The link must hold in both directions and portal access must be on.
    if (
      client &&
      client.portalEnabled &&
      !client.archived &&
      client.userId === user._id
    ) {
      return { ...base, role: "client", user, client };
    }
  }
  return { ...base, role: "none", user, client: null };
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

export async function requireCoach(ctx: Ctx): Promise<Viewer> {
  const viewer = await requireSignedIn(ctx);
  if (viewer.role !== "coach") deny("Only the coach can do this.");
  return viewer;
}

export async function requireTeam(ctx: Ctx): Promise<Viewer> {
  const viewer = await requireSignedIn(ctx);
  if (viewer.role !== "coach" && viewer.role !== "staff") {
    deny("Only the coaching team can do this.");
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

/** For actions, which have no database access. Coach only. */
export async function requireCoachInAction(ctx: ActionCtx): Promise<string> {
  const identity = await readIdentity(ctx);
  if (!identity) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in first." });
  }
  if (!isCoachIdentity(identity)) deny("Only the coach can do this.");
  return identity.name;
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

export function notFound(what: string): never {
  throw new ConvexError({ code: "NOT_FOUND", message: `${what} was not found.` });
}

export function bad(message: string): never {
  throw new ConvexError({ code: "INVALID", message });
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
