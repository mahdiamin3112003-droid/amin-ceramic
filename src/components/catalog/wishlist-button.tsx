"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  addToWishlistAction,
  removeFromWishlistAction,
} from "@/application/actions/wishlist-actions";
import { cn } from "@/lib/utils";

/**
 * Heart toggle — docs/02-ux-blueprint.md §3.2 card action row. Optimistic:
 * flips immediately, rolls back if the Server Action fails (visitor cookie
 * missing, network error) rather than leaving the user unsure whether the
 * click registered.
 */
export function WishlistButton({
  productId,
  initialWishlisted,
  className,
}: {
  productId: string;
  initialWishlisted: boolean;
  className?: string;
}) {
  const t = useTranslations("catalog.card");
  const [wishlisted, setWishlisted] = useState(initialWishlisted);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !wishlisted;
    setWishlisted(next);
    startTransition(() => {
      void (async () => {
        const result = next
          ? await addToWishlistAction({ productId })
          : await removeFromWishlistAction({ productId });
        if (!result.ok) setWishlisted(!next);
      })();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-pressed={wishlisted}
      aria-label={wishlisted ? t("removeFromWishlist") : t("addToWishlist")}
      className={cn(
        "flex size-11 items-center justify-center rounded-full bg-background/90 text-stone-600",
        "transition-surface duration-instant ease-material hover:bg-stone-50",
        "disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
    >
      <Heart
        className={cn("size-5", wishlisted && "fill-primary text-primary")}
        aria-hidden="true"
      />
    </button>
  );
}
