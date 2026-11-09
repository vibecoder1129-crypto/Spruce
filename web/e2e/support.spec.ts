import { expect, test } from "@playwright/test";

import {
  addService,
  createAdmin,
  enrolTwoStep,
  expectAccessible,
  ownerWithBusiness,
  PASSWORD,
  uniqueEmail,
} from "./helpers";

test("an owner lets support in, support adds a service, and the owner reads the log", async ({ page, browser }) => {
  const name = await ownerWithBusiness(page);

  // Off until the owner turns it on.
  await page.goto("/dashboard/settings");
  const access = page.getByRole("form", { name: "Support access" });
  await expect(access.getByRole("status")).toHaveText("Off. Support can't sign in.");
  await expectAccessible(page);
  await access.getByLabel("Allow support").selectOption({ label: "For 3 days" });
  await access.getByRole("button", { name: "Allow support" }).click();
  await expect(access.getByRole("status")).toContainText("On until");

  // A platform admin opens the dashboard as support.
  const adminEmail = uniqueEmail("admin");
  createAdmin(adminEmail);
  const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor } = test.info().project.use;
  const context = await browser.newContext({
    viewport,
    userAgent,
    isMobile,
    hasTouch,
    deviceScaleFactor,
    reducedMotion: "reduce",
  });
  const admin = await context.newPage();
  await admin.goto("/login");
  await admin.getByLabel("Email").fill(adminEmail);
  await admin.getByLabel("Password").fill(PASSWORD);
  await admin.getByRole("button", { name: "Log in" }).click();
  await enrolTwoStep(admin);
  await admin.getByRole("button", { name: new RegExp(name) }).click();
  const panel = admin.getByRole("region", { name });
  await expect(panel).toContainText("The owner allows support until");
  await expectAccessible(admin);
  await panel.getByRole("button", { name: "Open as support" }).click();

  const banner = admin.getByRole("region", { name: "Support mode" });
  await expect(banner).toContainText(`You're helping ${name} as Spruce support.`);
  await expect(banner).toContainText("Access ends");
  await expectAccessible(admin);
  await admin.goto("/dashboard/services");
  await addService(admin, "Haircut", "35");
  // The support setting itself is the owner's alone.
  await admin.goto("/dashboard/settings");
  await expect(admin.getByRole("heading", { name: "Cancellation policy" })).toBeVisible();
  await expect(admin.getByRole("form", { name: "Support access" })).toHaveCount(0);
  await admin.getByRole("region", { name: "Support mode" }).getByRole("button", { name: "End support and log out" }).click();
  await expect(admin).toHaveURL(/\/login/);
  await context.close();

  // The owner sees what changed, then turns access off.
  await page.reload();
  await expect(access.getByRole("list")).toContainText(`Added services by ${adminEmail}`);
  await expect(access.getByLabel("Allow support")).toHaveValue("0");
  await access.getByRole("button", { name: "Turn off support access" }).click();
  await expect(access.getByRole("status")).toHaveText("Off. Support can't sign in.");
  await expectAccessible(page);
});
