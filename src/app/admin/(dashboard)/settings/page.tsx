import type { Metadata } from "next";

import { EmptyState } from "@/app/admin/(dashboard)/empty-state";
import { SettingsTabs } from "@/app/admin/(dashboard)/settings/settings-tabs";
import { SettingsForm } from "@/app/admin/(dashboard)/settings/settings-form";
import { listSettingsForAdmin } from "@/application/use-cases/admin/people";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const settings = await listSettingsForAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h4 font-display">Settings</h1>
        <p className="mt-1 max-w-2xl text-body-sm leading-relaxed text-stone-600">
          Values the application reads at runtime. Anything marked public is also
          readable by the storefront, so treat it as visible to customers.
        </p>
      </div>

      <SettingsTabs active="/admin/settings" />

      {settings.length === 0 ? (
        <EmptyState
          title="No settings defined"
          description="Settings are seeded with their type and scope. There is nothing to configure until the seed defines some."
        />
      ) : (
        <SettingsForm settings={settings} />
      )}
    </div>
  );
}
