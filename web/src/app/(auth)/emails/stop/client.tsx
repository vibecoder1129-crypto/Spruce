"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

import { AuthShell, FormError } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/** One click from a reminder email. A button, not a visit, so mail scanners that open links don't unsubscribe. */
export function StopEmailsPage() {
  const params = useSearchParams();
  const [state, setState] = useState<"ready" | "busy" | "done">("ready");
  const [error, setError] = useState<string | null>(null);
  const status = useRef<HTMLParagraphElement>(null);

  async function stop() {
    setState("busy");
    setError(null);
    try {
      await api("/emails/stop", {
        method: "POST",
        body: { user_id: params.get("u") ?? "", token: params.get("t") ?? "" },
      });
      setState("done");
      requestAnimationFrame(() => status.current?.focus());
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
      setState("ready");
    }
  }

  return (
    <AuthShell
      title={state === "done" ? "Reminders stopped" : "Stop rebooking reminders?"}
      intro={
        state === "done" ? undefined : "We won't email you about booking again. You can turn them back on any time."
      }
    >
      {state === "done" ? (
        <p ref={status} tabIndex={-1} role="status">
          You won&apos;t get rebooking reminders any more.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <FormError message={error} />
          <Button type="button" onClick={stop} loading={state === "busy"}>
            Stop these emails
          </Button>
        </div>
      )}
      <Link
        href="/account"
        className="inline-flex min-h-11 items-center font-semibold text-spruce underline underline-offset-4"
      >
        Email settings in your account
      </Link>
    </AuthShell>
  );
}
