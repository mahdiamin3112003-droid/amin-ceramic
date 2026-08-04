import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

// Same order Next.js uses — a prisma.config.ts disables Prisma's own .env
// loading, so scripts have to do it themselves (see prisma/seed.ts).
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    // Absent is fine — CI supplies the variables directly.
  }
}

/**
 * Create the first owner account.
 *
 * Phase 1's seed creates the role and permission vocabulary but no PEOPLE —
 * correctly, since a seeded staff account with a known password is a
 * back door that follows the project into production. The consequence is
 * that a fresh environment has no way to sign in at all, and this script is
 * how that chicken-and-egg is broken. Run it once per environment.
 *
 * It does three things, in this order, because each depends on the last:
 *   1. creates the Supabase Auth user (the credential),
 *   2. creates the `app_user` row linked to it by `auth_user_id`
 *      (the authority — a Supabase account alone grants nothing),
 *   3. assigns the `owner` role.
 *
 * THE PASSWORD IS READ FROM THE ENVIRONMENT and never written anywhere.
 * Pass it on the command line for one invocation:
 *
 *   OWNER_EMAIL=you@example.com OWNER_PASSWORD='...' pnpm db:bootstrap-owner
 *
 * The owner role holds `role.manage`, so every subsequent account is
 * invited through the admin UI rather than through this script.
 *
 * Because `owner` holds mutating permissions, the account will be required
 * to enrol TOTP on first sign-in (docs/04 §4.3). That is expected — have an
 * authenticator app ready.
 */
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.OWNER_EMAIL;
  const password = process.env.OWNER_PASSWORD;
  const fullName = process.env.OWNER_NAME ?? null;

  if (!email || !password) {
    throw new Error(
      "Set OWNER_EMAIL and OWNER_PASSWORD.\n" +
        "  OWNER_EMAIL=you@example.com OWNER_PASSWORD='...' pnpm db:bootstrap-owner",
    );
  }
  if (password.length < 12) {
    // Enforced here rather than left to Supabase's default (6): this account
    // can do everything, including granting roles to others.
    throw new Error("OWNER_PASSWORD must be at least 12 characters");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }

  const tenant = await prisma.tenant.findFirst({
    where: { status: "active" },
    select: { id: true, name: true },
  });
  if (!tenant) throw new Error("No active tenant — run `pnpm db:seed` first");

  // Roles are TENANT-SCOPED: `UNIQUE (tenant_id, key)`, never `UNIQUE (key)`
  // — CLAUDE.md's rule for every uniqueness constraint in this schema. So
  // `key: "owner"` alone is not a unique lookup.
  const ownerRole = await prisma.role.findUnique({
    where: { tenantId_key: { tenantId: tenant.id, key: "owner" } },
    select: { id: true },
  });
  if (!ownerRole)
    throw new Error("The `owner` role is missing — run `pnpm db:seed` first");

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Idempotent: re-running against an existing address re-links and re-grants
  // rather than failing, which is what you want when a first attempt died
  // halfway through.
  const existing = await prisma.appUser.findFirst({
    where: { tenantId: tenant.id, email },
    select: { id: true, authUserId: true },
  });

  let authUserId = existing?.authUserId ?? null;

  if (!authUserId) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      // Confirmed immediately: there is no inbox to click through on a
      // freshly provisioned environment, and this is a deliberate,
      // operator-run action rather than a self-service signup.
      email_confirm: true,
    });

    if (error) {
      throw new Error(`Could not create the Supabase auth user: ${error.message}`);
    }
    authUserId = data.user.id;
    console.log(`  created Supabase auth user ${authUserId}`);
  } else {
    console.log(`  reusing existing Supabase auth user ${authUserId}`);
  }

  const appUser = existing
    ? await prisma.appUser.update({
        where: { id: existing.id },
        // `deletedAt: null` so re-running also un-deletes a soft-deleted owner
        // — the situation this script exists to rescue.
        data: { authUserId, fullName, status: "active", deletedAt: null },
        select: { id: true },
      })
    : await prisma.appUser.create({
        data: {
          tenantId: tenant.id,
          authUserId,
          email,
          fullName,
          // `staff`, not `customer` — this is a back-office account. The
          // column distinguishes the two populations that share `app_user`.
          userType: "staff",
          status: "active",
        },
        select: { id: true },
      });

  await prisma.userRole.upsert({
    where: { appUserId_roleId: { appUserId: appUser.id, roleId: ownerRole.id } },
    create: { appUserId: appUser.id, roleId: ownerRole.id },
    update: {},
  });

  console.log(`\n  ${email} is now an owner of ${tenant.name}.`);
  console.log(
    "  Sign in at /admin/login — you will be asked to enrol an authenticator.\n",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
