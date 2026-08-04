"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Error boundary for the admin shell.
 *
 * The most likely thing to land here is a `ForbiddenError` from
 * `requirePermission` — someone typed the URL of a page their role does not
 * cover. Next deliberately strips a server error's message in production
 * (it can carry internals), so this cannot branch on which error it was and
 * must not pretend to: the copy covers both readings honestly rather than
 * guessing and being confidently wrong half the time.
 *
 * The nav only shows sections the caller may open, so reaching this by
 * clicking is not the common path.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on the server-side stack in production,
    // so it goes to the console where support can ask for it.
    console.error("[admin]", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <h1 className="font-display text-heading-md">That didn&rsquo;t work</h1>
      <p className="text-body-sm text-stone-600">
        Either something went wrong, or your role doesn&rsquo;t cover this page. If
        you think you should have access, ask an owner to check your permissions.
      </p>
      {error.digest ? (
        <p className="text-caption font-mono text-stone-500">
          Reference: {error.digest}
        </p>
      ) : null}
      <div className="mt-2 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="ghost">
          <Link href="/admin">Back to overview</Link>
        </Button>
      </div>
    </div>
  );
}
