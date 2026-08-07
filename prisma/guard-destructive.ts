import path from "node:path";

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
 * The gate in front of `pnpm db:reset`.
 *
 * ── Why this exists ──
 * `prisma migrate reset` drops every table and re-seeds. Today one Supabase
 * project serves both development and whatever is deployed, so the command
 * a developer runs from habit at 2am is the same command that would empty
 * the live catalogue, the quote requests and every staff account. The e2e
 * fixtures already carry an interlock (`assertIsTestAccount`); the single
 * most destructive command in the repository carried none.
 *
 * ── Fail closed ──
 * If `PRODUCTION_SUPABASE_PROJECT_REF` is not set, this REFUSES. That is
 * deliberate and it is the whole point: an unset marker means we cannot
 * prove the target is not production, and "cannot prove it is safe" must
 * not read as "safe". It is also the honest response to sharing one project
 * between dev and prod — while that is true, every reset should require a
 * conscious override.
 *
 * Once a separate development project exists, a developer's `.env.local`
 * points at a ref that differs from the production one and resets run
 * freely again, with no flag and no ceremony.
 */

const OVERRIDE_VARIABLE = "I_UNDERSTAND_THIS_DESTROYS_PRODUCTION_DATA";
const OVERRIDE_VALUE = "yes";

/**
 * Pull the Supabase project ref out of a Postgres connection string.
 *
 * Supabase writes it in one of two places depending on the connection:
 *   pooler — `postgresql://postgres.<ref>:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`
 *   direct — `postgresql://postgres:pw@db.<ref>.supabase.co:5432/postgres`
 *
 * Returns null when the URL is unparseable or is not a Supabase host, which
 * the caller treats as "unknown", never as "safe".
 */
export function projectRefFromDatabaseUrl(url: string | undefined): string | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // `postgres.<ref>` — the pooler encodes the project in the username.
  const username = decodeURIComponent(parsed.username);
  const dotted = /^postgres\.([a-z0-9]+)$/.exec(username);
  if (dotted?.[1]) return dotted[1];

  // `db.<ref>.supabase.co` — the direct connection encodes it in the host.
  const host = /^db\.([a-z0-9]+)\.supabase\.(co|com)$/.exec(parsed.hostname);
  if (host?.[1]) return host[1];

  return null;
}

export type GuardDecision =
  | { readonly allowed: true; readonly reason: string }
  | { readonly allowed: false; readonly reason: string };

export function decide({
  targetUrl,
  productionRef,
  override,
}: {
  targetUrl: string | undefined;
  productionRef: string | undefined;
  override: string | undefined;
}): GuardDecision {
  const overridden = override === OVERRIDE_VALUE;
  const targetRef = projectRefFromDatabaseUrl(targetUrl);

  if (!productionRef) {
    return overridden
      ? {
          allowed: true,
          reason: `no production project is marked, but ${OVERRIDE_VARIABLE} was set`,
        }
      : {
          allowed: false,
          reason:
            `PRODUCTION_SUPABASE_PROJECT_REF is not set, so this cannot tell whether ` +
            `${targetRef ?? "the configured database"} is production.\n\n` +
            `  Set it in .env.local to the project ref that must never be reset:\n` +
            `      PRODUCTION_SUPABASE_PROJECT_REF="abcdefghijklmnop"\n\n` +
            `  It is the subdomain of NEXT_PUBLIC_SUPABASE_URL — no secret, safe to share.`,
        };
  }

  if (targetRef === null) {
    return overridden
      ? {
          allowed: true,
          reason: `target project could not be identified, overridden`,
        }
      : {
          allowed: false,
          reason:
            `Could not identify which Supabase project DIRECT_URL/DATABASE_URL points at, ` +
            `so it cannot be ruled out as production (${productionRef}).`,
        };
  }

  if (targetRef === productionRef) {
    return overridden
      ? {
          allowed: true,
          reason: `PRODUCTION project ${targetRef} — overridden deliberately`,
        }
      : {
          allowed: false,
          reason:
            `This would reset the PRODUCTION project (${targetRef}).\n\n` +
            `  Everything goes: the catalogue, quote requests, staff accounts, audit log.\n\n` +
            `  If that is genuinely what you want, run it again with the override:\n` +
            `      ${OVERRIDE_VARIABLE}=${OVERRIDE_VALUE} pnpm db:reset`,
        };
  }

  return {
    allowed: true,
    reason: `target project ${targetRef} is not the production project (${productionRef})`,
  };
}

function main(): void {
  const decision = decide({
    // The reset runs over the DIRECT connection, so that is the one whose
    // target actually matters.
    targetUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
    productionRef: process.env.PRODUCTION_SUPABASE_PROJECT_REF,
    override: process.env[OVERRIDE_VARIABLE],
  });

  if (!decision.allowed) {
    console.error(`\n  REFUSING TO RESET THE DATABASE\n\n  ${decision.reason}\n`);
    process.exit(1);
  }

  console.log(`  destructive command allowed — ${decision.reason}`);
}

// Only when run as a script, so the tests can import the pure parts.
if (process.argv[1]?.includes("guard-destructive")) main();
