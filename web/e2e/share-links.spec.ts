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

test.use({ timezoneId: "Europe/Riga" });

test("an owner shares an Instagram link, a customer books through it, and Home counts it", async ({
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

  // Each place gets its own link; the website button is shown as it will look.
  await page.goto("/dashboard");
  const share = page.getByRole("region", { name: "Your booking link" });
  await expect(share.getByLabel("Link")).toHaveValue(/\/book$/);
  await share.getByText("Instagram", { exact: true }).click();
  await expect(share.getByRole("radio", { name: "Instagram" })).toBeChecked();
  await expect(share.getByLabel("Link")).toHaveValue(/\/book\?from=instagram$/);
  await expect(share.getByText(/tap Edit profile, then Links/)).toBeVisible();
  await expect(share.getByText("How it looks on your website")).toBeVisible();
  await expect(share.getByLabel("Button for your website")).toHaveValue(/\/book\?from=website"/);
  await expect(share.getByRole("region", { name: "Where online bookings came from" })).toHaveCount(0);
  await expectAccessible(page);
  // Keyboard: arrow keys move between places.
  await share.getByRole("radio", { name: "Instagram" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(share.getByRole("radio", { name: "Google" })).toBeChecked();
  await expect(share.getByLabel("Link")).toHaveValue(/\/book\?from=google$/);
  await share.getByText("Instagram", { exact: true }).click();
  const link = await share.getByLabel("Link").inputValue();

  // A customer taps the link in the venue's Instagram bio and books.
  const email = uniqueEmail("follower");
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
  await c.goto(link);
  await c.getByRole("button", { name: /Haircut/ }).click();
  await c.getByRole("button", { name: /^Marta/ }).click();
  await c.getByRole("group", { name: "Day" }).getByRole("button").nth(1).click();
  await c.getByRole("group", { name: "Morning" }).getByRole("button", { name: "09:00" }).click();
  await expect(c).toHaveURL(/from=instagram/);
  await c.getByLabel("Your name").fill("Ana Ozola");
  await c.getByRole("button", { name: "Confirm booking" }).click();
  await expect(c.getByRole("heading", { name: /You're booked/ })).toBeVisible();
  await context.close();

  await page.reload();
  const counts = page.getByRole("region", { name: "Where online bookings came from" });
  await expect(counts).toContainText("Instagram");
  await expect(counts.getByRole("definition")).toHaveText(["1"]);
  await expectAccessible(page);
});
