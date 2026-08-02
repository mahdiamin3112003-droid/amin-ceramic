import type { routing } from "@/i18n/routing";
import type messages from "@/i18n/messages/en.json";

/**
 * Types every translation key against the English catalogue, so `t("does.not.exist")`
 * is a compile error rather than a string that renders as its own key in
 * production. English is the reference catalogue; a key missing from ar.json
 * falls back at runtime, which is the correct behaviour for a translation queue
 * (docs/02-ux-blueprint.md §1.2, /admin/content/translations).
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
