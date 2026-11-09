import { expect, test, type Page } from "@playwright/test";

import {
  addService,
  approveBusiness,
  createOwner,
  expectAccessible,
  martaEveryDay,
  ownerWithBusiness,
  PASSWORD,
  startBookings,
  uniqueEmail,
} from "./helpers";

test.use({ timezoneId: "Europe/Riga" });

test("an owner sets a 24-hour window, a customer sees it, and the owner marks a no-show", async ({ page, browser }) => {
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
  await martaEveryDay(page);
  approveBusiness(name);

  // The owner picks the window in Settings.
  await page.goto("/dashboard/settings");
  await expect(page.getByRole("heading", { name: "Cancellation policy" })).toBeVisible();
  await page.getByLabel("Customers can cancel or move").selectOption({ label: "Up to 24 hours before" });
  await expect(page.getByText(/Customers will read: Cancel or change online up to 24 hours/)).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(page.getByRole("form", { name: "Cancellation policy" }).getByRole("status")).toHaveText(/^Saved\./);

  // A customer reads it on the venue page and at Confirm, then books two days ahead.
  const email = uniqueEmail("customer");
  createOwner(email, "consumer");
  const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor } = test.info().project.use;
  const customer = await browser.newContext({
    viewport,
    userAgent,
    isMobile,
    hasTouch,
    deviceScaleFactor,
    reducedMotion: "reduce",
    timezoneId: "Europe/Riga",
  });
  const c = await customer.newPage();
  await c.goto("/login");
  await c.getByLabel("Email").fill(email);
  await c.getByLabel("Password").fill(PASSWORD);
  await c.getByRole("button", { name: "Log in" }).click();
  await expect(c).toHaveURL(/\/bookings$/);
  await c.goto(`/b/${await businessId(page)}`);
  const policy = "Cancel or change online up to 24 hours before the start. After that, contact the venue.";
  await expect(c.getByText(policy)).toBeVisible();
  await expectAccessible(c);
  await c.getByRole("link", { name: "Book Haircut" }).click();
  await c.getByRole("button", { name: /^Marta/ }).click();
  const days = c.getByRole("group", { name: "Day" }).getByRole("button");
  await days.nth(2).click();
  await c.getByRole("group", { name: "Morning" }).getByRole("button", { name: "09:00" }).click();
  await expect(c.getByRole("heading", { name: "Confirm your booking" })).toBeVisible();
  await expect(c.getByRole("definition").filter({ hasText: policy })).toBeVisible();
  await c.getByLabel("Your name").fill("Ana Ozola");
  await expectAccessible(c);
  // The owner has that day open on the calendar, and the booking arrives on its own.
  const riga = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Riga" }).format(new Date());
  const inTwoDays = new Date(`${riga}T12:00:00Z`);
  inTwoDays.setUTCDate(inTwoDays.getUTCDate() + 2);
  await page.goto("/dashboard/calendar");
  await page.getByLabel("Date").fill(inTwoDays.toISOString().slice(0, 10));
  await expect(page.getByRole("region", { name: "Day summary" }).getByRole("definition").first()).toHaveText("0");
  await c.getByRole("button", { name: "Confirm booking" }).click();
  await expect(c.getByRole("heading", { name: /You're booked/ })).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("status")).toHaveText("New online booking: 09:00 Ana Ozola.");
  await c.getByRole("link", { name: "See your bookings" }).click();
  const upcoming = c.getByRole("region", { name: "Upcoming" });
  await expect(upcoming).toContainText(policy);
  await expect(upcoming.getByRole("link", { name: /^Change time/ })).toBeVisible();

  // The appointment starts: the customer is told to contact the venue instead.
  startBookings(name);
  await c.reload();
  await expect(upcoming).toContainText(`contact ${name}`);
  await expect(upcoming.getByRole("button", { name: /^Cancel/ })).toHaveCount(0);
  await expectAccessible(c);
  await customer.close();

  // The owner marks it as a no-show from today's list.
  await page.goto("/dashboard/calendar");
  await page.getByRole("button", { name: "List" }).click();
  await page
    .getByRole("row", { name: /Ana Ozola/ })
    .getByRole("button")
    .click();
  await expect(page.getByRole("button", { name: "Mark as done" })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "No-show", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Marked Ana Ozola as a no-show.");
  await page
    .getByRole("row", { name: /Ana Ozola/ })
    .getByRole("button")
    .click();
  await expect(page.getByRole("definition").filter({ hasText: /^No-show$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark as done" })).toHaveCount(0);
  await expectAccessible(page);
});

/** The business id, from the owner's booking link on Home. */
async function businessId(page: Page): Promise<string> {
  await page.goto("/dashboard");
  const link = await page.getByRole("region", { name: "Your booking link" }).getByLabel("Link").inputValue();
  return link.match(/\/b\/([0-9a-f-]+)\/book$/)![1];
}
