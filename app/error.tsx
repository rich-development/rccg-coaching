"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ui";

// Shown when a page fails to load. The most common cause during setup is the
// website being newer than the database functions, so that case gets its own
// plain explanation instead of a blank error screen.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const behind = /Could not find public function|is not a function|forget to run/i.test(error.message ?? "");
  return (
    <main className="min-h-screen bg-paper px-5 py-16 text-ink">
      <div className="mx-auto max-w-xl">
        <h1 className="text-3xl">{behind ? "The database needs an update" : "This page did not load"}</h1>
        <span className="swash" aria-hidden />
        {behind ? (
          <>
            <p className="mt-4 leading-relaxed">The website is newer than the database behind it, so this page asked for something the database does not have yet. Nothing was lost or changed.</p>
            <p className="mt-3 leading-relaxed text-soft">To fix it, the person who manages the site runs these two commands in the project folder, then reloads:</p>
            <pre className="mt-3 overflow-x-auto rounded-md bg-mist p-3 text-sm">git pull{"\n"}npx convex dev</pre>
          </>
        ) : (
          <p className="mt-4 leading-relaxed">Something went wrong while opening this page. Nothing was changed. Try again, and if it keeps happening, send the details below to the person who manages the site.</p>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button tone="primary" onClick={reset}>Try again</Button>
          <LinkButton href="/">Go to the start</LinkButton>
        </div>
        <details className="mt-8 text-[13px] text-soft">
          <summary className="cursor-pointer">Details for support</summary>
          <p className="mt-2 break-words">{error.message || "No message"}{error.digest ? ` (${error.digest})` : ""}</p>
        </details>
      </div>
    </main>
  );
}
