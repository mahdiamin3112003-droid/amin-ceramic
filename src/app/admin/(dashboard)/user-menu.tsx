"use client";

import { useTransition } from "react";

import { signOutAction } from "@/application/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

export function UserMenu({
  email,
  fullName,
  roleKeys,
}: {
  email: string;
  fullName: string | null;
  roleKeys: readonly string[];
}) {
  const [pending, startTransition] = useTransition();
  const display = fullName ?? email;

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/*
          The visible text is the person's name, which says who is signed in
          but not what the control does. `aria-label` supplies the verb, so
          a screen reader announces "Account menu for Dana, button" rather
          than just reading a name aloud.
        */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          aria-label={`Account menu for ${display}`}
        >
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-full bg-navy-700 text-caption text-white"
          >
            {display.slice(0, 1).toUpperCase()}
          </span>
          <span className="max-w-40 truncate text-body-sm">{display}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64">
        <div className="flex flex-col gap-1">
          <p className="text-body-sm font-medium">{display}</p>
          <p className="truncate text-caption text-stone-600">{email}</p>
          {roleKeys.length > 0 ? (
            // Shown because "why can't I see Settings?" is the most common
            // admin question, and the answer is almost always the role.
            <p className="text-caption text-stone-500 capitalize">
              {roleKeys.join(", ")}
            </p>
          ) : null}
        </div>

        <Separator className="my-3" />

        <Button
          variant="ghost"
          size="sm"
          loading={pending}
          className="w-full justify-start"
          onClick={() => {
            startTransition(async () => {
              await signOutAction();
            });
          }}
        >
          Sign out
        </Button>
      </PopoverContent>
    </Popover>
  );
}
