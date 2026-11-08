import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import * as OTPAuth from "otpauth";

const PASSWORD = "correct horse battery";

function uniqueEmail(tag: string) {
  return `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.lv`;
}

/** Fails the test on any CSP violation or uncaught error, so a blocked script can't hide. */
function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("console", (msg) => {
    // A 401 after logout is expected; the browser logs every failed fetch as an error.
    if (msg.type() === "error" && !msg.text().startsWith("Failed to load resource")) {
      problems.push(msg.text());
    }
  });
  page.on("pageerror", (err) => problems.push(err.message));
  return problems;
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test("a customer signs up, lands on their account and logs out", async ({ page }) => {
  const problems = watchConsole(page);
  const email = uniqueEmail("ana");

  await page.goto("/signup");
  await expectAccessible(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("checkbox", { name: /I agree to the terms/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText("Not confirmed")).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);
  expect(problems).toEqual([]);
});

test("a wrong password shows a clear error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(uniqueEmail("nobody"));
  await page.getByLabel("Password").fill("not the password at all");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Email or password is incorrect.");
});

test("the password can be shown and hidden again", async ({ page }) => {
  await page.goto("/login");
  const password = page.getByLabel("Password");
  await password.fill("a quiet morning walk");
  await expect(password).toHaveAttribute("type", "password");
  const toggle = page.getByRole("button", { name: "Show password" });
  await toggle.click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(password).toHaveAttribute("type", "password");
});

test("a business owner is taken through two-step setup before onboarding", async ({ page, context }) => {
  const problems = watchConsole(page);
  const email = uniqueEmail("owner");

  await page.goto("/signup?as=business");
  await expect(page.getByRole("radio", { name: /I run a business/ })).toBeChecked();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("checkbox", { name: /I agree to the terms/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/account\/security$/);
  await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  await expectAccessible(page);

  await page.getByText("Can't scan? Enter the key by hand").click();
  const secret = (await page.locator("details p").textContent())!.replace(/\s/g, "");
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
  // The sixth digit submits the code; there's no button to press.
  await page.getByLabel("6-digit code").fill(totp.generate());

  await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Recovery codes" }).getByRole("listitem")).toHaveCount(10);
  await page.getByRole("button", { name: "I've saved them" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  // A new device must pass the second step before the business pages.
  await context.clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/login\/verify$/);
  await expectAccessible(page);
  await page.getByLabel("6-digit code").fill(totp.generate({ timestamp: Date.now() + 30_000 }));
  await expect(page).toHaveURL(/\/onboarding$/);
  expect(problems).toEqual([]);
});

test("signup says what is missing, next to the field, before sending anything", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("button", { name: "Create account" }).click();
  const email = page.getByLabel("Email");
  await expect(email).toBeFocused();
  await expect(email).toHaveAccessibleDescription("Enter your email.");
  await expect(page.getByText("Choose a password.")).toBeVisible();
  await expect(page.getByText("Tick this box to continue.")).toBeVisible();

  await email.fill("marta@");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(email).toHaveAccessibleDescription("Enter an email like name@example.com.");
  await expect(page.getByLabel("Password")).toHaveAccessibleDescription(/Use at least 12 characters\. You have 5\./);
  await expect(page).toHaveURL(/\/signup$/);
  await expectAccessible(page);
});

test("sign-in pages keep data on this origin", async ({ request }) => {
  for (const path of ["/login", "/signup", "/account", "/account/security"]) {
    const csp = (await request.get(path)).headers()["content-security-policy"];
    expect(csp, path).toContain("connect-src 'self'");
    expect(csp, path).toContain("form-action 'self'");
    expect(csp, path).toContain("frame-ancestors 'none'");
  }
});
