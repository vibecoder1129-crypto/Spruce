import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import * as OTPAuth from "otpauth";

const PASSWORD = "correct horse battery";

function uniqueEmail(tag: string) {
  return `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.lv`;
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

/** Turns on two-step verification on the setup page and returns the authenticator. */
async function enrolTwoStep(page: Page) {
  await expect(page).toHaveURL(/\/account\/security$/);
  await page.getByText("Can't scan? Enter the key by hand").click();
  const secret = (await page.locator("details p").textContent())!.trim();
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
  await page.getByLabel("6-digit code").fill(totp.generate());
  await page.getByRole("button", { name: "Turn on" }).click();
  await page.getByRole("button", { name: "I've saved them" }).click();
  return totp;
}

/** Platform admins are created from the command line only (slice 8 adds delegation). */
function createAdmin(email: string) {
  execFileSync(
    "uv",
    [
      "run",
      "python",
      "-c",
      `import asyncio, os
from app.cli import create_admin
from app.db import get_sessionmaker
async def main():
    async with get_sessionmaker()() as db:
        await create_admin(db, os.environ["ADMIN_EMAIL"], os.environ["ADMIN_PASSWORD"])
asyncio.run(main())`,
    ],
    {
      cwd: "../api",
      env: {
        ...process.env,
        ADMIN_EMAIL: email,
        ADMIN_PASSWORD: PASSWORD,
        SPRUCE_DATA_KEY: "ZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGQ=",
        SPRUCE_INDEX_KEY: "aWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWk=",
      },
    },
  );
}

test("an owner onboards, waits for review, and an admin approves the business", async ({ page, browser }) => {
  const name = `Linden Studio ${Math.random().toString(36).slice(2, 7)}`;

  await page.goto("/signup?as=business");
  await page.getByLabel("Email").fill(uniqueEmail("owner"));
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("checkbox", { name: /I agree to the Terms/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await enrolTwoStep(page);

  // Step 1: business
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: "Tell us about your business" })).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Business name").fill(name);
  await page.getByLabel("What do you offer?").selectOption("hair");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: location. An address the geocoder can't find is a clear error.
  await expect(page.getByRole("heading", { name: "Where do customers find you?" })).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Venue name").fill("Old Town");
  await page.getByLabel("Street and number").fill("Nowhere 0");
  await page.getByLabel("Postcode").fill("LV-1050");
  await page.getByLabel("City").fill("Riga");
  await page.getByLabel("Country").selectOption("LV");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("couldn't find that address");
  await page.getByLabel("Street and number").fill("Kalku iela 1");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3: team
  await expect(page.getByRole("heading", { name: "Who works there?" })).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Name customers see").fill("Marta");
  await page.getByLabel("Title").fill("Stylist");
  await page.getByRole("button", { name: "Continue" }).click();

  // Review and submit
  await expect(page.getByRole("heading", { name: "Check and submit" })).toBeVisible();
  await expect(page.getByText("Kalku iela 1, LV-1050 Riga, Latvia")).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Submit for review" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("In review")).toBeVisible();
  await expect(page.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
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
  await expect(admin.getByRole("heading", { name })).toBeVisible();
  await expectAccessible(admin);
  await admin.getByRole("button", { name: `Approve ${name}` }).click();
  await expect(admin.getByText(`${name} is approved.`)).toBeVisible();
  await adminContext.close();

  await page.reload();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
});

test("an admin rejects with a reason and the owner resubmits", async ({ page, browser }) => {
  const name = `Birch Barbers ${Math.random().toString(36).slice(2, 7)}`;
  await page.goto("/signup?as=business");
  await page.getByLabel("Email").fill(uniqueEmail("owner"));
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("checkbox", { name: /I agree to the Terms/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await enrolTwoStep(page);
  await page.getByLabel("Business name").fill(name);
  await page.getByLabel("What do you offer?").selectOption("barber");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Venue name").fill("Centre");
  await page.getByLabel("Street and number").fill("Brivibas iela 10");
  await page.getByLabel("Postcode").fill("LV-1010");
  await page.getByLabel("City").fill("Riga");
  await page.getByLabel("Country").selectOption("LV");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Name customers see").fill("Janis");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("In review")).toBeVisible();

  const adminEmail = uniqueEmail("admin").replace("@example.lv", "@example.com");
  createAdmin(adminEmail);
  const adminContext = await browser.newContext({ reducedMotion: "reduce" });
  const admin = await adminContext.newPage();
  await admin.goto("/login");
  await admin.getByLabel("Email").fill(adminEmail);
  await admin.getByLabel("Password").fill(PASSWORD);
  await admin.getByRole("button", { name: "Log in" }).click();
  await enrolTwoStep(admin);
  await admin.getByRole("button", { name: `Reject ${name}` }).click();
  const dialog = admin.getByRole("dialog", { name: `Reject ${name}` });
  await expect(dialog).toBeVisible();
  await expectAccessible(admin);
  await dialog.getByRole("radio", { name: "Profile is incomplete" }).check();
  await dialog.getByLabel(/Note for the owner/).fill("Please add a photo of the venue.");
  await dialog.getByRole("button", { name: "Reject" }).click();
  await expect(admin.getByText(`${name} is rejected.`)).toBeVisible();
  await adminContext.close();

  await page.reload();
  await expect(page.getByText("Reason: Profile is incomplete")).toBeVisible();
  await expect(page.getByText("Please add a photo of the venue.")).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Resubmit for review" }).click();
  await expect(page.getByText("In review")).toBeVisible();
});
