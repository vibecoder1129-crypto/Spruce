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

test("a customer fills in the venue's form, and the venue reads it and records a patch test", async ({
  page,
  browser,
}) => {
  const name = await ownerWithBusiness(page);
  await page.goto("/dashboard/services");
  await addService(page, "Facial", "50");
  await page.goto("/dashboard/team");
  await page.getByRole("button", { name: /Marta/ }).click();
  const marta = page.getByRole("region", { name: "Marta" });
  await marta.getByRole("tab", { name: "Services" }).click();
  await marta.getByRole("checkbox", { name: /Facial/ }).check();
  await marta.getByRole("button", { name: "Save services" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved Marta's services.");
  await martaEveryDay(page);
  approveBusiness(name);

  // Services: a form with two questions, used for the facial.
  await page.goto("/dashboard/services");
  const forms = page.getByRole("region", { name: "Consultation forms" });
  const add = forms.getByRole("form", { name: "Add a consultation form" });
  await add.getByRole("button", { name: "Add" }).click();
  await expect(add.getByText("Enter a name, like Skin consultation.")).toBeVisible();
  await add.getByLabel("New form").fill("Skin check");
  await add.getByRole("button", { name: "Add" }).click();
  await expect(forms.getByRole("status")).toHaveText(
    "Added Skin check. Write its questions and tick the services that use it.",
  );
  const skin = forms.getByRole("form", { name: "Skin check" });
  await skin.getByLabel("Question 1", { exact: true }).fill("Any allergies?");
  await skin.getByRole("button", { name: "Add a question" }).click();
  await skin.getByLabel("Question 2", { exact: true }).fill("Are you pregnant?");
  await skin.getByRole("checkbox", { name: "Facial" }).check();
  await expectAccessible(page);
  await skin.getByRole("button", { name: "Save Skin check" }).click();
  await expect(forms.getByRole("status")).toHaveText("Saved Skin check.");
  await page.reload();
  const saved = page.getByRole("form", { name: "Skin check" });
  await expect(saved.getByLabel("Question 2", { exact: true })).toHaveValue("Are you pregnant?");
  await expect(saved.getByLabel("Answer type for question 2")).toHaveValue("yes_no");
  await expect(saved.getByRole("checkbox", { name: "Facial" })).toBeChecked();

  // A customer books, then fills the form in from Your bookings.
  const email = uniqueEmail("client");
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
  const id = await businessId(page);
  await c.goto(`/b/${id}`);
  await c.getByRole("link", { name: "Book Facial" }).click();
  await c.getByRole("button", { name: /^Marta/ }).click();
  await c.getByRole("group", { name: "Day" }).getByRole("button").nth(1).click();
  await c.getByRole("group", { name: "Morning" }).getByRole("button", { name: "09:00" }).click();
  await c.getByLabel("Your name").fill("Ana Ozola");
  await c.getByRole("button", { name: "Confirm booking" }).click();
  await expect(c.getByRole("heading", { name: /You're booked/ })).toBeVisible();

  await c.goto("/bookings");
  await expect(c.getByText(new RegExp(`${name} asks you to fill in a short form before your visit, .+ at 09:00\\.`))).toBeVisible();
  await c.getByRole("link", { name: /^Fill in the form/ }).click();
  await expect(c.getByRole("heading", { name: "Skin check" })).toBeVisible();
  await c.getByLabel("Any allergies? (optional)").fill("Nuts");
  await c.getByRole("button", { name: "Send answers" }).click();
  await expect(c.getByText("Choose yes or no.")).toBeVisible();
  await expect(c.getByRole("radio", { name: "Yes" })).toBeFocused();
  await expectAccessible(c);
  await c.getByRole("radio", { name: "No" }).check();
  // Answers can be health information, so they need the customer's say-so.
  await c.getByRole("button", { name: "Send answers" }).click();
  await expect(c.getByText("Tick this box to send your answers. They may include health information.")).toBeVisible();
  await expect(c.getByRole("checkbox", { name: /I agree to the venue keeping these answers/ })).toBeFocused();
  await c.getByRole("checkbox", { name: /I agree to the venue keeping these answers/ }).check();
  await c.getByRole("button", { name: "Send answers" }).click();
  await expect(c.getByRole("status")).toContainText("Thanks, the venue has your answers.");
  await expect(c.getByRole("status")).toBeFocused();
  await c.goto("/bookings");
  await expect(c.getByRole("link", { name: /^Change your answers/ })).toBeVisible();

  // The venue reads the answers on the appointment, and records a patch test.
  await page.goto("/dashboard/services");
  await page.getByRole("button", { name: /Facial/ }).click();
  const panel = page.getByRole("region", { name: "Edit Facial" });
  await panel.getByRole("checkbox", { name: /Needs a patch test/ }).check();
  await panel.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Saved Facial.");
  await expect(page.getByText("45 min · Needs a patch test")).toBeVisible();

  const riga = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Riga" }).format(new Date());
  const tomorrow = new Date(`${riga}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await page.goto("/dashboard/calendar");
  await page.getByLabel("Date").fill(tomorrow.toISOString().slice(0, 10));
  await page
    .getByRole("region", { name: "Marta" })
    .getByRole("button", { name: /09:00 Ana Ozola/ })
    .click();
  const detail = page.getByRole("complementary");
  const answers = detail.getByRole("region", { name: "Consultation form" });
  await answers.getByRole("button", { name: "Show answers" }).click();
  await expect(answers.getByRole("definition").filter({ hasText: "Nuts" })).toBeVisible();
  await expect(answers.getByRole("definition").filter({ hasText: "No" })).toBeVisible();
  await expect(detail.getByRole("definition").filter({ hasText: "None recorded" })).toBeVisible();
  await expectAccessible(page);
  await detail.getByRole("button", { name: "Record patch test today" }).click();
  await detail.getByRole("button", { name: "Yes, record it" }).click();
  await expect(detail.getByRole("status")).toHaveText("Patch test recorded for Ana Ozola today.");
  await expect(detail.getByRole("definition").filter({ hasText: /^Done / })).toBeVisible();

  // Booking pages say a patch test is needed before a time is picked.
  await c.goto(`/b/${id}/book`);
  await expect(c.getByText("Needs a patch test")).toBeVisible();
  await c.getByRole("button", { name: /Facial/ }).click();
  await expect(c.getByText(/This needs a patch test at .* at least 48 hours before your visit/)).toBeVisible();
  await context.close();
});

async function businessId(page: Page): Promise<string> {
  await page.goto("/dashboard");
  const link = await page.getByRole("region", { name: "Your booking link" }).getByLabel("Link").inputValue();
  return link.match(/\/b\/([0-9a-f-]+)\/book/)![1];
}
