"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { signOutAction } from "@/application/actions/auth-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Admin idle timeout — docs/04 §4.6: "30 minutes, with a countdown modal at 28".
 *
 * WHAT THIS IS AND IS NOT. It is a courtesy that clears an unattended
 * screen in a showroom back office. It is NOT a security boundary: the
 * clock is client-side, so anyone who wants to defeat it can. The real
 * bound is the 12-hour absolute session lifetime enforced by Supabase, and
 * the sign-out this fires is a genuine server-side revocation rather than a
 * UI reset — which is the part that has to be true for the courtesy to mean
 * anything at all.
 *
 * Activity is sampled, not counted. `mousemove` fires hundreds of times a
 * second; resetting a timer on each is pure waste, so the handler only
 * writes a timestamp and a 30-second interval does the comparison.
 */
const IDLE_LIMIT_MS = 30 * 60 * 1000;
const WARN_AT_MS = 28 * 60 * 1000;
const TICK_MS = 30 * 1000;
/** Once warned, the countdown needs per-second resolution to be worth showing. */
const COUNTDOWN_TICK_MS = 1000;

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "focus"] as const;

export function IdleTimeout() {
  const lastActivity = useRef(Date.now());
  const [warning, setWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(IDLE_LIMIT_MS - WARN_AT_MS);

  const markActive = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  // Passive listeners: none of these handlers call preventDefault, and a
  // non-passive scroll listener blocks the compositor.
  useEffect(() => {
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActive, { passive: true });
    }
    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActive);
      }
    };
  }, [markActive]);

  useEffect(() => {
    const interval = warning ? COUNTDOWN_TICK_MS : TICK_MS;

    const id = window.setInterval(() => {
      const idleFor = Date.now() - lastActivity.current;

      if (idleFor >= IDLE_LIMIT_MS) {
        void signOutAction();
        return;
      }

      if (idleFor >= WARN_AT_MS) {
        setWarning(true);
        setRemainingMs(IDLE_LIMIT_MS - idleFor);
      } else if (warning) {
        // Activity resumed during the warning — the dialog closes and the
        // interval falls back to the cheap cadence.
        setWarning(false);
      }
    }, interval);

    return () => {
      window.clearInterval(id);
    };
  }, [warning]);

  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));

  return (
    <Dialog
      open={warning}
      onOpenChange={(open) => {
        // Dismissing the dialog IS the "keep me signed in" gesture — there
        // is no separate outcome, so no reason to demand a specific button.
        if (!open) {
          markActive();
          setWarning(false);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Still there?</DialogTitle>
          <DialogDescription>
            You&rsquo;ll be signed out in{" "}
            {/* Tabular so the number does not reflow as it counts down. */}
            <span className="font-mono tabular-nums">{seconds}</span> seconds
            because of inactivity.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              void signOutAction();
            }}
          >
            Sign out now
          </Button>
          <Button
            onClick={() => {
              markActive();
              setWarning(false);
            }}
          >
            Stay signed in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
