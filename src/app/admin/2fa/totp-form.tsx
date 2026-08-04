"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  confirmTotpEnrolmentAction,
  startTotpEnrolmentAction,
  verifyTotpAction,
} from "@/application/actions/auth-actions";
import { GlassField } from "@/app/admin/glass-field";
import { cn } from "@/lib/utils";

/**
 * One component, two jobs — because from the user's side they are the same
 * job: prove you hold the second factor. Someone who has never enrolled
 * gets the QR code first; everyone else goes straight to the code field.
 *
 * `enrolled` is resolved on the server, so the QR code is never fetched for
 * a user who does not need it.
 */
export function TotpForm({ enrolled, next }: { enrolled: boolean; next?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<{
    factorId: string;
    qrCodeSvg: string;
    secret: string;
  } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // Enrolment starts as soon as the screen opens for an un-enrolled user —
  // there is no meaningful "begin setup" decision to offer them, since the
  // alternative is being unable to work.
  useEffect(() => {
    if (enrolled) return;
    let cancelled = false;

    void startTotpEnrolmentAction().then((result) => {
      if (cancelled) return;
      if (result.ok) setSetup(result.data);
      else setError(result.error);
    });

    return () => {
      cancelled = true;
    };
  }, [enrolled]);

  // Focus by ref rather than `autoFocus` — see the note in login-form.tsx.
  useEffect(() => {
    if (enrolled || setup) codeRef.current?.focus();
  }, [enrolled, setup]);

  function onSubmit(formData: FormData) {
    setError(null);
    const code = formData.get("code");

    startTransition(async () => {
      // Enrolling: confirming the factor also raises the session to aal2,
      // so a second challenge would be rejected.
      if (setup) {
        const confirmed = await confirmTotpEnrolmentAction({
          factorId: setup.factorId,
          code,
        });
        if (!confirmed.ok) {
          setError(confirmed.error);
          return;
        }
        router.push(next ?? "/admin");
        router.refresh();
        return;
      }

      const result = await verifyTotpAction({ code, ...(next ? { next } : {}) });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(result.data.next);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {setup ? (
        <div
          className="flex flex-col gap-4"
          style={{
            animation: "scale-in var(--duration-base) var(--ease-material) both",
          }}
        >
          <p className="text-body-sm leading-relaxed text-white/75">
            Scan this with your authenticator app, then enter the code it shows.
          </p>
          {/*
            White plate behind the code: a QR must be dark-on-light to scan,
            and on a dark glass card it would otherwise be unreadable by the
            camera. Supabase returns a data: URI, so `next/image` would add
            an optimisation round trip for something already inline.
          */}
          <div className="self-start rounded-xl bg-white p-3 shadow-[0_16px_40px_-16px_rgb(6_10_32/0.8)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={setup.qrCodeSvg}
              alt="Authenticator setup QR code"
              className="size-40"
              width={160}
              height={160}
            />
          </div>
          <details className="group text-body-sm text-white/75">
            <summary className="cursor-pointer rounded-sm marker:text-white/40 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400">
              Can&rsquo;t scan it?
            </summary>
            <p className="mt-2 text-white/70">Enter this key manually:</p>
            <code className="mt-2 block rounded-md border border-white/12 bg-white/6 p-2.5 text-caption font-mono tracking-wider break-all text-white/85 select-all">
              {setup.secret}
            </code>
          </details>
        </div>
      ) : null}

      {enrolled || setup ? (
        <form action={onSubmit} className="flex flex-col gap-6" noValidate>
          <GlassField
            ref={codeRef}
            id="code"
            name="code"
            label="Six-digit code"
            hint="From your authenticator app. It changes every 30 seconds."
            // `inputMode` + `one-time-code` gets the numeric keypad on mobile
            // and lets iOS offer the code straight from the authenticator.
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            placeholder="000000"
            disabled={pending}
            className="text-center indent-[0.75em] font-mono text-body-lg tracking-[0.75em] tabular-nums"
          />

          {error ? (
            <p
              role="alert"
              aria-live="assertive"
              className="rounded-md border border-danger-600/35 bg-danger-600/12 p-3.5 text-body-sm text-white"
              style={{
                animation:
                  "scale-in var(--duration-quick) var(--ease-material) both",
              }}
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className={cn(
              "group relative h-12 w-full overflow-hidden rounded-md text-body font-medium text-navy-900",
              // A gradient, not a flat fill: the top edge catches light like a
              // physical key would.
              "bg-linear-to-b from-white to-stone-100",
              "transition-[transform,box-shadow,filter] duration-quick ease-material",
              // Rests on a contact shadow; on hover it lifts 2px and the cyan
              // glow arrives with it, so the lift and the light are one gesture.
              "shadow-key",
              "hover:-translate-y-0.5 hover:brightness-[1.02]",
              "hover:shadow-key-hover",
              // Settles back below its resting point on press — no overshoot,
              // because tile is heavy (docs/02 §5.9).
              "active:translate-y-0 active:scale-[0.99]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400",
              "disabled:cursor-wait disabled:hover:translate-y-0",
            )}
          >
            <span className="relative z-10">
              {pending ? "Verifying" : setup ? "Confirm and continue" : "Verify"}
            </span>
            {pending ? (
              <span
                aria-hidden
                className="absolute w-1/3 bg-linear-to-r from-transparent via-cyan-400/45 to-transparent"
                style={{
                  insetBlock: 0,
                  animation: "button-sheen 1150ms var(--ease-material) infinite",
                }}
              />
            ) : null}
          </button>
        </form>
      ) : (
        <p aria-live="polite" className="text-body-sm text-white/75">
          Preparing authenticator setup&hellip;
        </p>
      )}
    </div>
  );
}
