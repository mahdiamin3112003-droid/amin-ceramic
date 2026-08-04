import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/app/admin/auth-shell";
import { TotpForm } from "@/app/admin/2fa/totp-form";
import { getCurrentStaff, hasEnrolledTotp } from "@/application/auth/session";

export const metadata: Metadata = { title: "Two-factor authentication" };

export default async function AdminTwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next && /^\/admin(?:\/[\w\-/]*)?$/.test(next) ? next : undefined;

  const session = await getCurrentStaff();
  // Middleware only checks that a Supabase session exists; whether the
  // account is staff is this layer's question.
  if (!session) redirect("/admin/login");

  // Nothing to do here — either they've already satisfied it or their roles
  // never required it. Sending them on rather than showing a dead form.
  if (session.mfaSatisfied) redirect(safeNext ?? "/admin");

  const enrolled = await hasEnrolledTotp();

  return (
    <AuthShell
      eyebrow="Second factor"
      title={
        enrolled ? "Two-factor authentication" : "Set up two-factor authentication"
      }
      description={
        enrolled
          ? "Enter the current code from your authenticator app."
          : "Your role requires a second factor before it can be used."
      }
    >
      <TotpForm enrolled={enrolled} {...(safeNext ? { next: safeNext } : {})} />
    </AuthShell>
  );
}
