"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api, ApiError, nextStep, type Me } from "@/lib/api";

/**
 * Loads the signed-in person for a page that needs a given role, and sends everyone else
 * where they belong. This is navigation only: the API enforces every permission itself.
 */
export function useMe(role: Me["role"]) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Me>("/me")
      .then((m) => (m.mfa_pending || m.role !== role ? router.replace(nextStep(m)) : setMe(m)))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/login?signed-out");
        else setError(e instanceof Error ? e.message : "That didn't work.");
      });
  }, [role, router]);

  return { me, error };
}

export async function logOut(router: ReturnType<typeof useRouter>) {
  await api("/auth/logout", { method: "POST" });
  router.push("/login");
}
