"use client";

import { useState, type ReactNode } from "react";

import { Check, ChevronsUpDown } from "lucide-react";

import { Icon } from "@/components/brand/icon";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Combobox — docs/02-ux-blueprint.md §3.5.
 *
 * shadcn has no Combobox component; it is a documented composition of Popover +
 * Command. Since §3.5 names it as a primitive, it exists here as one rather
 * than being re-derived at each call site — brand, collection, category and
 * warehouse pickers will all want the same behaviour.
 *
 * The empty state is required, not optional: "Never a bare 'No results'"
 * (§4.15). Every empty state gets a title, a cause and an action.
 */

export interface ComboboxOption {
  value: string;
  label: string;
  /** Secondary line — a SKU, a count, a warehouse. Rendered in mono. */
  hint?: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  options: readonly ComboboxOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  /** Shown when the filter matches nothing. Give it an action (§4.15). */
  empty: ReactNode;
  id?: string;
  "aria-describedby"?: string;
  disabled?: boolean;
  className?: string;
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder,
  empty,
  id,
  disabled,
  className,
  ...aria
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="secondary"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-stone-500",
            className,
          )}
          trailingIcon={
            <Icon icon={ChevronsUpDown} size="sm" className="text-stone-500" />
          }
          {...aria}
        >
          {selected?.label ?? placeholder}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{empty}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  disabled={option.disabled}
                  onSelect={() => {
                    onValueChange?.(
                      option.value === value ? "" : option.value,
                    );
                    setOpen(false);
                  }}
                >
                  <Icon
                    icon={Check}
                    size="sm"
                    className={cn(
                      option.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="flex-1">{option.label}</span>
                  {option.hint ? (
                    <span className="text-spec-sm text-stone-600">
                      {option.hint}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
