"use client";

import { useState, useTransition } from "react";

import { forgotPasswordAction } from "@/application/actions/auth-actions";
import { GlassField } from "@/app/admin/glass-field";
import { cn } from "@/lib/utils";

export function ForgotForm() {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      await forgotPasswordAction({ email: formData.get("email") });
      // Unconditionally — the action always reports success so this form
      // cannot be used to test whether an address is registered.
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-start gap-4"
        style={{
          animation: "scale-in var(--duration-base) var(--ease-material) both",
        }}
      >
        <span className="grid size-11 place-items-center rounded-full border border-cyan-400/35 bg-cyan-400/12">
          <SentGlyph />
        </span>
        <p className="text-body-sm leading-relaxed text-white/80">
          If that address belongs to a staff account, a reset link is on its way.
          Check your inbox — and your spam folder, since it comes from an automated
          sender.
        </p>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-6" noValidate>
      <GlassField
        name="email"
        label="Email"
        type="email"
        autoComplete="username"
        required
        spellCheck={false}
        placeholder="you@aminceramic.com"
        disabled={pending}
      />

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
          {pending ? "Sending" : "Send reset link"}
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
  );
}

function SentGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      // eslint-disable-next-line amin/no-cyan-text -- an ICON stroked with currentColor on the dark glass card, not text
      className="size-5 text-cyan-400"
    >
      <path
        d="M3.5 7.5 12 13l8.5-5.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="13"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}
