import { expect, test, type Page } from "@playwright/test";

import { addService, expectAccessible, inviteToken, ownerWithBusiness, PASSWORD, uniqueEmail } from "./helpers";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ROW = 30; // px per 15 minutes

/** Clicks an empty slot in a staff member's column, as an owner would with a mouse. */
async function clickSlot(page: Page, name: string, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const column = page.getByRole("region", { name }).locator(":scope > div");
  const opens = Number(await column.getAttribute("data-opens")); // the board starts at the day's first shift
  const y = ((h * 60 + m - opens) / 15) * ROW + 5;
  await column.click({ position: { x: 30, y } });
}

test("an owner plans shifts, blocks time, books a walk-in from the board and cancels it", async ({ page, browser }) => {
  await ownerWithBusiness(page);
  await page.goto("/dashboard/services");
  await addService(page, "Haircut", "35");

  // Marta does haircuts and may see her own column. Ilze joins too.
  await page.goto("/dashboard/team");
  await page.getByRole("button", { name: /Marta/ }).click();
  const marta = page.getByRole("region", { name: "Marta" });
  await marta.getByRole("tab", { name: "Services" }).click();
  await marta.getByRole("checkbox", { name: /Haircut/ }).check();
  await marta.getByRole("button", { name: "Save services" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved Marta's services.");
  await marta.getByRole("tab", { name: "Permissions" }).click();
  await marta.getByRole("switch", { name: "See the calendar" }).click();
  await expect(marta.getByRole("switch", { name: "See the calendar" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Add team member" }).first().click();
  await page.getByRole("region", { name: "New team member" }).getByLabel("Name").fill("Ilze");
  await page.getByRole("region", { name: "New team member" }).getByRole("button", { name: "Add team member" }).click();
  await expect(page.getByRole("status")).toHaveText("Added Ilze.");

  // Shifts: this week, every day 09:00 to 17:00 for both.
  await page.getByRole("link", { name: "Weekly shifts" }).click();
  await expect(page.getByRole("heading", { name: "Weekly shifts" })).toBeVisible();
  for (const person of ["Marta", "Ilze"]) {
    for (const day of DAYS) await page.getByLabel(`${person}, ${day}, starts`).selectOption("09:00");
  }
  await expect(page.getByLabel("Marta, Monday, ends")).toHaveValue("17:00");
  await expectAccessible(page);
  await page.getByRole("button", { name: "Save week" }).click();
  await expect(page.getByRole("status")).toContainText("Saved the week of");

  // The day board
  await page.goto("/dashboard/calendar");
  const board = page.getByRole("region", { name: "Marta" });
  await expect(board).toContainText("09:00–17:00");
  await expect(page.getByRole("region", { name: "Ilze" })).toBeVisible();
  await expectAccessible(page);

  // Block a lunch hour from the keyboard path
  await page.getByRole("button", { name: "Block time" }).click();
  const block = page.getByRole("complementary");
  await block.getByLabel("Who").selectOption({ label: "Marta" });
  await block.getByLabel("From").selectOption("12:00");
  await block.getByLabel("To").selectOption("13:00");
  await block.getByLabel("Reason").fill("Lunch");
  await expectAccessible(page);
  await block.getByRole("button", { name: "Block time" }).click();
  await expect(page.getByRole("status")).toHaveText("Time blocked.");
  await expect(board.getByRole("button", { name: /Lunch, 12:00 to 13:00/ })).toBeVisible();

  // A walk-in from an empty slot. An empty form says what's missing.
  await clickSlot(page, "Marta", "10:00");
  await page.getByRole("button", { name: "Add appointment at 10:00" }).click();
  const form = page.getByRole("complementary");
  await expect(form.getByRole("heading", { name: "New appointment" })).toBeVisible();
  await form.getByRole("button", { name: "Book" }).click();
  await expect(form.getByText("Enter the client's name.")).toBeVisible();
  await expect(form.getByText("Choose a service.")).toBeVisible();
  await form.getByLabel("Client name").fill("Liga Ozola");
  await form.getByLabel("Phone").fill("+371 2000 0000");
  await form.getByLabel("Service").selectOption({ index: 1 });
  await expectAccessible(page);
  await form.getByRole("button", { name: "Book" }).click();
  await expect(page.getByRole("status")).toHaveText("Booked Liga Ozola at 10:00.");
  const appointment = board.getByRole("button", {
    name: "10:00 Liga Ozola Haircut · Added by the venue (until 10:45)",
  });
  await expect(appointment).toBeVisible();
  // The day at a glance, with a colour key in words.
  const summary = page.getByRole("region", { name: "Day summary" });
  await expect(summary.getByRole("definition").first()).toHaveText("1");
  await expect(summary).toContainText("expected takings");
  await expect(summary.getByRole("list", { name: "Colour key" })).toContainText("Added by the venue");

  // The same time can't be booked twice, even from the keyboard path that skips the board.
  await page.getByRole("button", { name: "New appointment" }).click();
  await form.getByLabel("With").selectOption({ label: "Marta" });
  await form.getByLabel(/^Starts on/).selectOption("10:15");
  await form.getByLabel("Client name").fill("Anna");
  await form.getByLabel("Service").selectOption({ index: 1 });
  await form.getByRole("button", { name: "Book" }).click();
  await expect(form.getByRole("alert")).toHaveText("That time was just taken.");
  await form.getByRole("button", { name: "Close" }).click();

  // Drag it an hour later. The API re-checks the move like any other.
  const column = board.locator(":scope > div");
  const opens = Number(await column.getAttribute("data-opens"));
  await appointment.dragTo(column, {
    sourcePosition: { x: 20, y: 5 },
    targetPosition: { x: 30, y: ((11 * 60 - opens) / 15) * ROW + 5 },
  });
  await expect(page.getByRole("status")).toHaveText("Moved Liga Ozola to 11:00 with Marta.");
  const moved = board.getByRole("button", { name: "11:00 Liga Ozola Haircut · Added by the venue (until 11:45)" });
  await expect(moved).toBeVisible();

  // List view
  await page.getByRole("button", { name: "List" }).click();
  await expect(page.getByRole("table")).toContainText("Liga Ozola");
  await expectAccessible(page);

  // Week view: Marta's week, and an appointment there opens on its day.
  await page.getByRole("button", { name: "Week", exact: true }).click();
  const week = page.getByRole("region", { name: "Marta's week" });
  await expect(week.getByRole("listitem").filter({ hasText: "Liga Ozola" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Next week" })).toBeVisible();
  await expectAccessible(page);
  await week.getByRole("button", { name: /11:00 Liga Ozola/ }).click();
  await expect(page.getByRole("complementary").getByRole("heading", { name: "Liga Ozola" })).toBeVisible();
  await page.getByRole("complementary").getByRole("button", { name: "Close" }).click();

  // Marta sees her own column only.
  await page.goto("/dashboard/team");
  await page.getByRole("button", { name: /Marta/ }).click();
  const staffEmail = uniqueEmail("marta");
  await page.getByRole("region", { name: "Marta" }).getByLabel("Their email").fill(staffEmail);
  await page.getByRole("region", { name: "Marta" }).getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByRole("status")).toContainText("Invite sent to Marta");
  const staffContext = await browser.newContext({ reducedMotion: "reduce" });
  const staff = await staffContext.newPage();
  await staff.goto(`/invite/${inviteToken(staffEmail)}`);
  await staff.getByLabel("Password").fill(PASSWORD);
  await staff.getByRole("checkbox", { name: /I agree to the terms/ }).check();
  await staff.getByRole("button", { name: "Join the team" }).click();
  await expect(staff.getByRole("region", { name: "Your week" })).toContainText("09:00–17:00");
  await expectAccessible(staff);
  await staff.getByRole("link", { name: "Open calendar" }).click();
  await expect(staff.getByRole("region", { name: "Marta" })).toContainText("Liga Ozola");
  await expect(staff.getByRole("region", { name: "Ilze" })).toHaveCount(0);
  await expect(staff.getByRole("button", { name: "New appointment" })).toHaveCount(0);
  await expectAccessible(staff);
  await staffContext.close();

  // Open the appointment and cancel it: the slot is free again.
  await page.goto("/dashboard/calendar");
  await moved.click();
  const detail = page.getByRole("complementary");
  await expect(detail.getByRole("heading", { name: "Liga Ozola" })).toBeVisible();
  await expect(detail).toContainText("+371 2000 0000");
  await expectAccessible(page);
  await detail.getByRole("button", { name: "Cancel appointment" }).click();
  await detail.getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(page.getByRole("status")).toContainText("Cancelled Liga Ozola's appointment");
  await expect(moved).toHaveCount(0);
});
