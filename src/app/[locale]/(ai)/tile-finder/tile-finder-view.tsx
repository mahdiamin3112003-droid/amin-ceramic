"use client";

import { useCallback, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { ProductSummary } from "@/domain/product/entity";

/**
 * The Tile Finder — docs/02-ux-blueprint.md §3.4's four states.
 *
 * ── Why the analysing state lists real steps ──
 * §3.4: "must feel like work, not a spinner … each step ticks in as it
 * completes — perceived speed". That is not decoration here, it is load
 * bearing: the visual embedding runs on serverless inference that can cold
 * start into the minutes (measured at 212s worst case), so the wait is
 * genuinely long and a bare spinner would read as a hang. The ticks are
 * driven by the two real requests, never by a timer pretending to be
 * progress.
 *
 * ── Why STATE 4 is not an error state ──
 * At the current catalogue size a photo of something we do not stock is the
 * COMMON case, not the exception, and §3.4 designs for it explicitly. It
 * renders as a destination with somewhere to go, not as a failure.
 */

type Phase = "empty" | "analysing" | "results" | "rejected" | "error";

/**
 * The gate outcomes that have copy. Narrowed to a union rather than passed
 * through as a string so `t("gate.…")` stays a statically checked key — a
 * new gate result then fails the build instead of rendering a raw key at a
 * customer.
 */
type GateReason = "not_a_tile" | "too_dark" | "too_angled" | "unsafe" | "accepted";

const GATE_REASONS: readonly GateReason[] = [
  "not_a_tile",
  "too_dark",
  "too_angled",
  "unsafe",
  "accepted",
];

function asGateReason(value: unknown): GateReason {
  return typeof value === "string" &&
    (GATE_REASONS as readonly string[]).includes(value)
    ? (value as GateReason)
    : "not_a_tile";
}

interface Extracted {
  readonly colorFamily?: string | null;
  readonly surfaceLook?: string | null;
  readonly finish?: string | null;
  readonly formatGuess?: string | null;
}

interface Match {
  readonly productId: string;
  readonly percent: number;
  readonly band: "strong" | "moderate" | "weak" | "none";
  readonly explanation: string;
}

const MAX_BYTES = 10 * 1024 * 1024;

export function TileFinderView({
  catalogueSize,
  whatsappUrl,
}: {
  catalogueSize: number;
  whatsappUrl: string | null;
}) {
  const t = useTranslations("tileFinder");
  const locale = useLocale();

  const [phase, setPhase] = useState<Phase>("empty");
  const [preview, setPreview] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [matches, setMatches] = useState<readonly Match[]>([]);
  const [products, setProducts] = useState<readonly ProductSummary[]>([]);
  const [isConfident, setIsConfident] = useState(false);
  const [visualDegraded, setVisualDegraded] = useState(false);
  const [gate, setGate] = useState<GateReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = useCallback(
    async (file: File) => {
      if (file.size > MAX_BYTES) {
        setError(t("errors.tooLarge"));
        setPhase("error");
        return;
      }

      setPhase("analysing");
      setStep(1);
      setError(null);
      setPreview(URL.createObjectURL(file));

      try {
        const body = new FormData();
        body.append("image", file);
        const startRes = await fetch("/api/ai/tile-finder", {
          method: "POST",
          body,
        });
        const startJson: unknown = await startRes.json();
        const start = readData(startJson);

        if (!startRes.ok || start === null) {
          setError(readError(startJson) ?? t("errors.generic"));
          setPhase("error");
          return;
        }

        // The gate rejecting is a RESULT, not a failure — §3.4 STATE 4.
        if (start.accepted === false) {
          setGate(asGateReason(start.gate));
          setPhase("rejected");
          return;
        }

        setExtracted((start.attributes as Extracted | undefined) ?? null);
        setStep(2);

        const sessionId = String(start.sessionId);
        const matchRes = await fetch(
          `/api/ai/tile-finder/${sessionId}/match?locale=${encodeURIComponent(locale)}`,
          { method: "POST" },
        );
        const matchJson: unknown = await matchRes.json();
        const match = readData(matchJson);

        if (!matchRes.ok || match === null) {
          setError(readError(matchJson) ?? t("errors.generic"));
          setPhase("error");
          return;
        }

        setStep(3);
        const found = (match.matches as Match[] | undefined) ?? [];
        setMatches(found);
        setIsConfident(match.isConfident === true);
        setVisualDegraded(match.visualDegraded === true);

        // The products come back WITH the ranking. They used to be fetched
        // separately from /api/v1/products/compare, whose schema caps `ids`
        // at four for the compare table — so a twelve-result ranking 400'd
        // and every row rendered as nothing.
        setProducts((match.products as ProductSummary[] | undefined) ?? []);

        setStep(4);
        setPhase("results");
      } catch {
        setError(t("errors.generic"));
        setPhase("error");
      }
    },
    [t, locale],
  );

  function reset() {
    setPhase("empty");
    setPreview(null);
    setExtracted(null);
    setMatches([]);
    setProducts([]);
    setGate(null);
    setError(null);
    setStep(0);
  }

  // ── STATE 1 — EMPTY ────────────────────────────────────────────────────
  if (phase === "empty" || phase === "error") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-12 text-center">
        <div>
          <h1 className="text-display-sm font-display">{t("title")}</h1>
          <p className="mt-2 text-body text-stone-600">
            {/* The real number, not a design-time placeholder. */}
            {t("subtitle", { count: catalogueSize })}
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            className="w-full rounded-md border border-warning-600 bg-warning-50 p-4 text-body-sm text-warning-600"
          >
            {error}
          </p>
        ) : null}

        <label
          className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-md border-2 border-dashed border-stone-300 bg-stone-50 p-10 transition-surface duration-quick ease-material focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-navy-700 hover:border-navy-700"
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) void run(file);
          }}
        >
          <span className="text-body font-medium">{t("dropzone")}</span>
          <span className="text-caption text-stone-600">{t("hint")}</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void run(file);
            }}
          />
        </label>
      </div>
    );
  }

  // ── STATE 2 — ANALYSING ────────────────────────────────────────────────
  if (phase === "analysing") {
    const steps = [
      t("steps.reading"),
      extracted
        ? t("steps.detected", { summary: describe(extracted) })
        : t("steps.extracting"),
      t("steps.matching"),
      t("steps.ranking"),
    ];

    return (
      <div className="mx-auto grid max-w-3xl gap-8 py-12 sm:grid-cols-[minmax(0,16rem)_1fr] sm:items-start">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            className="aspect-square w-full rounded-md object-cover"
          />
        ) : null}

        <ol className="flex flex-col gap-3" aria-live="polite">
          {steps.map((label, index) => {
            const done = index < step;
            const active = index === step;
            return (
              <li
                key={label}
                className={cn(
                  "flex items-start gap-3 text-body-sm",
                  done ? "text-foreground" : "text-stone-600",
                )}
              >
                <span aria-hidden="true" className="mt-0.5">
                  {done ? "✓" : active ? "●" : "○"}
                </span>
                <span>{label}</span>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  // ── STATE 4 — the gate declined the photo ──────────────────────────────
  if (phase === "rejected") {
    return (
      <LowConfidence
        title={t(`gate.${gate ?? "not_a_tile"}` as const)}
        body={t("gate.advice")}
        onRetry={reset}
        whatsappUrl={whatsappUrl}
        t={t}
      />
    );
  }

  // ── STATE 4 — accepted, but nothing close enough ───────────────────────
  if (!isConfident) {
    return (
      <LowConfidence
        title={t("lowConfidence.title")}
        body={t("lowConfidence.body", { count: catalogueSize })}
        onRetry={reset}
        whatsappUrl={whatsappUrl}
        t={t}
        preview={preview}
      />
    );
  }

  // ── STATE 3 — RESULTS ──────────────────────────────────────────────────
  const byId = new Map(products.map((p) => [p.id as string, p]));
  const confident = matches.filter(
    (m) => m.band === "strong" || m.band === "moderate",
  );
  const considering = matches.filter((m) => m.band === "weak");

  return (
    <div className="mx-auto grid max-w-content gap-8 py-8 lg:grid-cols-[minmax(0,18rem)_1fr] lg:items-start">
      <aside className="flex flex-col gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            className="aspect-square w-full rounded-md object-cover"
          />
        ) : null}

        {extracted ? (
          <div>
            <h2 className="text-caption tracking-widest text-stone-600 uppercase">
              {t("detected")}
            </h2>
            <p className="mt-1 text-body-sm">{describe(extracted)}</p>
          </div>
        ) : null}

        {visualDegraded ? (
          // Never let a semantic-only ranking imply a visual comparison.
          <p className="rounded-md border border-warning-600 bg-warning-50 p-3 text-caption text-warning-600">
            {t("degraded")}
          </p>
        ) : null}

        <Button variant="secondary" size="sm" onClick={reset}>
          {t("tryAnother")}
        </Button>
      </aside>

      <div className="flex flex-col gap-6">
        <h1 className="font-display text-heading-lg">
          {t("results", { count: confident.length })}
        </h1>

        <ul className="flex flex-col gap-4">
          {confident.map((m) => (
            <MatchRow
              key={m.productId}
              match={m}
              product={byId.get(m.productId)}
              t={t}
            />
          ))}
        </ul>

        {considering.length > 0 ? (
          <>
            <h2 className="border-t border-border pt-6 text-caption tracking-widest text-stone-600 uppercase">
              {t("worthConsidering")}
            </h2>
            <ul className="flex flex-col gap-4">
              {considering.map((m) => (
                <MatchRow
                  key={m.productId}
                  match={m}
                  product={byId.get(m.productId)}
                  t={t}
                />
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}

function MatchRow({
  match,
  product,
  t,
}: {
  match: Match;
  product: ProductSummary | undefined;
  t: ReturnType<typeof useTranslations>;
}) {
  if (!product) return null;

  return (
    <li className="flex gap-4 rounded-md border border-border p-4">
      <div className="size-24 shrink-0 overflow-hidden rounded-sm bg-stone-100">
        {product.primaryImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.primaryImageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{ backgroundColor: product.colorHex ?? undefined }}
            aria-hidden="true"
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={`/products/${product.slug}`}
            className="text-body font-medium hover:underline"
          >
            {product.name}
          </Link>
          <Badge variant={match.band === "strong" ? "inStock" : "lowStock"}>
            {/* "about" — the mapping is provisional and must not read as precise. */}
            {t("approxMatch", { percent: match.percent })}
          </Badge>
        </div>

        <p className="text-caption text-stone-600">
          {product.nominalFormat ??
            `${String(product.widthMm)}×${String(product.heightMm)}`}{" "}
          · {product.finish.label} · {t("priceOnRequest")}
        </p>

        {match.explanation ? (
          <p className="mt-1 text-body-sm text-stone-600">{match.explanation}</p>
        ) : null}
      </div>
    </li>
  );
}

function LowConfidence({
  title,
  body,
  onRetry,
  whatsappUrl,
  t,
  preview,
}: {
  title: string;
  body: string;
  onRetry: () => void;
  whatsappUrl: string | null;
  t: ReturnType<typeof useTranslations>;
  preview?: string | null;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 py-16 text-center">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="size-40 rounded-md object-cover" />
      ) : null}

      <div>
        <h1 className="font-display text-heading-lg">{title}</h1>
        <p className="mt-2 text-body text-stone-600">{body}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={onRetry}>{t("tryAnother")}</Button>
        <Link
          href="/products"
          className={buttonVariants({ variant: "secondary", size: "md" })}
        >
          {t("browseInstead")}
        </Link>
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "ghost", size: "md" })}
          >
            {t("whatsapp")}
          </a>
        ) : null}
      </div>
    </div>
  );
}

/** A readable summary of what the model saw — only fields it actually reported. */
function describe(a: Extracted): string {
  return [a.colorFamily, a.surfaceLook, a.finish, a.formatGuess]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.replace(/_/g, " "))
    .join(" · ");
}

/** `jsonOk` wraps payloads in `{ data }`; `jsonError` in `{ error: { message } }`. */
function readData(json: unknown): Record<string, unknown> | null {
  if (typeof json !== "object" || json === null) return null;
  const data = (json as { data?: unknown }).data;
  return typeof data === "object" && data !== null
    ? (data as Record<string, unknown>)
    : null;
}

function readError(json: unknown): string | null {
  if (typeof json !== "object" || json === null) return null;
  const error = (json as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" ? error.message : null;
}
