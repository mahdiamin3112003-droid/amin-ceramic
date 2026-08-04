import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/app/admin/auth-shell";
import { LoginForm } from "@/app/admin/login/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Re-validated server-side even though middleware set it: `next` arrives
  // in a URL the user controls, and an unchecked value here is an open
  // redirect. Same rule as `signInSchema` — anything not a site-relative
  // /admin path is dropped rather than corrected.
  const safeNext = next && /^\/admin(?:\/[\w\-/]*)?$/.test(next) ? next : undefined;

  return (
    <AuthShell
      eyebrow="Secure access"
      title="Sign in"
      description="Your account is protected by two-factor authentication."
      footer={
        <Link
          href="/admin/forgot"
          className="rounded-sm underline decoration-white/30 underline-offset-4 transition-[color,text-decoration-color] duration-instant ease-material hover:text-white hover:decoration-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        >
          Forgotten your password?
        </Link>
      }
    >
      <LoginForm {...(safeNext ? { next: safeNext } : {})} />
    </AuthShell>
  );
}
