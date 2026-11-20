"use client";

import { SignOutButton, useAuth } from "@clerk/nextjs";
import { useConvex } from "convex/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isTeamRole, useViewer } from "@/components/gate";
import { LinkButton } from "@/components/ui";

export default function Home() {
  const { loading, signedIn, me, problem, waitingOn } = useViewer();
  const convex = useConvex();
  const clerk = useAuth();
  // If loading drags on, show what is and is not connected instead of waiting forever.
  const [stuck, setStuck] = useState<{ connected: boolean; everConnected: boolean } | null>(null);
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      const state = convex.connectionState();
      setStuck({ connected: state.isWebSocketConnected, everConnected: state.hasEverConnected });
    }, 8000);
    return () => clearTimeout(timer);
  }, [loading, convex]);
  const convexHost = (process.env.NEXT_PUBLIC_CONVEX_URL ?? "").replace(/^https?:\/\//, "");
  const router = useRouter();
  const role = me?.role;
  const team = isTeamRole(role);

  useEffect(() => {
    if (team) router.replace("/coach");
    if (role === "client") router.replace("/portal");
  }, [role, team, router]);

  const blocked = me?.blocked;
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 py-10">
      <div className="w-full max-w-md text-center">
        <Image src="/brand/tr-stacked-dark.png" alt="Tamika Rich" width={640} height={639} priority className="mx-auto h-auto w-56" />
        {loading || team || role === "client" ? (
          <>
            <p className="mt-8 text-sm text-soft">Opening your workspace&hellip;</p>
            {loading && stuck && (
              <div className="mt-6 rounded-lg border border-clay/40 bg-clay-50 p-4 text-left text-[13px]">
                <div className="font-medium text-clay">This is taking too long. Here is what the app sees.</div>
                <dl className="mt-2 space-y-1 text-ink">
                  <div>Database address: {convexHost || "not set"}</div>
                  <div>Connected to the database: {stuck.connected ? "yes" : stuck.everConnected ? "it was, but dropped" : "no, never"}</div>
                  <div>Signed in with Clerk: {clerk.isLoaded ? (clerk.isSignedIn ? "yes" : "no") : "Clerk has not loaded"}</div>
                  <div>
                    Waiting on:{" "}
                    {waitingOn === "handshake" ? "the database accepting your Clerk sign-in" : waitingOn === "identity" ? "the identity check with Clerk (users.sync)" : "your role (users.me)"}
                  </div>
                </dl>
                <p className="mt-2 text-soft">
                  {!stuck.everConnected
                    ? "The site cannot reach Convex. In Netlify, NEXT_PUBLIC_CONVEX_URL should look like https://your-name-123.convex.cloud (not .convex.site and not a dashboard link). It is baked in at build time, so redeploy after fixing it."
                    : waitingOn === "handshake"
                      ? "Convex is reachable but has not accepted the sign-in. Check that CLERK_FRONTEND_API_URL on the Convex deployment matches Clerk\u2019s Frontend API URL exactly, and that the Convex integration is turned on in Clerk."
                      : "Convex is reachable and accepted the sign-in, but a backend function has not answered. Run npx convex dev to push the latest backend, then reload."}
                </p>
              </div>
            )}
          </>
        ) : !signedIn ? (
          <>
            <p className="mt-6 text-[1.05rem] leading-relaxed text-soft">
              Coaching for women who are starting a business, starting over, or pivoting.
            </p>
            <div className="mt-8">
              <LinkButton href="/sign-in" tone="primary">
                Sign in
              </LinkButton>
            </div>
            <p className="mt-6 text-xs text-faint">Clients: use the email address you gave Tamika.</p>
          </>
        ) : (
          <div className="mt-8 rounded-lg border border-line bg-mist p-5 text-left text-sm">
            <h1 className="text-lg">
              {blocked === "paused" ? "Your access is paused" : blocked === "ended" ? "Your access has ended" : "Your page is not open yet"}
            </h1>
            {blocked === "paused" ? (
              <p className="mt-2 text-soft">Your account is safe and nothing was deleted. Please contact Tamika to turn your access back on.</p>
            ) : blocked === "ended" ? (
              <p className="mt-2 text-soft">Thank you for the work we did together. If you think this is a mistake, please contact Tamika.</p>
            ) : (
              <>
                <p className="mt-2 text-soft">
                  You are signed in as <strong className="text-ink">{me?.email ?? "an email we could not read"}</strong>. Tamika opens each
                  page herself, using the email address you gave her.
                </p>
                <p className="mt-2 text-soft">
                  If you used a different email, sign out and try that one. Otherwise, let Tamika know and she will send you an invitation.
                </p>
              </>
            )}
            {/* Plain facts for whoever is setting the app up. */}
            <details className="mt-4 rounded-md border border-line bg-paper p-3 text-[13px]">
              <summary className="cursor-pointer font-medium">What the app sees</summary>
              <dl className="mt-2 space-y-1 text-soft">
                <div>Email: {me?.email ?? "none"}</div>
                <div>Email verified in Clerk: {me?.emailVerified ? "yes" : "no"}</div>
                <div>Checked with Clerk: {me?.diagnostics.synced ? "yes" : "no"}</div>
                <div>Marked as owner in Clerk: {me?.diagnostics.markedOwnerInClerk ? "yes" : "no"}</div>
                <div>Reason: {problem ?? (blocked === "unverified" ? "The email is not verified." : blocked === "not_synced" ? "The check with Clerk has not finished." : blocked === "unknown" ? "No team seat or client invitation matches this email." : (blocked ?? "none"))}</div>
              </dl>
              <p className="mt-2 text-faint">Owners are set in the Clerk dashboard: open the user and add public metadata {"{ \"role\": \"owner\" }"}.</p>
            </details>
            <div className="mt-4">
              <SignOutButton>
                <button type="button" className="rounded-md border border-line bg-paper px-3.5 py-2 text-sm font-medium hover:bg-mist">
                  Sign out
                </button>
              </SignOutButton>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
