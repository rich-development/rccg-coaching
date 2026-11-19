"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/** True when the signed-in person is the coach (not staff). */
export function useIsCoach(): boolean {
  const me = useQuery(api.users.me, {});
  return me?.role === "coach";
}
