import { Mail, MapPin, Phone } from "lucide-react";

import type { Location } from "@/domain/inventory/entity";

/**
 * docs/02-ux-blueprint.md §3.1 section 9: "THREE SHOWROOMS — map + cards +
 * hours". No map (needs a maps provider key, not in this phase) and no
 * hours (`location.opening_hours` isn't mapped into the domain entity yet —
 * flagged in the Phase 3 plan). Address and contact are real data.
 */
export function ShowroomCard({ location }: { location: Location }) {
  const address = [location.addressLine1, location.city, location.region]
    .filter((part): part is string => Boolean(part))
    .join(", ");

  return (
    <article className="flex flex-col gap-3 rounded-md border border-border p-6">
      <h3 className="text-heading-sm">{location.name}</h3>

      {address ? (
        <p className="flex items-start gap-2 text-body-sm text-stone-600">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {address}
        </p>
      ) : null}

      {location.phone ? (
        <a
          href={`tel:${location.phone.replace(/\s/g, "")}`}
          className="flex items-center gap-2 text-body-sm text-stone-600 hover:text-foreground"
        >
          <Phone className="size-4 shrink-0" aria-hidden="true" />
          <span dir="ltr">{location.phone}</span>
        </a>
      ) : null}

      {location.email ? (
        <a
          href={`mailto:${location.email}`}
          className="flex items-center gap-2 text-body-sm text-stone-600 hover:text-foreground"
        >
          <Mail className="size-4 shrink-0" aria-hidden="true" />
          {location.email}
        </a>
      ) : null}
    </article>
  );
}
