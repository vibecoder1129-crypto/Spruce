import { expect, test } from "@playwright/test";

import { expectAccessible, ownerWithBusiness } from "./helpers";

// Fresha's client export headers, with a duplicate (same email, other case) and a bad email.
const CSV = [
  "First Name,Last Name,Mobile Number,Email,Note",
  'Ana,Ozola,+371 2000 0001,ana@example.lv,"Likes tea, no sugar"',
  "Jānis,Bērziņš,+371 2000 0002,,",
  "Ana,O.,,ANA@example.lv,",
  "Līga,Kalniņa,,not-an-email,",
].join("\n");

test("an owner imports clients from a Fresha export and finds one by search", async ({ page }) => {
  await ownerWithBusiness(page);
  await page.goto("/dashboard/clients");
  await expect(page.getByRole("heading", { name: "Bring your clients with you" })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: "Import clients" }).first().click();
  await page
    .getByLabel("CSV file")
    .setInputFiles({ name: "clients.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });

  // The columns are matched from Fresha's headers, and the check runs before anything is saved.
  await expect(page.getByLabel("First name")).toHaveValue("0");
  await expect(page.getByLabel("Phone")).toHaveValue("2");
  await expect(page.getByLabel("Full name")).toHaveValue("-1");
  await expect(page.getByText("2 new clients to import, 1 already in your list, 1 to skip.")).toBeVisible();
  await expect(page.getByText("Row 5: Email doesn't look right.")).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: "Import 2 clients" }).click();
  await expect(page.getByRole("status")).toHaveText("Imported 2 clients. 1 was already in your list. 1 skipped.");
  await expect(page.getByRole("heading", { name: "2 clients" })).toBeVisible();
  await expectAccessible(page);

  await page.getByLabel("Search clients").fill("2000 0002");
  const list = page.getByRole("main").getByRole("listitem");
  await expect(list).toHaveCount(1);
  await expect(list).toContainText("Jānis Bērziņš");
  await page.getByLabel("Search clients").fill("ozola");
  await expect(list).toContainText("Likes tea, no sugar");
});
