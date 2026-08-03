"use client";

import { useState, useTransition, type SyntheticEvent } from "react";
import { useTranslations } from "next-intl";

import { submitQuoteRequestAction } from "@/application/actions/quote-actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";

/**
 * `/basket/request` — docs/04-api-architecture.md §11.2. `website` is a
 * honeypot: rendered off-screen, never filled by a real visitor, checked
 * server-side in `submitQuoteRequestAction`.
 */
export function QuoteRequestForm() {
  const t = useTranslations("quote.request");
  const router = useRouter();
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, startSubmitting] = useTransition();

  function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!contactName.trim()) {
      setFormError(t("nameRequired"));
      return;
    }
    if (!contactEmail.trim() && !contactPhone.trim()) {
      setFormError(t("contactRequired"));
      return;
    }
    setFormError(null);

    startSubmitting(() => {
      void (async () => {
        const result = await submitQuoteRequestAction({
          contactName,
          contactEmail: contactEmail || undefined,
          contactPhone: contactPhone || undefined,
          companyName: companyName || undefined,
          notes: notes || undefined,
          source: "catalog",
          website,
        });
        if (result.ok) {
          const query = result.data.whatsappDeepLink
            ? `?wa=${encodeURIComponent(result.data.whatsappDeepLink)}`
            : "";
          router.push(`/basket/request/sent/${result.data.reference}${query}`);
        } else {
          setFormError(t("submitFailed"));
        }
      })();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-5">
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => {
            setWebsite(e.target.value);
          }}
        />
      </div>

      <Field label={t("nameLabel")} required>
        <Input
          value={contactName}
          onChange={(e) => {
            setContactName(e.target.value);
          }}
        />
      </Field>
      <Field label={t("emailLabel")} optional>
        <Input
          type="email"
          value={contactEmail}
          onChange={(e) => {
            setContactEmail(e.target.value);
          }}
        />
      </Field>
      <Field label={t("phoneLabel")} optional helper={t("phoneHelper")}>
        <Input
          type="tel"
          value={contactPhone}
          onChange={(e) => {
            setContactPhone(e.target.value);
          }}
        />
      </Field>
      <Field label={t("companyLabel")} optional>
        <Input
          value={companyName}
          onChange={(e) => {
            setCompanyName(e.target.value);
          }}
        />
      </Field>
      <Field label={t("notesLabel")} optional>
        <Input
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
        />
      </Field>

      {formError ? (
        <p role="alert" className="text-body-sm text-danger-600">
          {formError}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        loading={isSubmitting}
        loadingLabel={t("submitting")}
      >
        {t("submit")}
      </Button>
    </form>
  );
}
