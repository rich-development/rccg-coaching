"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export type PermissionKey = "coaching" | "reports" | "payments" | "export" | "access" | "settings";

/** True when the signed-in person's role includes this permission. */
export function useCan(permission: PermissionKey): boolean {
  const me = useQuery(api.users.me, {});
  return me?.permissions.includes(permission) ?? false;
}

/** Private coaching material: notes, transcripts, recaps, AI drafts. */
export const useIsCoach = () => useCan("coaching");
