import { expect, test, type Page } from "@playwright/test";

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

test.use({ timezoneId: "Europe/Riga" });

test("a customer waits for a full day and hears when the venue cancels", async ({ page, browser }) => {
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

  // The owner fills the day after tomorrow: a walk-in at 09:00, then the rest blocked.
  const riga = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Riga" }).format(new Date());
  const day = new Date(`${riga}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 2);
  await page.goto("/dashboard/calendar");
  await page.getByLabel("Date").fill(day.toISOString().slice(0, 10));
  await expect(page.getByRole("region", { name: "Marta" })).toContainText("09:00–17:00");
  await page.getByRole("button", { name: "New appointment" }).click();
  const form = page.getByRole("complementary");
  await form.getByLabel("With").selectOption({ label: "Marta" });
  await form.getByLabel(/^Starts on/).selectOption("09:00");
  await form.getByLabel("Client name").fill("Liga");
  await form.getByLabel("Service").selectOption({ index: 1 });
  await form.getByRole("button", { name: "Book" }).click();
  await expect(page.getByRole("status")).toHaveText("Booked Liga at 09:00.");
  await page.getByRole("button", { name: "Block time" }).click();
  const block = page.getByRole("complementary");
  await block.getByLabel("Who").selectOption({ label: "Marta" });
  await block.getByLabel("From").selectOption("09:45");
  await block.getByLabel("To").selectOption("17:00");
  await block.getByRole("button", { name: "Block time" }).click();
  await expect(page.getByRole("status")).toHaveText("Time blocked.");

  // A customer finds no times that day and joins the waitlist.
  const email = uniqueEmail("waiter");
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
  // Marta's day is full; one tap switches to anyone, and the waitlist is offered there.
  await c.getByRole("button", { name: /^Marta/ }).click();
  await c.getByRole("group", { name: "Day" }).getByRole("button").nth(2).click();
  await expect(c.getByText(/No open times on this day/).first()).toBeVisible();
  await expect(c.getByRole("button", { name: "Join the waitlist for this day" })).toHaveCount(0);
  await c.getByRole("button", { name: "Switch to anyone available" }).click();
  await expect(c.getByText("Professional: Anyone available")).toBeVisible();
  await c.getByRole("button", { name: "Join the waitlist for this day" }).click();
  await expect(c.getByLabel("Your name")).toBeFocused();
  await c.getByRole("button", { name: "Join waitlist" }).click();
  await expect(c.getByText("Enter your name.")).toBeVisible();
  await c.getByLabel("Your name").fill("Ana Ozola");
  await expect(c.getByText("Enter your name.")).toHaveCount(0);
  await expectAccessible(c);
  await c.getByRole("button", { name: "Join waitlist" }).click();
  await expect(c.getByRole("status")).toContainText("You're on the waitlist for");
  await expect(c.getByRole("status")).toBeFocused();
  await expect(c.getByRole("link", { name: "See your waitlist" })).toBeVisible();

  await c.goto("/bookings");
  const list = c.getByRole("region", { name: "Waitlist" });
  await expect(list).toContainText("Haircut at");
  await expect(list).toContainText("We'll email you if a time frees up.");
  await expectAccessible(c);

  // The owner sees her waiting, cancels the walk-in, and she is told.
  await page.goto("/dashboard/calendar");
  await page.getByLabel("Date").fill(day.toISOString().slice(0, 10));
  const waiting = page.getByRole("region", { name: /Waiting for a time/ });
  await expect(waiting).toContainText("Ana Ozola");
  await expectAccessible(page);
  await page
    .getByRole("region", { name: "Marta" })
    .getByRole("button", { name: /09:00 Liga/ })
    .click();
  const detail = page.getByRole("complementary");
  await detail.getByRole("button", { name: "Cancel appointment" }).click();
  await detail.getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(page.getByRole("status")).toContainText("Cancelled Liga's appointment");

  await c.reload();
  await expect(list).toContainText("A time opened up and we emailed you.");
  await list.getByRole("link", { name: "See times" }).click();
  await expect(c.getByRole("group", { name: "Morning" }).getByRole("button", { name: "09:00" })).toBeVisible();

  // Leaving the list.
  await c.goto("/bookings");
  await list.getByRole("button", { name: /Leave/ }).click();
  await expect(c.getByRole("status")).toContainText("You've left the waitlist");
  await expect(c.getByRole("status")).toBeFocused();
  await expect(list).toHaveCount(0);
  await context.close();
});

async function businessId(page: Page): Promise<string> {
  await page.goto("/dashboard");
  const link = await page.getByRole("region", { name: "Your booking link" }).getByLabel("Link").inputValue();
  return link.match(/\/b\/([0-9a-f-]+)\/book/)![1];
}
