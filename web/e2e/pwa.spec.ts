import { expect, test } from "@playwright/test";

import { expectAccessible } from "./helpers";

type Manifest = {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
  shortcuts: { name: string; url: string }[];
};

test("the manifest describes an installable app and every icon loads at its size", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as Manifest;
  expect(manifest.name).toBe("Spruce");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.shortcuts.map((s) => s.url)).toEqual(["/bookings", "/dashboard/calendar"]);
  const sizes = manifest.icons.map((i) => `${i.sizes} ${i.purpose ?? "any"}`);
  expect(sizes).toEqual(expect.arrayContaining(["192x192 any", "512x512 any", "512x512 maskable"]));
  for (const icon of manifest.icons) {
    const file = await request.get(icon.src);
    expect(file.ok(), icon.src).toBe(true);
    expect(file.headers()["content-type"]).toBe("image/png");
    const body = await file.body();
    // PNG width and height sit at bytes 16 and 20.
    expect(`${body.readUInt32BE(16)}x${body.readUInt32BE(20)}`).toBe(icon.sizes);
  }
  for (const path of ["/apple-icon.png", "/icon.png"]) {
    expect((await request.get(path)).ok(), path).toBe(true);
  }
});

test("without a connection, pages show the offline page, and Try again comes back", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // The first load is not controlled yet; reload so the worker handles navigations.
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await context.setOffline(true);
  await page.goto("/search");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await expectAccessible(page);

  await context.setOffline(false);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "You're offline" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/search$/);
});
