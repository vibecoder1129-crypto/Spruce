import { expect, test, type Page } from "@playwright/test";

import { createOwner, enrolTwoStep, expectAccessible, inviteToken, PASSWORD, uniqueEmail } from "./helpers";

/** A new owner with a submitted business, one location and one team member (Marta). */
async function ownerWithBusiness(page: Page) {
  const email = uniqueEmail("owner");
  createOwner(email);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await enrolTwoStep(page);
  await page.getByLabel("Business name").fill(`Linden Studio ${Math.random().toString(36).slice(2, 7)}`);
  await page.locator("label", { hasText: "Hair salon" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Venue name").fill("Old Town");
  await page.getByLabel("Street and number").fill("Kalku iela 1");
  await page.getByLabel("Postcode").fill("LV-1050");
  await page.getByLabel("City").fill("Riga");
  await page.getByLabel("Country").selectOption("LV");
  await page.getByRole("button", { name: "Find on the map" }).click();
  await page.getByLabel("Name customers see").fill("Marta");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await page.getByRole("link", { name: "Go to your dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Your business is in review" })).toBeVisible();
}

async function addService(page: Page, name: string, price: string) {
  await page.getByRole("main").getByRole("button", { name: "Add service" }).first().click();
  const panel = page.getByRole("region", { name: "New service" });
  await panel.getByLabel("Name").fill(name);
  await panel.getByLabel("Price").fill(price);
  await panel.getByRole("button", { name: "Add service" }).click();
  await expect(page.getByRole("status")).toHaveText(`Added ${name}.`);
}

test("an owner sets up services and a team member, who signs in until a permission is revoked", async ({
  page,
  browser,
}) => {
  await ownerWithBusiness(page);

  // Services
  await page.goto("/dashboard/services");
  await expect(page.getByRole("heading", { name: "Add your first service" })).toBeVisible();
  await expectAccessible(page);
  // An empty form explains itself next to each field.
  await page.getByRole("main").getByRole("button", { name: "Add service" }).first().click();
  await page.getByRole("region", { name: "New service" }).getByRole("button", { name: "Add service" }).click();
  await expect(page.getByText("Name the service, for example Haircut.")).toBeVisible();
  await expect(page.getByText("Enter a price, for example 35.")).toBeVisible();
  await expectAccessible(page);
  await addService(page, "Haircut", "35");
  await addService(page, "Colour", "79,50");
  const list = page.getByRole("region", { name: "Hair salon" });
  await expect(list).toContainText("Haircut");
  await expect(list).toContainText("€35.00");
  await expect(list).toContainText("€79.50");
  await expectAccessible(page);

  // The home checklist counts services as done once there is one.
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "Get ready for bookings" })).toContainText("Services and prices, done");

  // Team: assign one service
  await page.goto("/dashboard/team");
  await page.getByRole("button", { name: /Marta/ }).click();
  const panel = page.getByRole("region", { name: "Marta" });
  await expectAccessible(page);
  await panel.getByRole("tab", { name: "Services" }).click();
  await panel.getByRole("checkbox", { name: /Haircut/ }).check();
  await panel.getByRole("button", { name: "Save services" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved Marta's services.");
  await expectAccessible(page);

  // Permissions: everything starts off; grant one
  await panel.getByRole("tab", { name: "Permissions" }).click();
  const calendar = panel.getByRole("switch", { name: "See the calendar" });
  await expect(calendar).toHaveAttribute("aria-checked", "false");
  await expect(panel).toContainText("Plan the weekly shifts");
  await calendar.click();
  await expect(calendar).toHaveAttribute("aria-checked", "true");
  await expectAccessible(page);

  // Invite
  await panel.getByRole("tab", { name: "Details" }).click();
  const staffEmail = uniqueEmail("marta");
  await panel.getByLabel("Their email").fill(staffEmail);
  await panel.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByRole("status")).toContainText("Invite sent to Marta");

  // Marta accepts in her own browser
  const staffContext = await browser.newContext({ reducedMotion: "reduce" });
  const staff = await staffContext.newPage();
  await staff.goto(`/invite/${inviteToken(staffEmail)}`);
  await expect(staff.getByRole("heading", { name: /^Join Linden Studio/ })).toBeVisible();
  await expectAccessible(staff);
  await staff.getByLabel("Password").fill(PASSWORD);
  await staff.getByRole("checkbox", { name: /I agree to the terms/ }).check();
  await staff.getByRole("button", { name: "Join the team" }).click();
  await expect(staff).toHaveURL(/\/staff$/);
  await expect(staff.getByRole("heading", { name: "Hi, Marta" })).toBeVisible();
  await expect(staff.getByRole("region", { name: "Your services" })).toContainText("Haircut");
  await expect(staff.getByRole("region", { name: "Your services" })).not.toContainText("Colour");
  await expect(staff.getByRole("region", { name: "What you can do" })).toContainText("See the calendar");
  await expectAccessible(staff);

  // The owner turns the permission off: Marta is signed out on her next request.
  await panel.getByRole("tab", { name: "Permissions" }).click();
  await panel.getByRole("switch", { name: "See the calendar" }).click();
  await expect(panel.getByRole("alertdialog")).toContainText("signs Marta out");
  await panel.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByRole("status")).toContainText("Marta was signed out");

  await staff.reload();
  await expect(staff).toHaveURL(/\/login\?signed-out$/);
  await expect(staff.getByRole("status")).toHaveText("You're signed out. Log in to continue.");
  await staffContext.close();
});
