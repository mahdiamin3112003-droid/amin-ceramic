"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/application/actions/result";
import {
  decideTradeAccount,
  inviteStaff,
  listSettingsForAdmin,
  resetStaffMfa,
  setStaffSuspended,
  updateSetting,
  updateStaffRoles,
} from "@/application/use-cases/admin/people";
import { parseSettingValue } from "@/domain/admin/people";
import {
  decideTradeAccountSchema,
  inviteStaffSchema,
  resetMfaSchema,
  setSuspendedSchema,
  updateRolesSchema,
  updateSettingSchema,
} from "@/lib/validation/admin-people";

function revalidateSettings(path: string) {
  revalidatePath(path);
  revalidatePath("/admin/settings");
}

export async function inviteStaffAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = inviteStaffSchema.parse(input);
    const created = await inviteStaff(parsed);
    revalidateSettings("/admin/settings/users");
    return ok(created);
  } catch (cause) {
    return fail(cause, "failed to send the invitation");
  }
}

export async function updateRolesAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { id, roleKeys } = updateRolesSchema.parse(input);
    await updateStaffRoles(id, roleKeys);
    revalidateSettings("/admin/settings/users");
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to change roles");
  }
}

export async function setSuspendedAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { id, suspended } = setSuspendedSchema.parse(input);
    await setStaffSuspended(id, suspended);
    revalidateSettings("/admin/settings/users");
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to change this account");
  }
}

export async function resetMfaAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const { id } = resetMfaSchema.parse(input);
    await resetStaffMfa(id);
    revalidateSettings("/admin/settings/users");
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to reset the authenticator");
  }
}

export async function decideTradeAccountAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const parsed = decideTradeAccountSchema.parse(input);
    await decideTradeAccount(parsed);
    revalidateSettings("/admin/settings/trade");
    // A tier change alters what a signed-in trade customer is quoted, so the
    // storefront's cached pages are stale the moment this commits.
    revalidatePath("/[locale]", "layout");
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to update this trade account");
  }
}

export async function updateSettingAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { key, raw } = updateSettingSchema.parse(input);

    // The declared type lives on the row, so the parse needs a lookup first.
    const setting = (await listSettingsForAdmin()).find((s) => s.key === key);
    if (!setting) return { ok: false, error: `no setting named "${key}"` };

    const parsed = parseSettingValue(raw, setting.dataType);
    if (!parsed.ok) return { ok: false, error: `${key} ${parsed.error}` };

    await updateSetting(key, parsed.value);
    revalidateSettings("/admin/settings");
    // A `public` setting is read by the storefront.
    if (setting.scope === "public") revalidatePath("/[locale]", "layout");
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to save the setting");
  }
}
