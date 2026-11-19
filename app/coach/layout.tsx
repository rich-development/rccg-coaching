"use client";

import { UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { isTeamRole, useViewer } from "@/components/gate";
import type { PermissionKey } from "@/components/role";
import { Loading, NoticeProvider } from "@/components/ui";

type NavItem = { href: string; label: string; exact?: boolean; needs?: PermissionKey };
const NAV: NavItem[] = [
  { href: "/coach", label: "Today", exact: true },
  { href: "/coach/clients", label: "Clients" },
  { href: "/coach/pipeline", label: "Discovery" },
  { href: "/coach/inbox", label: "Messages" },
  { href: "/coach/coworking", label: "Co-working" },
  { href: "/coach/reports", label: "Reports", needs: "reports" },
  { href: "/coach/library", label: "Library" },
  { href: "/coach/access", label: "Access", needs: "access" },
  { href: "/coach/settings", label: "Settings", needs: "settings" },
];

function Shell({ children, role, name, permissions }: { children: ReactNode; role: string; name: string; permissions: string[] }) {
  const path = usePathname();
  const inbox = useQuery(api.messages.inbox, {});
  const waiting = inbox?.filter((t) => t.status === "needs_reply").length ?? 0;
  const items = NAV.filter((n) => !n.needs || permissions.includes(n.needs));
  const active = (n: NavItem) => (n.exact ? path === n.href : path.startsWith(n.href));
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="bg-black text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex items-center justify-between px-5 py-4 lg:block lg:py-6">
          <Link href="/coach" aria-label="Today">
            <Image src="/brand/tr-horizontal-light.png" alt="Tamika Rich" width={900} height={450} priority className="h-auto w-36 lg:w-44" />
          </Link>
          <div className="lg:hidden">
            <UserButton />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible" aria-label="Main">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n) ? "page" : undefined}
              className={`flex items-center justify-between whitespace-nowrap rounded-md px-3 py-2 text-sm ${
                active(n) ? "bg-white/12 text-gold-300" : "text-white/75 hover:bg-white/8 hover:text-white"
              }`}
            >
              {n.label}
              {n.href === "/coach/inbox" && waiting > 0 && (
                <span className="ml-2 rounded-full bg-gold-500 px-1.5 text-[11px] font-semibold text-black">{waiting}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 border-t border-white/15 px-5 py-4 lg:flex">
          <UserButton />
          <div className="min-w-0 text-xs">
            <div className="truncate text-white">{name}</div>
            <div className="capitalize text-white/55">{role}</div>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-9">
        <div className="mx-auto max-w-6xl">
          <Suspense fallback={<Loading />}>{children}</Suspense>
        </div>
      </main>
    </div>
  );
}

export default function CoachLayout({ children }: { children: ReactNode }) {
  const { loading, me } = useViewer();
  const router = useRouter();
  const allowed = isTeamRole(me?.role);
  useEffect(() => {
    if (!loading && !allowed) router.replace("/");
  }, [loading, allowed, router]);
  if (loading || !allowed || !me) return <Loading label="Opening your workspace" />;
  return (
    <NoticeProvider>
      <Shell role={me.role} name={me.name} permissions={me.permissions}>
        {children}
      </Shell>
    </NoticeProvider>
  );
}
