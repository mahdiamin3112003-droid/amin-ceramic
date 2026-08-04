import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Reached by `notFound()` — including for a record that exists but belongs
 * to another tenant. That is docs/04 §5.1's rule: 404 rather than 403,
 * because a 403 would confirm the id exists and turn this into an
 * enumeration oracle.
 */
export default function AdminNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <h1 className="font-display text-heading-md">Not found</h1>
      <p className="text-body-sm text-stone-600">
        That record doesn&rsquo;t exist, or it has been deleted.
      </p>
      <Button asChild className="mt-2">
        <Link href="/admin">Back to overview</Link>
      </Button>
    </div>
  );
}
