import { expect, test } from "@playwright/test";

import { expectAccessible, growBusiness, ownerWithBusiness } from "./helpers";

const PEOPLE = [
  "Ilze",
  "Janis",
  "Liga",
  "Peteris",
  "Anna",
  "Karlis",
  "Rasa",
  "Edgars",
  "Inese",
  "Toms",
  "Laura",
  "Maris",
  "Zane",
  "Arturs",
];

test("a big venue: fifteen people in their own colours, filtered by chips, and a second location", async ({ page }) => {
  const name = await ownerWithBusiness(page);
  growBusiness(name, PEOPLE, "Centre");
  await page.goto("/dashboard/calendar");

  // Fifteen columns, each headed by the person's name. The board scrolls sideways.
  const team = page.getByRole("group", { name: "Team" });
  await expect(team.getByRole("button", { name: "Everyone (15)" })).toHaveAttribute("aria-pressed", "true");
  for (const person of ["Marta", ...PEOPLE]) await expect(page.getByRole("region", { name: person })).toBeVisible();
  await expectAccessible(page);

  // Hide two people, then bring everyone back.
  await team.getByRole("button", { name: /Marta$/ }).click();
  await team.getByRole("button", { name: /Ilze$/ }).click();
  await expect(page.getByRole("region", { name: "Marta" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Ilze" })).toHaveCount(0);
  await expect(team.getByRole("button", { name: "Everyone (15)" })).toHaveAttribute("aria-pressed", "false");
  await team.getByRole("button", { name: "Everyone (15)" }).click();
  await expect(page.getByRole("region", { name: "Marta" })).toBeVisible();

  // The week view picks one person from the same chips.
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.getByRole("group", { name: "Whose week" }).getByRole("button", { name: /Rasa$/ }).click();
  await expect(page.getByRole("region", { name: "Rasa's week" })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Day", exact: true }).click();

  // A second location has its own, empty team.
  const places = page.getByRole("group", { name: "Location" });
  await expect(places.getByRole("button", { name: "Old Town" })).toHaveAttribute("aria-pressed", "true");
  await places.getByRole("button", { name: "Centre" }).click();
  await expect(page.getByText("No one works at this location yet. Add your team first.")).toBeVisible();
  await places.getByRole("button", { name: "Old Town" }).click();
  await expect(page.getByRole("region", { name: "Marta" })).toBeVisible();
  await expectAccessible(page);
});
