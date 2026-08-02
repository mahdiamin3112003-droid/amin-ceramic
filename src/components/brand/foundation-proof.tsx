import { useTranslations } from "next-intl";

import { Diamond } from "@/components/brand/diamond";
import { Badge, MatchBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tenant } from "@/domain/tenant/entity";
import { contrastRatioRounded, wcagGrade } from "@/lib/utils";
import { readBrandRamp, readTokens, resolveColour } from "@/lib/utils/tokens";

/**
 * The visible proof that Phase 0 holds together.
 *
 * Every value shown here is derived rather than transcribed: the contrast
 * figures are computed from the token hexes at render time, so if a token
 * changes the page tells the truth about it immediately.
 */

const TYPE_STEPS = [
  { token: "display-xl", cls: "font-display text-display-xl" },
  { token: "display-lg", cls: "font-display text-display-lg" },
  { token: "display-md", cls: "font-display text-display-md" },
  { token: "heading-lg", cls: "text-heading-lg" },
  { token: "heading-md", cls: "text-heading-md" },
  { token: "heading-sm", cls: "text-heading-sm" },
  { token: "body-lg", cls: "text-body-lg" },
  { token: "body", cls: "text-body" },
  { token: "body-sm", cls: "text-body-sm" },
  { token: "caption", cls: "text-caption" },
] as const;

const MOTION = [
  { token: "duration-instant", value: "120ms" },
  { token: "duration-quick", value: "240ms" },
  { token: "duration-base", value: "420ms" },
  { token: "duration-slow", value: "800ms" },
  { token: "duration-cinema", value: "4200ms" },
  { token: "ease-material", value: "cubic-bezier(.32,.72,0,1)" },
  { token: "ease-out-quart", value: "cubic-bezier(.25,1,.5,1)" },
  { token: "ease-in-out-quart", value: "cubic-bezier(.76,0,.24,1)" },
  { token: "ease-exit", value: "cubic-bezier(.4,0,1,1)" },
] as const;

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border px-gutter py-12">
      <div className="mx-auto flex max-w-content flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="flex items-center gap-3 text-heading-lg">
            <Diamond className="size-3 text-navy-700" />
            {title}
          </h2>
          {note ? (
            <p className="max-w-prose text-body-sm text-stone-600">{note}</p>
          ) : null}
        </div>
        {children}
      </div>
    </section>
  );
}

