import { expect, test } from "@playwright/test";

import { addService, expectAccessible, martaEveryDay, ownerWithBusiness } from "./helpers";

test.use({ timezoneId: "Europe/Riga" });

test("an owner adds a room for a service, and a booking shows which room it uses", async ({ page }) => {
  await ownerWithBusiness(page);
  await page.goto("/dashboard/services");
  await addService(page, "Massage", "50");
  await page.goto("/dashboard/team");
  await page.getByRole("button", { name: /Marta/ }).click();
  const marta = page.getByRole("region", { name: "Marta" });
  await marta.getByRole("tab", { name: "Services" }).click();
  await marta.getByRole("checkbox", { name: /Massage/ }).check();
  await marta.getByRole("button", { name: "Save services" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved Marta's services.");
  await martaEveryDay(page);

  // Services: add a room, with the name checked first.
  await page.goto("/dashboard/services");
  const rooms = page.getByRole("region", { name: "Rooms and equipment" });
  const add = rooms.getByRole("form", { name: "Add a room or equipment" });
  await add.getByRole("button", { name: "Add" }).click();
  await expect(add.getByText("Enter a name, like Massage room or Laser.")).toBeVisible();
  await add.getByLabel("New room or equipment").fill("Massage room");
  await add.getByRole("button", { name: "Add" }).click();
  await expect(rooms.getByRole("status")).toHaveText("Added Massage room. Tick the services that need it.");
  const room = rooms.getByRole("form", { name: "Massage room" });
  await room.getByRole("checkbox", { name: "Massage" }).check();
  await expectAccessible(page);
  await room.getByRole("button", { name: "Save Massage room" }).click();
  await expect(rooms.getByRole("status")).toHaveText("Saved Massage room.");
  await page.reload();
  await expect(
    page.getByRole("form", { name: "Massage room" }).getByRole("checkbox", { name: "Massage" }),
  ).toBeChecked();

  // A booking for that service gets the room, and the calendar says so.
  const riga = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Riga" }).format(new Date());
  const day = new Date(`${riga}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 2);
  await page.goto("/dashboard/calendar");
  await page.getByLabel("Date").fill(day.toISOString().slice(0, 10));
  await page.getByRole("button", { name: "New appointment" }).click();
  const form = page.getByRole("complementary");
  await form.getByLabel("With").selectOption({ label: "Marta" });
  await form.getByLabel(/^Starts on/).selectOption("10:00");
  await form.getByLabel("Client name").fill("Liga");
  await form.getByLabel("Service").selectOption({ index: 1 });
  await form.getByRole("button", { name: "Book" }).click();
  await expect(page.getByRole("status")).toHaveText("Booked Liga at 10:00.");
  await page
    .getByRole("region", { name: "Marta" })
    .getByRole("button", { name: /10:00 Liga/ })
    .click();
  const detail = page.getByRole("complementary");
  await expect(detail.getByRole("definition").filter({ hasText: "Massage room" })).toBeVisible();

  // Removing the room keeps the booking.
  await page.goto("/dashboard/services");
  const saved = page.getByRole("form", { name: "Massage room" });
  await saved.getByRole("button", { name: "Remove" }).click();
  await saved.getByRole("button", { name: "Yes, remove it" }).click();
  await expect(page.getByRole("region", { name: "Rooms and equipment" }).getByRole("status")).toHaveText(
    "Removed Massage room. Its bookings stay as they are.",
  );
  await expect(page.getByRole("form", { name: "Massage room" })).toHaveCount(0);
});
