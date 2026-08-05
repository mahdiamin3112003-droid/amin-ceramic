"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateSettingAction } from "@/application/actions/admin/people-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatSettingValue, type SettingRow } from "@/domain/admin/people";

/**
 * One row, one save.
 *
 * A single "Save all" button across a page of unrelated values would make
 * every edit a bulk write, so a typo in the JSON field would block the
 * unrelated string field next to it. Per-row saves keep each failure local
 * and each audit entry meaningful.
 */
export function SettingsForm({ settings }: { settings: readonly SettingRow[] }) {
  return (
    <ul aria-label="Settings" className="flex flex-col gap-4">
      {settings.map((setting) => (
        <li key={setting.key}>
          <SettingField setting={setting} />
        </li>
      ))}
    </ul>
  );
}

function SettingField({ setting }: { setting: SettingRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initial = formatSettingValue(setting.value, setting.dataType);
  const [raw, setRaw] = useState(initial);

  const dirty = raw !== initial;
  const isJson = setting.dataType === "json";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Label
            htmlFor={`setting-${setting.key}`}
            className="font-mono text-body-sm"
          >
            {setting.key}
          </Label>
          {setting.description ? (
            <p className="mt-1 text-caption text-stone-600">
              {setting.description}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 gap-2">
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-caption text-stone-600">
            {setting.dataType}
          </span>
          {/*
            Public scope is called out rather than left implicit — it is the
            difference between an internal toggle and something customers
            can read.
          */}
          <span
            className={
              setting.scope === "public"
                ? "rounded-full bg-warning-50 px-2 py-0.5 text-caption text-warning-600"
                : "rounded-full bg-stone-100 px-2 py-0.5 text-caption text-stone-600"
            }
          >
            {setting.scope}
          </span>
        </div>
      </div>

      {isJson ? (
        <textarea
          id={`setting-${setting.key}`}
          value={raw}
          rows={6}
          spellCheck={false}
          disabled={pending}
          onChange={(e) => {
            setRaw(e.target.value);
          }}
          className="w-full rounded-sm border border-stone-300 bg-white p-3 text-caption font-mono"
        />
      ) : (
        <Input
          id={`setting-${setting.key}`}
          value={raw}
          disabled={pending}
          spellCheck={false}
          onChange={(e) => {
            setRaw(e.target.value);
          }}
          className={
            setting.dataType === "number" ? "font-mono tabular-nums" : undefined
          }
        />
      )}

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={!dirty || pending}
          loading={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await updateSettingAction({ key: setting.key, raw });
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(`${setting.key} saved`);
              router.refresh();
            });
          }}
        >
          Save
        </Button>
        {dirty ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              setRaw(initial);
            }}
          >
            Reset
          </Button>
        ) : null}
      </div>
    </div>
  );
}
