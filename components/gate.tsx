"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";

/** Who is signed in and which side of the app they belong on. */
export function useViewer() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const ensure = useMutation(api.users.ensure);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (isAuthenticated) {
      ensure({})
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setReady(true);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, ensure]);
  const me = useQuery(api.users.me, isAuthenticated && ready ? {} : "skip");
  return {
    loading: isLoading || (isAuthenticated && (!ready || me === undefined)),
    signedIn: isAuthenticated,
    me: isAuthenticated ? (me ?? null) : null,
  };
}
