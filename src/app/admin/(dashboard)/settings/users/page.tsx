import type { Metadata } from "next";

import { SettingsTabs } from "@/app/admin/(dashboard)/settings/settings-tabs";
import { StaffTable } from "@/app/admin/(dashboard)/settings/users/staff-table";
import { getCurrentStaff } from "@/application/auth/session";
import { hasPermission } from "@/application/auth/authorize";
import {
  listRolesForAdmin,
  listStaffForAdmin,
} from "@/application/use-cases/admin/people";
import { OWNER_ROLE_KEY } from "@/domain/admin/people";

export const metadata: Metadata = { title: "Staff & roles" };

export default async function StaffPage() {
  const [staff, roles, session, canInvite] = await Promise.all([
    listStaffForAdmin(),
    listRolesForAdmin(),
    getCurrentStaff(),
    hasPermission("user.invite"),
  ]);

  // §14.5 marks role changes and MFA resets owner-only, which no permission
  // key expresses. The server enforces it; this only decides what to render.
  const isOwner = session?.roleKeys.includes(OWNER_ROLE_KEY) ?? false;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h4 font-display">Staff &amp; roles</h1>
        <p className="mt-1 max-w-2xl text-body-sm leading-relaxed text-stone-600">
          Who can sign in, and what each of them may do. Role changes and
          authenticator resets are restricted to owners.
        </p>
      </div>

      <SettingsTabs active="/admin/settings/users" />

      <StaffTable
        staff={staff}
        roles={roles}
        currentUserId={session?.appUserId ?? ""}
        isOwner={isOwner}
        canInvite={canInvite}
      />
    </div>
  );
}
