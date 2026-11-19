/**
 * Server-to-server calls to Clerk's Backend API. Used only inside Convex
 * actions, with the CLERK_SECRET_KEY set on the Convex deployment.
 *
 * Clerk is asked for three things:
 *   1. Who is this user? (verified email, name, owner mark)
 *   2. Send an invitation email.
 *   3. Sign a user out everywhere when access ends.
 */

const API = "https://api.clerk.com/v1";

export function clerkConfigured(): boolean {
  return !!process.env.CLERK_SECRET_KEY;
}

async function call(path: string, init?: { method?: string; body?: unknown }) {
  const response = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "content-type": "application/json",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { ok: response.ok, status: response.status, data };
}

export type ClerkPerson = {
  clerkUserId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  isOwner: boolean;
};

type ClerkUserJson = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: { id: string; email_address: string; verification?: { status?: string } | null }[];
  public_metadata?: Record<string, unknown> | null;
};

/** Returns null when Clerk does not know this user. Throws on a Clerk outage. */
export async function fetchClerkPerson(clerkUserId: string): Promise<ClerkPerson | null> {
  if (!/^user_[A-Za-z0-9]+$/.test(clerkUserId)) return null;
  const res = await call(`/users/${clerkUserId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Clerk user lookup failed with status ${res.status}`);
  const u = res.data as ClerkUserJson;
  const emails = u.email_addresses ?? [];
  const primary = emails.find((e) => e.id === u.primary_email_address_id) ?? emails[0];
  const email = primary ? primary.email_address.trim().toLowerCase() : "";
  return {
    clerkUserId: u.id,
    email,
    emailVerified: primary?.verification?.status === "verified",
    name: [u.first_name, u.last_name].filter(Boolean).join(" ") || email || "Unknown",
    // Set once on the user in the Clerk dashboard: public metadata { "role": "owner" }
    isOwner: u.public_metadata?.role === "owner",
  };
}

export async function sendInvitation(email: string, redirectUrl: string | undefined): Promise<{ sent: boolean; note: string }> {
  const res = await call("/invitations", {
    method: "POST",
    body: { email_address: email, redirect_url: redirectUrl, notify: true },
  });
  if (res.ok) return { sent: true, note: `Invitation email sent to ${email}.` };
  const errors = (res.data as { errors?: { code?: string; message?: string }[] } | null)?.errors ?? [];
  const code = errors[0]?.code ?? "";
  if (code === "duplicate_record" || code === "form_identifier_exists") {
    return {
      sent: false,
      note:
        code === "duplicate_record"
          ? `${email} already has a pending invitation. No new email was sent.`
          : `${email} already has a sign-in, so no invitation email was needed. She can sign in now.`,
    };
  }
  console.error("Clerk invitation failed", res.status, JSON.stringify(res.data));
  return { sent: false, note: `Clerk could not send the invitation (status ${res.status}). Access is set, and she can still sign in with ${email}.` };
}

/** Signs the user out of every device. Returns how many sessions were closed. */
export async function revokeSessions(clerkUserId: string): Promise<number> {
  if (!/^user_[A-Za-z0-9]+$/.test(clerkUserId)) return 0;
  const res = await call(`/sessions?user_id=${clerkUserId}&status=active`);
  if (!res.ok || !Array.isArray(res.data)) return 0;
  let closed = 0;
  for (const s of res.data as { id: string }[]) {
    const r = await call(`/sessions/${s.id}/revoke`, { method: "POST" });
    if (r.ok) closed++;
  }
  return closed;
}