export function FoundationProof({
  locale,
  direction,
  tenant,
  tenantError,
}: {
  locale: string;
  direction: "ltr" | "rtl";
  tenant: Tenant | null;
  tenantError: string | null;
}) {
  const t = useTranslations("foundation");

  // Both the swatches and the ground they are measured against come from the
  // token file, so this section cannot disagree with what the product ships.
  const tokens = readTokens();
  const ramp = readBrandRamp(tokens);
  const white = resolveColour("--color-white", tokens.all);

  return (
    <>
      {/* ── Hero: display type in whichever script the locale uses ─────────── */}
      <section className="px-gutter py-16">
        <div className="mx-auto flex max-w-content flex-col gap-6">
          <h1 className="max-w-[16ch] font-display text-display-lg">
            {t("title")}
          </h1>
          <p className="max-w-prose text-body-lg text-stone-600">{t("lede")}</p>
          <p className="text-spec text-stone-600">
            lang={locale} · dir={direction}
          </p>
        </div>
      </section>

      {/* ── Database ──────────────────────────────────────────────────────── */}
      <Section title={t("sections.tenant")} note={t("tenant.note")}>
        {tenant ? (
          <dl className="grid gap-x-8 gap-y-3 rounded-md border border-border p-6 sm:grid-cols-2">
            {(
              [
                ["tenant.name", tenant.name],
                ["tenant.slug", tenant.slug],
                ["tenant.locales", tenant.supportedLocales.join(", ")],
                ["tenant.currency", tenant.defaultCurrency],
                ["tenant.wastage", `${String(tenant.defaultWastagePct)}%`],
                ["tenant.measurement", tenant.measurementSystem],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="flex flex-col gap-1">
                <dt className="text-caption text-stone-600">{t(key)}</dt>
                <dd className="text-spec">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="flex flex-col gap-2 rounded-md border border-warning-600 bg-warning-50 p-6">
            <p className="text-body text-warning-600">{t("tenant.unavailable")}</p>
            <p className="text-body-sm text-stone-600">
              {t("tenant.unavailableNote")}
            </p>
            {tenantError ? (
              <p className="text-spec-sm text-stone-600">{tenantError}</p>
            ) : null}
          </div>
        )}
      </Section>

      {/* ── Colour, with live contrast ────────────────────────────────────── */}
      <Section title={t("sections.colour")} note={t("colour.note")}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {ramp.map(({ token, hex, note }) => {
            const ratio = contrastRatioRounded(hex, white);
            const grade = wcagGrade(hex, white);
            return (
              <li
                key={token}
                className="overflow-hidden rounded-md border border-border"
              >
                <div className="h-14 w-full" style={{ backgroundColor: hex }} />
                <div className="flex flex-col gap-0.5 p-3">
                  <span className="text-spec-sm">{token}</span>
                  <span className="text-spec-sm text-stone-600">
                    {ratio}:1 {t("colour.onWhite")}
                  </span>
                  <span
                    className={
                      grade === "Fail"
                        ? "text-spec-sm text-danger-600"
                        : "text-spec-sm text-success-600"
                    }
                  >
                    {grade}
                    {note ? ` · ${note}` : ""}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="max-w-prose rounded-md bg-cyan-50 p-4 text-body-sm text-stone-800">
          {t("colour.cyanRule")}
        </p>
      </Section>

      {/* ── Type ──────────────────────────────────────────────────────────── */}
      <Section title={t("sections.type")} note={t("type.note")}>
        <ul className="flex flex-col gap-4">
          {TYPE_STEPS.map(({ token, cls }) => (
            <li
              key={token}
              className="flex flex-col gap-1 border-b border-border pb-4 last:border-0"
            >
              <span className="text-spec-sm text-stone-600">{token}</span>
              <span className={cls}>{t("type.sample")}</span>
            </li>
          ))}
          <li className="flex flex-col gap-1">
            <span className="text-spec-sm text-stone-600">
              spec · JetBrains Mono, tabular-nums
            </span>
            <span className="text-spec">{t("type.specSample")}</span>
          </li>
        </ul>
      </Section>

      {/* ── Primitives ────────────────────────────────────────────────────── */}
      <Section title={t("sections.primitives")}>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="text">Text</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <Button variant="primary" loading loadingLabel="Loading">
            Loading
          </Button>
          <Button variant="icon" iconOnly aria-label="Diamond">
            <Diamond />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="inStock">In stock</Badge>
          <Badge variant="lowStock">Low stock</Badge>
          <Badge variant="outOfStock">Out of stock</Badge>
          <Badge variant="new">New</Badge>
          <Badge variant="bestSeller">Best seller</Badge>
          <Badge variant="outdoor">Outdoor</Badge>
          <Badge variant="slip">R11 anti-slip</Badge>
          <Badge variant="shade" shadeLevel={3}>
            V3 shade
          </Badge>
          <Badge variant="tradeOnly">Trade only</Badge>
          <Badge variant="discontinued">Discontinued</Badge>
          <Badge variant="aiGenerated">AI generated</Badge>
          <MatchBadge value={94} reason="Same warm beige and matte finish." />
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          <Field label="Room width" helper="e.g. 2.4">
            <Input inputMode="decimal" placeholder="2.4" />
          </Field>
          <Field label="SKU" error="No product matches that SKU.">
            <Input defaultValue="AC-0000-XX" className="font-mono" />
          </Field>
          <Field label="Email" required>
            <Input type="email" success defaultValue="amin@example.com" />
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-caption text-stone-600">Skeleton</span>
          <div className="flex gap-3">
            <Skeleton className="h-24 w-32" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/4" />
            </div>
          </div>
        </div>
      </Section>

      {/* ── Logical properties ────────────────────────────────────────────── */}
      <Section title={t("sections.logical")} note={t("logical.note")}>
        <div className="flex gap-6">
          {/* Built entirely from logical properties: the rail lands on the
              inline start, which is the left in English and the right in Arabic,
              with no conditional styling anywhere. */}
          <aside className="w-40 shrink-0 rounded-md border-e border-border bg-stone-50 p-4">
            <span className="text-caption text-stone-600">{t("logical.rail")}</span>
          </aside>
          <div className="flex-1 rounded-md border border-border p-6 ps-2">
            <span className="text-caption text-stone-600">
              {t("logical.content")}
            </span>
            <div className="mt-4 flex items-center gap-3">
              <Diamond className="size-8 text-navy-700" />
              <span className="text-body-sm text-stone-600">
                The diamond does not mirror — brand geometry never does.
              </span>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Focus ─────────────────────────────────────────────────────────── */}
      <Section title={t("sections.focus")} note={t("focus.note")}>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary">Tab to me</Button>
          <Button variant="ghost">Then me</Button>
          <a
            href="#main"
            className="text-body text-primary underline underline-offset-4"
          >
            And this link
          </a>
        </div>
        <div
          data-ground="dark"
          className="flex flex-col gap-3 rounded-lg bg-navy-900 p-6"
        >
          {/* eslint-disable-next-line amin/no-cyan-text -- on navy-900, 11.6:1 */}
          <p className="text-body-sm text-cyan-100">{t("focus.onDark")}</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-md bg-navy-700 px-4 py-2 text-body-sm text-white hover:bg-navy-800"
            >
              On a dark ground
            </button>
            <button
              type="button"
              className="rounded-md border border-cyan-400 px-4 py-2 text-body-sm text-white"
            >
              And here
            </button>
          </div>
        </div>
      </Section>

      {/* ── Motion ────────────────────────────────────────────────────────── */}
      <Section title={t("sections.motion")} note={t("motion.note")}>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MOTION.map(({ token, value }) => (
            <li
              key={token}
              className="flex items-baseline justify-between gap-4 rounded-md border border-border p-3"
            >
              <span className="text-spec-sm">{token}</span>
              <span className="text-spec-sm text-stone-600">{value}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
