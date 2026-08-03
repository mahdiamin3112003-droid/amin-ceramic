"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { addBasketItemAction } from "@/application/actions/basket-actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import type { QuantityEstimate } from "@/domain/quantity/calculator";

/**
 * "How much do I need?" — docs/02-ux-blueprint.md §3.3, the PDP's trust
 * moment. The arithmetic itself never runs here (docs/01-architecture.md
 * §6.4: "never client-side or in an LLM") — every recalculation is a fetch
 * to `/api/v1/products/[id]/quantity`, which wraps the same pure domain
 * functions the basket repository uses server-side.
 */
export function QuantityCalculator({
  productId,
  locale,
  unitPrice,
  currency,
  m2PerBox,
}: {
  productId: string;
  locale: string;
  unitPrice: number | null;
  currency: string;
  m2PerBox: number;
}) {
  const t = useTranslations("catalog.calculator");
  const [areaM2, setAreaM2] = useState("");
  const [wastagePct, setWastagePct] = useState("");
  const [estimate, setEstimate] = useState<QuantityEstimate | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [isCalculating, startCalculating] = useTransition();
  const [isAdding, startAdding] = useTransition();

  useEffect(() => {
    const parsedArea = Number(areaM2);
    if (!areaM2 || !(parsedArea > 0)) {
      setEstimate(null);
      setCalcError(null);
      return;
    }

    const params = new URLSearchParams({ locale, areaM2: String(parsedArea) });
    if (wastagePct) params.set("wastagePct", wastagePct);

    const timeout = setTimeout(() => {
      startCalculating(() => {
        void (async () => {
          const response = await fetch(
            `/api/v1/products/${productId}/quantity?${params.toString()}`,
          );
          if (!response.ok) {
            setEstimate(null);
            setCalcError(t("error"));
            return;
          }
          const { data } = (await response.json()) as { data: QuantityEstimate };
          setEstimate(data);
          setCalcError(null);
        })();
      });
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [areaM2, wastagePct, locale, productId, t]);

  function addToBasket() {
    if (!estimate) return;
    startAdding(() => {
      void (async () => {
        const result = await addBasketItemAction({
          productId,
          requiredM2: estimate.areaWithWastageM2,
        });
        if (result.ok) toast.success(t("addedToBasket"));
        else toast.error(t("addToBasketFailed"));
      })();
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border p-5">
      <h2 className="text-heading-sm">{t("heading")}</h2>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t("areaLabel")} helper={t("areaHelper")}>
          <Input
            inputMode="decimal"
            value={areaM2}
            onChange={(e) => {
              setAreaM2(e.target.value);
            }}
            placeholder="8.2"
          />
        </Field>
        <Field
          label={t("wastageLabel")}
          optional
          optionalLabel={t("wastageDefault")}
        >
          <Input
            inputMode="decimal"
            value={wastagePct}
            onChange={(e) => {
              setWastagePct(e.target.value);
            }}
            placeholder="10"
          />
        </Field>
      </div>

      {calcError ? (
        <p className="text-body-sm text-danger-600">{calcError}</p>
      ) : null}

      {estimate ? (
        <dl className="flex flex-col gap-1 border-t border-border pt-4 text-spec">
          <div className="flex justify-between">
            <dt className="text-stone-600">{t("areaNeeded")}</dt>
            <dd>{estimate.areaWithWastageM2.toFixed(2)} m²</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-600">{t("boxes")}</dt>
            <dd>{estimate.boxes}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-600">{t("weight")}</dt>
            <dd>{estimate.weightKg.toFixed(1)} kg</dd>
          </div>
          {unitPrice !== null ? (
            <div className="flex justify-between font-medium">
              <dt>{t("estimatedTotal")}</dt>
              {/* Priced on the boxes actually charged (rounded up), matching
                  what addBasketItem will bill — not the raw wastage-adjusted
                  area, which would understate the real total. */}
              <dd>
                {currency} {(estimate.boxes * m2PerBox * unitPrice).toFixed(2)}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <Button
        type="button"
        variant="primary"
        onClick={addToBasket}
        disabled={!estimate}
        loading={isAdding || isCalculating}
        loadingLabel={t("addingToBasket")}
      >
        {t("addToBasket")}
      </Button>
    </div>
  );
}
