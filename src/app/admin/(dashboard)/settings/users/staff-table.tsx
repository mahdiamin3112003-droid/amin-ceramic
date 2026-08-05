"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  inviteStaffAction,
  resetMfaAction,
  setSuspendedAction,
  updateRolesAction,
} from "@/application/actions/admin/people-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  mfaResetBlockedReason,
  roleChangeBlockedReason,
  suspensionBlockedReason,
  type RoleRow,
  type StaffRow,
} from "@/domain/admin/people";
import { cn } from "@/lib/utils";

/**
 * Staff administration.
 *
 * ── The disabled controls carry their reason ──
 * Every guard in `domain/admin/people.ts` is evaluated here too, purely so
 * the button can say WHY it is unavailable. The server is what actually
 * refuses; this exists because "you cannot remove your own owner role" is
 * a far better answer than a control that silently does nothing.
 */
export function StaffTable({
  staff,
  roles,
  currentUserId,
  isOwner,
  canInvite,
}: {
  staff: readonly StaffRow[];
  roles: readonly RoleRow[];
  currentUserId: string;
  isOwner: boolean;
  canInvite: boolean;
}) {
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [inviting, setInviting] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      {canInvite ? (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              setInviting(true);
            }}
          >
            Invite someone
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full min-w-3xl border-collapse text-body-sm">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="p-3 text-start font-medium">
                Person
              </th>
              <th scope="col" className="p-3 text-start font-medium">
                Roles
              </th>
              <th scope="col" className="p-3 text-start font-medium">
                Status
              </th>
              <th scope="col" className="p-3 text-start font-medium">
                Last seen
              </th>
              <th scope="col" className="p-3 text-end font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {staff.map((person) => (
              <StaffRowView
                key={person.id}
                person={person}
                staff={staff}
                currentUserId={currentUserId}
                isOwner={isOwner}
                onEditRoles={() => {
                  setEditing(person);
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      <RolesDialog
        person={editing}
        roles={roles}
        staff={staff}
        currentUserId={currentUserId}
        onClose={() => {
          setEditing(null);
        }}
      />

      <InviteDialog
        open={inviting}
        roles={roles}
        isOwner={isOwner}
        onClose={() => {
          setInviting(false);
        }}
      />
    </div>
  );
}

function StaffRowView({
  person,
  staff,
  currentUserId,
  isOwner,
  onEditRoles,
}: {
  person: StaffRow;
  staff: readonly StaffRow[];
  currentUserId: string;
  isOwner: boolean;
  onEditRoles: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const suspendBlocked = suspensionBlockedReason(staff, person.id, currentUserId);
  const mfaBlocked = mfaResetBlockedReason(person.id, currentUserId);
  const isSuspended = person.status === "suspended";

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? "That didn't work");
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="p-3">
        <span className="block font-medium">{person.fullName ?? person.email}</span>
        <span className="block text-caption text-stone-500">{person.email}</span>
        {person.id === currentUserId ? (
          <span className="text-caption text-stone-500">(you)</span>
        ) : null}
      </td>

      <td className="p-3">
        <span className="flex flex-wrap gap-1">
          {person.roleKeys.length === 0 ? (
            <span className="text-stone-400 text-caption">No roles</span>
          ) : (
            person.roleKeys.map((key) => (
              <span
                key={key}
                className="rounded-full bg-stone-100 px-2 py-0.5 text-caption capitalize"
              >
                {key}
              </span>
            ))
          )}
        </span>
      </td>

      <td className="p-3">
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-caption font-medium",
            person.status === "active" && "bg-success-50 text-success-600",
            person.status === "invited" && "bg-warning-50 text-warning-600",
            person.status === "suspended" && "bg-stone-100 text-stone-600",
          )}
        >
          {person.status}
        </span>
      </td>

      <td className="p-3 text-caption font-mono text-stone-600 tabular-nums">
        {person.lastSeenAt === null
          ? "never"
          : person.lastSeenAt.toISOString().slice(0, 10)}
      </td>

      <td className="p-3">
        <div className="flex flex-wrap justify-end gap-2">
          {isOwner ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={onEditRoles}
            >
              Roles
            </Button>
          ) : null}

          {isOwner ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={
                pending || mfaBlocked !== null || person.authUserId === null
              }
              {...(mfaBlocked ? { title: mfaBlocked } : {})}
              onClick={() => {
                run(
                  () => resetMfaAction({ id: person.id }),
                  "Authenticator cleared — they will enrol a new one next sign-in",
                );
              }}
            >
              Reset 2FA
            </Button>
          ) : null}

          <Button
            variant={isSuspended ? "secondary" : "ghost"}
            size="sm"
            disabled={pending || (!isSuspended && suspendBlocked !== null)}
            {...(!isSuspended && suspendBlocked ? { title: suspendBlocked } : {})}
            onClick={() => {
              run(
                () =>
                  setSuspendedAction({ id: person.id, suspended: !isSuspended }),
                isSuspended ? "Reinstated" : "Suspended",
              );
            }}
          >
            {isSuspended ? "Reinstate" : "Suspend"}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function RolesDialog({
  person,
  roles,
  staff,
  currentUserId,
  onClose,
}: {
  person: StaffRow | null;
  roles: readonly RoleRow[];
  staff: readonly StaffRow[];
  currentUserId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<readonly string[]>(
    person?.roleKeys ?? [],
  );
  const [syncedFrom, setSyncedFrom] = useState(person);

  if (syncedFrom !== person) {
    setSyncedFrom(person);
    setSelected(person?.roleKeys ?? []);
  }

  if (!person) return null;

  const blocked = roleChangeBlockedReason(
    staff,
    person.id,
    selected,
    currentUserId,
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Roles for {person.fullName ?? person.email}</DialogTitle>
          <DialogDescription>
            Permissions are the union of every role. Changes take effect on their
            next request — there is no cached token to wait out.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Roles</legend>
          {roles.map((role) => (
            <label
              key={role.key}
              className="flex min-h-11 cursor-pointer items-start gap-3"
            >
              <input
                type="checkbox"
                checked={selected.includes(role.key)}
                disabled={pending}
                onChange={(e) => {
                  setSelected((current) =>
                    e.target.checked
                      ? [...current, role.key]
                      : current.filter((k) => k !== role.key),
                  );
                }}
                className="mt-1 size-4 shrink-0 accent-navy-700"
              />
              <span className="min-w-0">
                <span className="block text-body-sm font-medium">{role.name}</span>
                {role.description ? (
                  <span className="block text-caption text-stone-600">
                    {role.description}
                  </span>
                ) : null}
                <span className="block text-caption text-stone-500 tabular-nums">
                  {role.permissionKeys.length} permissions
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        {blocked ? (
          <p
            role="alert"
            className="rounded-md bg-warning-50 p-3 text-body-sm text-warning-600"
          >
            {blocked}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={pending}
            disabled={blocked !== null || pending}
            onClick={() => {
              startTransition(async () => {
                const result = await updateRolesAction({
                  id: person.id,
                  roleKeys: selected,
                });
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Roles updated");
                onClose();
                router.refresh();
              });
            }}
          >
            Save roles
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteDialog({
  open,
  roles,
  isOwner,
  onClose,
}: {
  open: boolean;
  roles: readonly RoleRow[];
  isOwner: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<readonly string[]>([]);

  if (!open) return null;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          setSelected([]);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a staff member</DialogTitle>
          <DialogDescription>
            They receive an email invitation. The account stays inactive — and
            grants nothing — until they accept it.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-5"
          action={(formData) => {
            startTransition(async () => {
              const result = await inviteStaffAction({
                email: formData.get("email"),
                fullName: formData.get("fullName"),
                roleKeys: selected,
              });
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success("Invitation sent");
              setSelected([]);
              onClose();
              router.refresh();
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              required
              spellCheck={false}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-name">Full name (optional)</Label>
            <Input id="invite-name" name="fullName" />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-body-sm font-medium">Roles</legend>
            {roles.map((role) => {
              // Only an owner may hand out `owner` — the server enforces it,
              // this stops it being offered in the first place.
              const restricted = role.key === "owner" && !isOwner;
              return (
                <label
                  key={role.key}
                  className={cn(
                    "flex min-h-11 items-center gap-3",
                    restricted ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                  )}
                >
                  <input
                    type="checkbox"
                    disabled={restricted || pending}
                    checked={selected.includes(role.key)}
                    onChange={(e) => {
                      setSelected((current) =>
                        e.target.checked
                          ? [...current, role.key]
                          : current.filter((k) => k !== role.key),
                      );
                    }}
                    className="size-4 shrink-0 accent-navy-700"
                  />
                  <span className="text-body-sm">{role.name}</span>
                </label>
              );
            })}
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={pending}
              disabled={selected.length === 0 || pending}
            >
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
