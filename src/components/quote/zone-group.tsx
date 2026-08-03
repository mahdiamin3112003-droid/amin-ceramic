import { useTranslations } from "next-intl";

import { BasketItemRow } from "@/components/quote/basket-item-row";
import type { QuoteZoneGroup } from "@/domain/quote/entity";

/** docs/02-ux-blueprint.md §3.7: zone (room) grouping — "what turns a cart into a project document." */
export function ZoneGroupSection({
  group,
  currency,
}: {
  group: QuoteZoneGroup;
  currency: string | null;
}) {
  const t = useTranslations("quote.basket");

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <h2 className="text-heading-sm">{group.zone?.name ?? t("unassigned")}</h2>
        <span className="text-spec text-stone-600">
          {currency ?? ""} {group.zoneTotal.toFixed(2)}
        </span>
      </div>
      <div className="flex flex-col">
        {group.items.map((item) => (
          <BasketItemRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
