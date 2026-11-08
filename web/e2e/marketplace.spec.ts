import { expect, test } from "@playwright/test";

import {
  addService,
  approveBusiness,
  createOwner,
  expectAccessible,
  ownerWithBusiness,
  PASSWORD,
  uniqueEmail,
} from "./helpers";

const RIGA = { latitude: 56.9496, longitude: 24.1052 };

test("a visitor finds an approved venue by city and near them, opens it, and a customer saves it", async ({
  page,
  browser,
}) => {
  // An owner with a Haircut that Marta does, and Marta working Monday.
  const name = await ownerWithBusiness(page);
  await page.goto("/dashboard/services");
  await addService(page, "Haircut", "35");
  await page.goto("/dashboard/team");
  await page.getByRole("button", { name: /Marta/ }).click();
  const marta = page.getByRole("region", { name: "Marta" });
  await marta.getByRole("tab", { name: "Services" }).click();
  await marta.getByRole("checkbox", { name: /Haircut/ }).check();
  await marta.getByRole("button", { name: "Save services" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved Marta's services.");
  await page.goto("/dashboard/team/shifts");
  await page.getByLabel("Marta, Monday, starts").selectOption("09:00");
  await page.getByRole("button", { name: "Save week" }).click();
  await expect(page.getByRole("status")).toContainText("Saved the week of");

  // In review, it isn't public.
  const visitor = await browser.newContext({ reducedMotion: "reduce" });
  const v = await visitor.newPage();
  await v.goto("/search");
  await v.getByLabel("Venue or service").fill(name);
  await v.getByRole("button", { name: "Search" }).click();
  await expect(v.getByRole("heading", { name: "No venues here yet" })).toBeVisible();

  approveBusiness(name);

  // By city.
  await v.reload();
  await v.getByLabel("Or choose a place").selectOption("LV|Riga");
  await v.getByLabel("Venue or service").fill(name);
  await v.getByRole("button", { name: "Search" }).click();
  const card = v.getByRole("listitem").filter({ has: v.getByRole("link", { name, exact: true }) });
  await expect(card).toContainText("From €35.00");
  await expect(card).toContainText("Riga");
  await expectAccessible(v);
  await v.getByRole("button", { name: "Show map" }).click();
  await expect(v.getByRole("region", { name: "Map of the venues found" }).locator(".venue-pin")).toHaveCount(1);
  await expectAccessible(v);
  await visitor.close();

  // Near you: the browser already allows location, so it's used straight away, with the distance.
  const near = await browser.newContext({ reducedMotion: "reduce", geolocation: RIGA, permissions: ["geolocation"] });
  const n = await near.newPage();
  await n.goto("/search");
  await expect(n.getByRole("button", { name: "Near you" })).toHaveAttribute("aria-pressed", "true");
  await n.getByLabel("Venue or service").fill(name);
  await n.getByRole("button", { name: "Search" }).click();
  await expect(n.getByText(/venues? within 25 km of you/)).toBeVisible();
  await expect(n.getByRole("listitem").filter({ has: n.getByRole("link", { name, exact: true }) })).toContainText(
    /\d+\.\d km away/,
  );

  // The storefront.
  await n.getByRole("link", { name, exact: true }).click();
  await expect(n.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(n.getByRole("region", { name: "Services" })).toContainText("Haircut");
  await expect(n.getByRole("region", { name: "Services" })).toContainText("€35.00");
  await expect(n.getByRole("region", { name: "Team" })).toContainText("Marta");
  await expect(n.getByRole("row", { name: /Monday/ })).toContainText("09:00 to 17:00");
  await expect(n.getByRole("row", { name: /Tuesday/ })).toContainText("Closed");
  await expectAccessible(n);
  await n.getByRole("button", { name: "Show map" }).click();
  await expect(n.getByRole("region", { name: /^Map of / }).locator(".venue-pin")).toHaveCount(1);
  await expectAccessible(n);
  const storefront = n.url();
  await near.close();

  // A customer saves it and finds it on their account.
  const email = uniqueEmail("customer");
  createOwner(email, "consumer");
  const customer = await browser.newContext({ reducedMotion: "reduce" });
  const c = await customer.newPage();
  await c.goto("/login");
  await c.getByLabel("Email").fill(email);
  await c.getByLabel("Password").fill(PASSWORD);
  await c.getByRole("button", { name: "Log in" }).click();
  await expect(c).toHaveURL(/\/account$/);
  await c.goto(storefront);
  const save = c.getByRole("button", { name: `Save ${name}` });
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await c.goto("/account");
  await expect(
    c.getByRole("region", { name: "Saved venues" }).getByRole("link", { name: new RegExp(`^${name} `) }),
  ).toBeVisible();
  await customer.close();
});
