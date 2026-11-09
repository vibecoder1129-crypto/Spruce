import { expect, test } from "@playwright/test";

import {
  addService,
  approveBusiness,
  createOwner,
  expectAccessible,
  martaEveryDay,
  ownerWithBusiness,
  PASSWORD,
  uniqueEmail,
} from "./helpers";

// The venue is in Riga; the owner's board and the customer's "tomorrow" agree on the date.
test.use({ timezoneId: "Europe/Riga" });

test("a customer books, signing in at Confirm, then moves and cancels it; the owner sees it", async ({
  page,
  browser,
}) => {
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

  // The owner's link to share.
  await page.goto("/dashboard");
  const share = page.getByRole("region", { name: "Your booking link" });
  await expect(share.getByLabel("Link")).toHaveValue(/\/b\/[0-9a-f-]+\/book$/);
  await expect(share.getByLabel("Button for your website")).toHaveValue(new RegExp(`Book at ${name}</a>$`));
  await expectAccessible(page);

  // A visitor picks a service, a professional and a time without an account.
  const email = uniqueEmail("customer");
  createOwner(email, "consumer");
  // The customer uses the same screen as the project: a desktop or a phone.
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
  await c.goto((await share.getByLabel("Link").inputValue()).replace(/\/book$/, ""));
  await c.getByRole("link", { name: "Book Haircut" }).click();
  await expect(c.getByRole("heading", { name: "Choose a professional" })).toBeVisible();
  await expectAccessible(c);
  await c.getByRole("button", { name: /^Marta/ }).click();
  await expect(c.getByRole("heading", { name: "Choose a time" })).toBeVisible();
  const days = c.getByRole("group", { name: "Day" }).getByRole("button");
  await days.nth(1).click();
  await expect(days.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(c.getByText("Times are Europe/Riga time.")).toBeVisible();
  await expectAccessible(c);
  await c.getByRole("group", { name: "Morning" }).getByRole("button", { name: "09:00" }).click();

  // Confirm asks them to log in, then brings them back to the same step.
  await expect(c.getByRole("heading", { name: "Confirm your booking" })).toBeVisible();
  await expect(c.getByText("€35.00, paid at the venue")).toBeVisible();
  await expectAccessible(c);
  await c.getByRole("link", { name: "Log in to book" }).click();
  await c.getByLabel("Email").fill(email);
  await c.getByLabel("Password").fill(PASSWORD);
  await c.getByRole("button", { name: "Log in" }).click();
  await expect(c.getByRole("heading", { name: "Confirm your booking" })).toBeVisible();
  await c.getByLabel("Your name").fill("Ana Ozola");
  await expectAccessible(c);
  await c.getByRole("button", { name: "Confirm booking" }).click();
  await expect(c.getByRole("heading", { name: `You're booked at ${name}` })).toBeVisible();
  await expect(c.getByText(/, 09:00 to 09:45$/)).toBeVisible();
  await expectAccessible(c);

  // Their bookings, then a new time.
  await c.getByRole("link", { name: "See your bookings" }).click();
  const upcoming = c.getByRole("region", { name: "Upcoming" });
  await expect(upcoming.getByRole("listitem")).toHaveCount(1);
  await expect(upcoming).toContainText("Haircut with Marta");
  await expect(upcoming).toContainText("09:00 to");
  await expectAccessible(c);
  await upcoming.getByRole("link", { name: /^Change time/ }).click();
  await expect(c.getByRole("heading", { name: "Change your booking" })).toBeVisible();
  await c.getByRole("group", { name: "Morning" }).getByRole("button", { name: "10:00" }).click();
  await expect(c.getByRole("heading", { name: "Confirm the new time" })).toBeVisible();
  await expect(c.getByText(/Moving from/)).toBeVisible();
  await expectAccessible(c);
  await c.getByRole("button", { name: "Move booking" }).click();
  await expect(c.getByText("Booking moved")).toBeVisible();
  await c.getByRole("link", { name: "See your bookings" }).click();
  await expect(upcoming).toContainText("10:00 to");

  // The owner sees it on tomorrow's day board, with the name the customer gave.
  await page.goto("/dashboard/calendar");
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByRole("region", { name: "Marta" })).toContainText("Ana Ozola");

  // The customer cancels.
  await upcoming.getByRole("button", { name: /^Cancel/ }).click();
  await expectAccessible(c);
  await c.getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(c.getByRole("status")).toContainText(`Cancelled your Haircut at ${name}`);
  await expect(c.getByText("Nothing booked yet")).toBeVisible();
  await expect(c.getByRole("region", { name: "Past" })).toContainText("Cancelled");
  await expectAccessible(c);
  await customer.close();
});
