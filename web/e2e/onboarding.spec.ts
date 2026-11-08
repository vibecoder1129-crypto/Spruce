import { expect, test } from "@playwright/test";

import { createAdmin, enrolTwoStep, expectAccessible, PASSWORD, uniqueEmail } from "./helpers";

test("an owner onboards, waits for review, and an admin approves the business", async ({ page, browser }) => {
  const name = `Linden Studio ${Math.random().toString(36).slice(2, 7)}`;

  await page.goto("/signup?as=business");
  await page.getByLabel("Email").fill(uniqueEmail("owner"));
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("checkbox", { name: /I agree to the terms/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await enrolTwoStep(page);

  // Step 1: business
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: "Tell us about your business" })).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Business name").fill(name);
  await page.locator("label", { hasText: "Hair salon" }).click();
  await expect(page.getByRole("radio", { name: "Hair salon" })).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: location. An address the geocoder can't find is a clear error.
  await expect(page.getByRole("heading", { name: "Where do customers find you?" })).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Venue name").fill("Old Town");
  await page.getByLabel("Street and number").fill("Nowhere 0");
  await page.getByLabel("Postcode").fill("LV-1050");
  await page.getByLabel("City").fill("Riga");
  await page.getByLabel("Country").selectOption("LV");
  // The preview updates as the owner types.
  await expect(page.getByRole("complementary", { name: "Preview" })).toContainText(name);
  await page.getByRole("button", { name: "Find on the map" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("couldn't find that address");
  await page.getByLabel("Street and number").fill("Kalku iela 1");
  await page.getByRole("button", { name: "Find on the map" }).click();

  // Step 3: team
  await expect(page.getByRole("heading", { name: "Who works there?" })).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Name customers see").fill("Marta");
  await page.getByLabel("Title").fill("Stylist");
  await page.getByRole("button", { name: "Continue" }).click();

  // Review and submit
  await expect(page.getByRole("heading", { name: "Check and submit" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Kalku iela 1, LV-1050 Riga, Latvia");
  await expectAccessible(page);
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("heading", { name: "Submitted for review" })).toBeVisible();
  await page.getByRole("link", { name: "Go to your dashboard" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Your business is in review" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Home", includeHidden: true })).toHaveAttribute("aria-current", "page");
  await expectAccessible(page);

  // A platform admin approves it, in a separate browser session.
  const adminEmail = uniqueEmail("admin").replace("@example.lv", "@example.com");
  createAdmin(adminEmail);
  const adminContext = await browser.newContext({ reducedMotion: "reduce" });
  const admin = await adminContext.newPage();
  await admin.goto("/login");
  await admin.getByLabel("Email").fill(adminEmail);
  await admin.getByLabel("Password").fill(PASSWORD);
  await admin.getByRole("button", { name: "Log in" }).click();
  await enrolTwoStep(admin);
  await expect(admin).toHaveURL(/\/admin\/businesses$/);
  await admin.getByRole("button", { name: new RegExp(name) }).click();
  const panel = admin.getByRole("region", { name });
  await expect(panel).toContainText("Kalku iela 1, LV-1050 Riga, Latvia");
  await expect(panel).toContainText("Marta");
  await expectAccessible(admin);
  await panel.getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByText(`${name} is approved.`)).toBeVisible();
  await adminContext.close();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Your business is approved" })).toBeVisible();
});

test("an admin rejects with a reason and the owner resubmits", async ({ page, browser }) => {
  const name = `Birch Barbers ${Math.random().toString(36).slice(2, 7)}`;
  await page.goto("/signup?as=business");
  await page.getByLabel("Email").fill(uniqueEmail("owner"));
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("checkbox", { name: /I agree to the terms/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await enrolTwoStep(page);
  await page.getByLabel("Business name").fill(name);
  await page.locator("label", { hasText: "Barber" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Venue name").fill("Centre");
  await page.getByLabel("Street and number").fill("Brivibas iela 10");
  await page.getByLabel("Postcode").fill("LV-1010");
  await page.getByLabel("City").fill("Riga");
  await page.getByLabel("Country").selectOption("LV");
  await page.getByRole("button", { name: "Find on the map" }).click();
  await page.getByLabel("Name customers see").fill("Janis");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await page.getByRole("link", { name: "Go to your dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Your business is in review" })).toBeVisible();

  const adminEmail = uniqueEmail("admin").replace("@example.lv", "@example.com");
  createAdmin(adminEmail);
  const adminContext = await browser.newContext({ reducedMotion: "reduce" });
  const admin = await adminContext.newPage();
  await admin.goto("/login");
  await admin.getByLabel("Email").fill(adminEmail);
  await admin.getByLabel("Password").fill(PASSWORD);
  await admin.getByRole("button", { name: "Log in" }).click();
  await enrolTwoStep(admin);
  await admin.getByRole("button", { name: new RegExp(name) }).click();
  const panel = admin.getByRole("region", { name });
  await panel.getByRole("button", { name: "Reject…" }).click();
  await panel.locator("label", { hasText: "Profile is incomplete" }).click();
  await panel.getByLabel(/Note for the owner/).fill("Please add a photo of the venue.");
  await expectAccessible(admin);
  await panel.getByRole("button", { name: `Reject ${name}` }).click();
  await expect(admin.getByText(`${name} is rejected.`)).toBeVisible();
  await adminContext.close();

  await page.reload();
  await expect(page.getByText("Reason: Profile is incomplete")).toBeVisible();
  await expect(page.getByText("Please add a photo of the venue.")).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Resubmit for review" }).click();
  await expect(page.getByRole("heading", { name: "Your business is in review" })).toBeVisible();
});
