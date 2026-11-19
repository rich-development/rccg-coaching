"use client";

import { useAction, useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, useNotice } from "@/components/ui";
import { errorMessage } from "@/lib/format";

export type AccessState = "none" | "invited" | "active" | "paused" | "ended";

const label: Record<AccessState, string> = {
  none: "No access",
  invited: "Invited, not signed in yet",
  active: "Active",
  paused: "Paused",
  ended: "Ended",
};
const tone = { none: "neutral", invited: "gold", active: "moss", paused: "clay", ended: "ink" } as const;

export function AccessBadge({ state, invitationSent = true }: { state: AccessState; invitationSent?: boolean }) {
  const text = state === "invited" && !invitationSent ? "Access on, not invited yet" : label[state];
  return <Badge tone={tone[state]}>{text}</Badge>;
}

/** Runs an access change and shows what happened, including what Clerk did. */
function useAccessAct() {
  const notice = useNotice();
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<{ note: string } | null | void>, done?: string) => {
    setBusy(true);
    try {
      const result = await work();
      notice(result && "note" in result ? result.note : (done ?? "Saved"));
    } catch (e) {
      notice(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

/**
 * Invite, pause, restore, or end access for one client or team member.
 * An invitation email goes out only when "Send invitation" is clicked.
 */
export function AccessControls({
  kind,
  id,
  state,
  signedIn,
  name,
  disabled,
  invitationSent = true,
}: {
  kind: "client" | "member";
  id: string;
  state: AccessState;
  signedIn: boolean;
  name: string;
  disabled?: boolean;
  invitationSent?: boolean;
}) {
  const invite = useAction(api.access.invite);
  const end = useAction(api.access.end);
  const setClient = useMutation(api.access.setClientAccess);
  const setMember = useMutation(api.access.setMemberStatus);
  const resetLink = useMutation(api.access.resetClientLink);
  const { run, busy } = useAccessAct();
  const off = busy || disabled;
  const set = (to: "active" | "paused") =>
    kind === "client" ? setClient({ id: id as Id<"clients">, access: to }) : setMember({ id: id as Id<"members">, status: to });
  const origin = () => (typeof window === "undefined" ? undefined : window.location.origin);

  return (
    <div className="flex flex-wrap gap-2">
      {(state === "none" || state === "invited") && (
        <Button small tone="primary" disabled={off} onClick={() => run(() => invite({ kind, id, origin: origin() }))}>
          {state === "invited" && invitationSent ? "Send invitation again" : "Send invitation"}
        </Button>
      )}
      {state === "none" && kind === "client" && (
        <Button small disabled={off} onClick={() => run(() => set("active"), "Access is on. No email was sent.")}>
          Give access without an email
        </Button>
      )}
      {(state === "active" || state === "invited") && (
        <Button small disabled={off} onClick={() => run(() => set("paused"), `${name}'s access is paused`)}>
          Pause access
        </Button>
      )}
      {(state === "paused" || state === "ended") && (
        <Button small tone="primary" disabled={off} onClick={() => run(() => set("active"), `${name}'s access is restored`)}>
          Restore access
        </Button>
      )}
      {state !== "none" && state !== "ended" && (
        <Button
          small
          tone="danger"
          disabled={off}
          onClick={() => {
            if (window.confirm(`End access for ${name}? She is signed out everywhere. Her record is kept, and you can restore access later.`)) run(() => end({ kind, id }));
          }}
        >
          End access
        </Button>
      )}
      {kind === "client" && signedIn && state !== "ended" && (
        <Button small tone="ghost" disabled={off} onClick={() => run(() => resetLink({ id: id as Id<"clients"> }), "Sign-in link reset. She can link again with her email.")}>
          Reset sign-in link
        </Button>
      )}
    </div>
  );
}
