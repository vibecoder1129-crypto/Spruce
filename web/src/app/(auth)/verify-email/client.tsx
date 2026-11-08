"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { api } from "@/lib/api";

export function VerifyEmailPage() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"checking" | "done" | "failed">(
    "checking",
  );
  const [message, setMessage] = useState("");
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return; // the token is single-use; never send it twice
    sent.current = true;
    api("/auth/verify-email", { method: "POST", body: { token } })
      .then(() => setState("done"))
      .catch((e: unknown) => {
        setMessage(e instanceof Error ? e.message : "That didn't work.");
        setState("failed");
      });
  }, [token]);

  const title = {
    checking: "Confirming your email…",
    done: "Email confirmed",
    failed: "We couldn't confirm your email",
  }[state];
  return (
    <AuthShell title={title} intro={state === "failed" ? message : undefined}>
      <p aria-live="polite" className="sr-only">
        {title}
      </p>
      {state !== "checking" && (
        <Link
          href="/account"
          className="font-semibold text-spruce underline underline-offset-4"
        >
          Go to your account
        </Link>
      )}
    </AuthShell>
  );
}
