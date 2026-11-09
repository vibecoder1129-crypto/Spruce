import { expect, test, type Page } from "@playwright/test";

import {
  addService,
  approveBusiness,
  createOwner,
  expectAccessible,
  finishBookings,
  martaEveryDay,
  ownerWithBusiness,
  PASSWORD,
  stopLink,
  uniqueEmail,
} from "./helpers";

test.use({ timezoneId: "Europe/Riga" });

test("an owner sets a rebook time, and a customer books again and controls reminders", async ({ page, browser }) => {
  const name = await ownerWithBusiness(page);
  await page.goto("/dashboard/services");
  await addService(page, "Haircut", "35");
  await page.getByRole("button", { name: /Haircut/ }).click();
  const panel = page.getByRole("region", { name: "Edit Haircut" });
  await panel.getByLabel("Remind clients to rebook after").selectOption({ label: "6 weeks" });
  await expectAccessible(page);
  await panel.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved Haircut.");
  await page.getByRole("button", { name: /Haircut/ }).click();
  await expect(page.getByLabel("Remind clients to rebook after")).toHaveValue("6");

  await page.goto("/dashboard/team");
  await page.getByRole("button", { name: /Marta/ }).click();
  const marta = page.getByRole("region", { name: "Marta" });
  await marta.getByRole("tab", { name: "Services" }).click();
  await marta.getByRole("checkbox", { name: /Haircut/ }).check();
  await marta.getByRole("button", { name: "Save services" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved Marta's services.");
  await martaEveryDay(page);
  approveBusiness(name);

  // A customer books, and the visit is done.
  const email = uniqueEmail("regular");
  createOwner(email, "consumer");
  const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor } = test.info().project.use;
  const context = await browser.newContext({
    viewport,
    userAgent,
    isMobile,
    hasTouch,
    deviceScaleFactor,
    reducedMotion: "reduce",
    timezoneId: "Europe/Riga",
  });
  const c = await context.newPage();
  await c.goto("/login");
  await c.getByLabel("Email").fill(email);
  await c.getByLabel("Password").fill(PASSWORD);
  await c.getByRole("button", { name: "Log in" }).click();
  await expect(c).toHaveURL(/\/bookings$/);
  await c.goto(`/b/${await businessId(page)}`);
  await c.getByRole("link", { name: "Book Haircut" }).click();
  await c.getByRole("button", { name: /^Marta/ }).click();
  await c.getByRole("group", { name: "Day" }).getByRole("button").nth(1).click();
  await c.getByRole("group", { name: "Morning" }).getByRole("button", { name: "09:00" }).click();
  await c.getByLabel("Your name").fill("Ana Ozola");
  await c.getByRole("button", { name: "Confirm booking" }).click();
  await expect(c.getByRole("heading", { name: /You're booked/ })).toBeVisible();
  finishBookings(name);

  // Book again, from the past visit, lands on the same service and person.
  await c.goto("/bookings");
  const past = c.getByRole("region", { name: "Past" });
  await expectAccessible(c);
  await past.getByRole("link", { name: /^Book again/ }).click();
  await expect(c.getByText("Service: Haircut, 45 min")).toBeVisible();
  await expect(c.getByText("Professional: Marta")).toBeVisible();
  // If that person has gone, the same link offers anyone available instead.
  await c.goto(c.url().replace(/staff=[0-9a-f-]+/, "staff=00000000-0000-0000-0000-000000000000"));
  await expect(c.getByText("Professional: Anyone available")).toBeVisible();

  // Reminders are on until the customer turns them off.
  await c.goto("/account");
  const reminders = c.getByRole("switch", { name: "Rebooking reminders" });
  await expect(reminders).toHaveAttribute("aria-checked", "true");
  await expectAccessible(c);
  await reminders.click();
  await expect(reminders).toHaveAttribute("aria-checked", "false");
  await expect(c.getByText("Rebooking reminders are off.")).toBeVisible();
  await c.reload();
  await expect(reminders).toHaveAttribute("aria-checked", "false");
  await reminders.click();
  await expect(c.getByText("Rebooking reminders are on.")).toBeVisible();

  // Every reminder email has a one-click stop link that works without logging in.
  await context.clearCookies();
  await c.goto(stopLink(email));
  await expect(c.getByRole("heading", { name: "Stop rebooking reminders?" })).toBeVisible();
  await expectAccessible(c);
  await c.getByRole("button", { name: "Stop these emails" }).click();
  await expect(c.getByRole("status")).toHaveText("You won't get rebooking reminders any more.");
  await expect(c.getByRole("status")).toBeFocused();
  await c.goto("/login");
  await c.getByLabel("Email").fill(email);
  await c.getByLabel("Password").fill(PASSWORD);
  await c.getByRole("button", { name: "Log in" }).click();
  await expect(c).toHaveURL(/\/bookings$/);
  await c.goto("/account");
  await expect(reminders).toHaveAttribute("aria-checked", "false");
  await context.close();
});

async function businessId(page: Page): Promise<string> {
  await page.goto("/dashboard");
  const link = await page.getByRole("region", { name: "Your booking link" }).getByLabel("Link").inputValue();
  return link.match(/\/b\/([0-9a-f-]+)\/book$/)![1];
}
