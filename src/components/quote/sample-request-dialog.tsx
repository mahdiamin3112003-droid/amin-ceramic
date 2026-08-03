"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { requestSampleAction } from "@/application/actions/sample-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Location } from "@/domain/inventory/entity";

type SampleType = "chip" | "full_tile" | "board";
type FulfilmentType = "ship" | "collect";

/**
 * PDP "Order a sample" — docs/02-ux-blueprint.md §3.3 action row. The
 * 3-per-30-days limit is a database trigger (Phase 1); a rejection surfaces
 * here as the generic `sampleFailed` message rather than a parsed count,
 * matching the use-case's own doc comment on why it doesn't re-check it.
 */
export function SampleRequestDialog({
  productId,
  locations,
}: {
  productId: string;
  locations: readonly Location[];
}) {
  const t = useTranslations("quote.sample");
  const [open, setOpen] = useState(false);
  const [sampleType, setSampleType] = useState<SampleType>("chip");
  const [fulfilmentType, setFulfilmentType] = useState<FulfilmentType>(
    locations.length > 0 ? "collect" : "ship",
  );
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [countryCode, setCountryCode] = useState("LB");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, startSubmitting] = useTransition();
  const [reference, setReference] = useState<string | null>(null);

  function submit() {
    setFormError(null);
    if (fulfilmentType === "collect" && !locationId) {
      setFormError(t("locationRequired"));
      return;
    }
    if (fulfilmentType === "ship" && !addressLine1.trim()) {
      setFormError(t("addressRequired"));
      return;
    }

    startSubmitting(() => {
      void (async () => {
        const result = await requestSampleAction({
          productId,
          sampleType,
          quantity: 1,
          fulfilmentType,
          locationId: fulfilmentType === "collect" ? locationId : undefined,
          shippingAddressLine1:
            fulfilmentType === "ship" ? addressLine1 : undefined,
          shippingCity: fulfilmentType === "ship" ? city || undefined : undefined,
          shippingCountryCode: fulfilmentType === "ship" ? countryCode : undefined,
        });
        if (result.ok) {
          setReference(result.data.reference);
          toast.success(t("submitted"));
        } else {
          setFormError(t("sampleFailed"));
        }
      })();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setReference(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        {reference ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("confirmedTitle")}</DialogTitle>
              <DialogDescription>{t("confirmedBody")}</DialogDescription>
            </DialogHeader>
            <p className="text-heading-sm">
              {t("reference")}: <span className="text-spec">{reference}</span>
            </p>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>{t("description")}</DialogDescription>
            </DialogHeader>

            <Field label={t("sampleTypeLabel")}>
              <Select
                value={sampleType}
                onValueChange={(v) => {
                  setSampleType(v as SampleType);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chip">{t("sampleType.chip")}</SelectItem>
                  <SelectItem value="full_tile">
                    {t("sampleType.full_tile")}
                  </SelectItem>
                  <SelectItem value="board">{t("sampleType.board")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-body-sm font-medium">
                {t("fulfilmentLabel")}
              </legend>
              <RadioGroup
                value={fulfilmentType}
                onValueChange={(v) => {
                  setFulfilmentType(v as FulfilmentType);
                }}
                className="flex gap-4"
              >
                {locations.length > 0 ? (
                  <label className="flex items-center gap-2 text-body-sm">
                    <RadioGroupItem value="collect" />
                    {t("fulfilment.collect")}
                  </label>
                ) : null}
                <label className="flex items-center gap-2 text-body-sm">
                  <RadioGroupItem value="ship" />
                  {t("fulfilment.ship")}
                </label>
              </RadioGroup>
            </fieldset>

            {fulfilmentType === "collect" ? (
              <Field label={t("locationLabel")}>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <>
                <Field label={t("addressLabel")} required>
                  <Input
                    value={addressLine1}
                    onChange={(e) => {
                      setAddressLine1(e.target.value);
                    }}
                  />
                </Field>
                <Field label={t("cityLabel")} optional>
                  <Input
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                    }}
                  />
                </Field>
                <Field label={t("countryLabel")} optional>
                  <Input
                    value={countryCode}
                    maxLength={2}
                    onChange={(e) => {
                      setCountryCode(e.target.value.toUpperCase());
                    }}
                  />
                </Field>
              </>
            )}

            {formError ? (
              <p role="alert" className="text-body-sm text-danger-600">
                {formError}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="primary"
                onClick={submit}
                loading={isSubmitting}
                loadingLabel={t("submitting")}
              >
                {t("submit")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
