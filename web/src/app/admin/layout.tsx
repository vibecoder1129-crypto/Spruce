import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader label="Platform admin" href="/admin/businesses" />
      <main id="main" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8 sm:py-10">
        {children}
      </main>
    </div>
  );
}
