"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { signInAction } from "@/application/actions/auth-actions";
import {
  GlassCheckbox,
  GlassField,
  GlassPasswordField,
} from "@/app/admin/glass-field";
import { cn } from "@/lib/utils";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await signInAction({
        email: formData.get("email"),
        password: formData.get("password"),
        // "on" when ticked, absent when not — see the note on the control.
        rememberMe: formData.get("rememberMe") === "on",
        // Omitted rather than null: the schema marks it optional, and null
        // would fail the pattern check.
        ...(next ? { next } : {}),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push(result.data.next);
      // The session cookie was set by a Server Action, so the Router Cache
      // still holds the signed-out render of the destination.
      router.refresh();
    });
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
        // Not `autoFocus`: React does not emit it server-side, which produced
        // a hydration mismatch in Phase 3. Browsers focus the first field
        // readily enough that a ref-and-effect is not worth the cost here.
        placeholder="you@aminceramic.com"
        disabled={pending}
      />

      <GlassPasswordField
        name="password"
        label="Password"
        autoComplete="current-password"
        required
        placeholder="••••••••••••"
        disabled={pending}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/*
          A real control, not decoration. Unticked, the session cookies are
          written without Max-Age so they expire when the browser closes —
          which is what "remember me" has always meant. See
          `auth-actions.ts`; a checkbox that changed nothing would be worse
          than no checkbox.
        */}
        <GlassCheckbox
          name="rememberMe"
          label="Keep me signed in"
          disabled={pending}
        />
      </div>

      {error ? (
        // `assertive`: the message replaces content the user is waiting on,
        // so it must interrupt rather than queue behind other announcements.
        <p
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2.5 rounded-md border border-danger-600/35 bg-danger-600/12 p-3.5 text-body-sm text-white"
          style={{
            animation: "scale-in var(--duration-quick) var(--ease-material) both",
          }}
        >
          <AlertGlyph />
          {error}
        </p>
      ) : null}

      <SubmitButton pending={pending} />
    </form>
  );
}

/**
 * Submit control.
 *
 * The pending state is the point: a sheen crosses the button on a loop and
 * the label changes to something that describes the work. `aria-busy` and
 * a polite live region carry the same information to a screen reader, so
 * the reassurance is not purely visual.
 *
 * `disabled` while pending prevents the double-submit that would otherwise
 * fire two sign-in requests on a slow connection.
 */
function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <div className="flex flex-col gap-3">
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
        <span className="relative z-10 flex items-center justify-center gap-2.5">
          {pending ? <DiamondSpinner /> : null}
          {pending ? "Verifying credentials" : "Sign in"}
        </span>

        {/* Idle: a cyan wash that grows from the inline-start edge on hover. */}
        {/* Pending: the sheen. Only mounted while pending, so nothing
            animates on an idle screen. */}
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

      <span aria-live="polite" className="sr-only">
        {pending ? "Verifying credentials, please wait" : ""}
      </span>
    </div>
  );
}

/** The brand mark as a spinner — a rotating diamond, not a generic ring. */
function DiamondSpinner() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 animate-spin">
      <path
        d="M8 1.2 14.8 8 8 14.8 1.2 8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeDasharray="30 14"
      />
    </svg>
  );
}

function AlertGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="mt-0.5 size-4 shrink-0"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 7.5v5.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.4" r="1" fill="currentColor" />
    </svg>
  );
}
