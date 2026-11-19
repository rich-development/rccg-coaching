"use client";

import { UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/components/gate";
import { Loading, NoticeProvider } from "@/components/ui";

function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const home = useQuery(api.portal.home, {});
  const unread = home?.unreadMessages ?? 0;
  const nav = [
    { href: "/portal", label: "Home", exact: true },
    { href: "/portal/messages", label: "Messages", badge: unread },
    { href: "/portal/recaps", label: "Session notes" },
  ];
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3">
          <Link href="/portal" aria-label="Home">
            <Image src="/brand/tr-horizontal-dark.png" alt="Tamika Rich" width={900} height={435} priority className="h-auto w-36" />
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main">
            {nav.map((n) => {
              const active = n.exact ? path === n.href : path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={`rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-gold-100 text-ink" : "text-soft hover:text-ink"}`}>
                  {n.label}
                  {n.badge ? <span className="ml-1.5 rounded-full bg-clay px-1.5 text-[11px] text-white">{n.badge}</span> : null}
                </Link>
              );
            })}
            <span className="ml-2"><UserButton /></span>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-8">
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </main>
      <footer className="mx-auto max-w-4xl px-5 pb-10 pt-4 text-xs text-faint">
        Only you and Tamika can see what is on these pages. Please keep customer details, passwords, and account numbers out of your answers.
      </footer>
    </div>
  );
}

export default function PortalLayout({ children }: { children: ReactNode }) {
  const { loading, me } = useViewer();
  const router = useRouter();
  const allowed = me?.role === "client";
  useEffect(() => {
    if (!loading && !allowed) router.replace("/");
  }, [loading, allowed, router]);
  if (loading || !allowed) return <Loading label="Opening your page" />;
  return (
    <NoticeProvider>
      <Shell>{children}</Shell>
    </NoticeProvider>
  );
}
