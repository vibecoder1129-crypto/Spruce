import { expect, test } from "@playwright/test";

import { createOwner, expectAccessible, PASSWORD, uniqueEmail } from "./helpers";

type Manifest = {
  id: string;
  lang: string;
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
  shortcuts: { name: string; url: string; icons: { src: string }[] }[];
};

test("the manifest describes an installable app and every icon loads at its size", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as Manifest;
  expect(manifest.name).toBe("Spruce");
  expect(manifest.display).toBe("standalone");
  expect(manifest.id).toBe("/app");
  expect(manifest.lang).toBe("en");
  expect(manifest.start_url).toBe("/app");
  // Only shortcuts that suit customers and venues alike.
  expect(manifest.shortcuts.map((s) => s.url)).toEqual(["/search"]);
  for (const shortcut of manifest.shortcuts) {
    expect((await request.get(shortcut.icons[0].src)).ok()).toBe(true);
  }
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

test("without a connection, pages show the offline page", async ({ page, context }) => {
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

  // Trying again while still offline keeps the page; coming back online is covered below.
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await expect(page).toHaveURL(/\/search$/);
});

test("the installed app opens where each person works", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/$/); // signed out: the home page
  const email = uniqueEmail("installer");
  createOwner(email, "consumer");
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/bookings$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/bookings$/);
});

test("losing the connection mid-use says so, and the offline page comes back by itself", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  const bar = page.getByRole("status").filter({ hasText: "You're offline" });
  await expect(bar).toHaveCount(0);
  await context.setOffline(true);
  await expect(bar).toHaveText("You're offline. Some things won't load until you're back online.");
  await context.setOffline(false);
  await expect(bar).toHaveCount(0);

  await context.setOffline(true);
  await page.goto("/search");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole("heading", { name: "You're offline" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/search$/);
});
