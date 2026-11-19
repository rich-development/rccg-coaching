"use client";

import { SignOutButton } from "@clerk/nextjs";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useViewer } from "@/components/gate";
import { LinkButton } from "@/components/ui";

export default function Home() {
  const { loading, signedIn, me } = useViewer();
  const router = useRouter();
  const role = me?.role;

  useEffect(() => {
    if (role === "coach" || role === "staff") router.replace("/coach");
    if (role === "client") router.replace("/portal");
  }, [role, router]);

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6">
      <div className="w-full max-w-md text-center">
        <Image src="/brand/tr-stacked-dark.png" alt="Tamika Rich" width={640} height={639} priority className="mx-auto h-auto w-56" />
        {loading || role === "coach" || role === "staff" || role === "client" ? (
          <p className="mt-8 text-sm text-soft">Opening your workspace&hellip;</p>
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
            <h1 className="text-lg">Your portal is not open yet</h1>
            <p className="mt-2 text-soft">
              You are signed in as <strong className="text-ink">{me?.email ?? "an unknown email"}</strong>
              {me && !me.emailVerified ? ", but that email has not been verified" : ""}. Tamika opens each
              client portal herself, using the email address you gave her.
            </p>
            <p className="mt-2 text-soft">
              If you used a different email, sign out and try that one. Otherwise, let Tamika know and she will turn your
              access on.
            </p>
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
