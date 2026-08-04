import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/app/admin/auth-shell";
import { ForgotForm } from "@/app/admin/forgot/forgot-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function AdminForgotPage() {
  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      description="We'll email you a link to choose a new one. It expires in one hour."
      footer={
        <Link
          href="/admin/login"
          className="rounded-sm underline decoration-white/30 underline-offset-4 transition-[color,text-decoration-color] duration-instant ease-material hover:text-white hover:decoration-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        >
          Back to sign in
        </Link>
      }
    >
      <ForgotForm />
    </AuthShell>
  );
}
