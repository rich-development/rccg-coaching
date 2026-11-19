"use client";

import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";

/**
 * Who is signed in and which side of the app they belong on. After sign-in
 * the app checks with Clerk once, then reads the role from the database.
 */
export function useViewer() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const sync = useAction(api.users.sync);
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (isAuthenticated) {
      sync({})
        .then((result) => {
          if (!cancelled) setProblem(result.problem);
        })
        .catch(() => {
          if (!cancelled) setProblem("The app could not reach its database to confirm who you are.");
        })
        .finally(() => {
          if (!cancelled) setReady(true);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, sync]);
  const me = useQuery(api.users.me, isAuthenticated && ready ? {} : "skip");
  return {
    loading: isLoading || (isAuthenticated && (!ready || me === undefined)),
    signedIn: isAuthenticated,
    me: isAuthenticated ? (me ?? null) : null,
    problem,
  };
}

export const isTeamRole = (role: string | undefined) => role === "owner" || role === "admin" || role === "staff";
