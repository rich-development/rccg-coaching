"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

// Tolerate stray spaces or a trailing slash in the setting.
const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim().replace(/\/+$/, "");
const convex = url ? new ConvexReactClient(url) : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <main className="mx-auto max-w-xl p-10">
        <h1 className="text-2xl">Almost there</h1>
        <p className="mt-3 text-soft">
          This app is not connected to its database yet. Run <code>npx convex dev</code> and add{" "}
          <code>NEXT_PUBLIC_CONVEX_URL</code> to the site settings. The README has the steps.
        </p>
      </main>
    );
  }
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
