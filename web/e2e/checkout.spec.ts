import { expect, test } from "@playwright/test";

import { addService, expectAccessible, martaEveryDay, ownerWithBusiness, startBookings } from "./helpers";

test.use({ timezoneId: "Europe/Riga" });

test("an owner sets a commission, checks out a visit with a tip, and sees it in Reports", async ({ page }) => {
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

  // Commission, checked before it's saved.
  await marta.getByRole("tab", { name: "Details" }).click();
  const commission = marta.getByLabel("Commission (%)");
  await commission.fill("140");
  await marta.getByRole("button", { name: "Save changes" }).click();
  await expect(marta.getByText("Enter a whole number from 0 to 100.")).toBeVisible();
  await commission.fill("40");
  await marta.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await martaEveryDay(page);

  // A walk-in tomorrow, which the clock then starts.
  const riga = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Riga" }).format(new Date());
  const tomorrow = new Date(`${riga}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await page.goto("/dashboard/calendar");
  await page.getByLabel("Date").fill(tomorrow.toISOString().slice(0, 10));
  await page.getByRole("button", { name: "New appointment" }).click();
  const form = page.getByRole("complementary");
  await form.getByLabel(/^Starts on/).selectOption("10:00");
  await form.getByLabel("Client name").fill("Liga");
  await form.getByLabel("Service").selectOption({ index: 1 });
  await form.getByRole("button", { name: "Book" }).click();
  await expect(page.getByRole("status")).toHaveText("Booked Liga at 10:00.");
  startBookings(name);

  // Check out with a tip, paid in cash.
  await page.goto("/dashboard/calendar");
  await page.getByRole("button", { name: "List" }).click();
  await page.getByRole("row", { name: /Liga/ }).getByRole("button").click();
  const detail = page.getByRole("complementary");
  await detail.getByRole("button", { name: "Check out" }).click();
  const checkout = detail.getByRole("form", { name: "Check out" });
  await expect(checkout.getByLabel("Amount for the service")).toHaveValue("35.00");
  await checkout.getByLabel("Tip").fill("five");
  await checkout.getByRole("button", { name: "Confirm checkout" }).click();
  await expect(checkout.getByText("Enter a tip like 5, or leave it empty.")).toBeVisible();
  await expect(checkout.getByLabel("Tip")).toBeFocused();
  await checkout.getByLabel("Tip").fill("5");
  await checkout.getByRole("radio", { name: "Cash" }).check();
  await expectAccessible(page);
  await checkout.getByRole("button", { name: "Confirm checkout" }).click();
  await expect(page.getByRole("status")).toHaveText("Checked out Liga: €40.00 paid.");
  await page.getByRole("row", { name: /Liga/ }).getByRole("button").click();
  await expect(page.getByRole("definition").filter({ hasText: "€35.00, cash · tip €5.00" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check out" })).toHaveCount(0);

  // Reports: takings, tips and 40% commission of the service amount only.
  await page.goto("/dashboard/reports");
  const row = page.getByRole("row", { name: /Marta/ });
  await expect(row.getByRole("cell")).toHaveText(["1", "€35.00", "€5.00", "€14.00"]);
  await expect(page.getByRole("row", { name: /Total/ }).getByRole("cell")).toHaveText([
    "1",
    "€35.00",
    "€5.00",
    "€14.00",
  ]);
  await expectAccessible(page);
  // A range with no checkouts says so.
  await page.getByLabel("From").fill("2026-01-01");
  await page.getByLabel("To").fill("2026-01-31");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByText("No checkouts in these dates")).toBeVisible();
});
