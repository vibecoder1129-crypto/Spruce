import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import * as OTPAuth from "otpauth";

export const PASSWORD = "correct horse battery";

export function uniqueEmail(tag: string) {
  return `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.lv`;
}

export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

/** Turns on two-step verification on the setup page and returns the authenticator. */
export async function enrolTwoStep(page: Page) {
  await expect(page).toHaveURL(/\/account\/security$/);
  await page.getByText("Can't scan? Enter the key by hand").click();
  const secret = (await page.locator("details p").textContent())!.replace(/\s/g, "");
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
  await page.getByLabel("6-digit code").fill(totp.generate());
  await page.getByRole("button", { name: "I've saved them" }).click();
  return totp;
}

/** Platform admins are created from the command line only (slice 8 adds delegation). */
export function createAdmin(email: string) {
  apiPython(
    `from app.cli import create_admin
async def main(db):
    await create_admin(db, os.environ["ARG_EMAIL"], os.environ["ARG_PASSWORD"])`,
    { ARG_EMAIL: email, ARG_PASSWORD: PASSWORD },
  );
}

/**
 * An owner account made directly in the database, so the suite stays under the per-IP signup
 * limit. Signing up through the page is covered by the onboarding tests.
 */
export function createOwner(email: string, role: "owner" | "consumer" = "owner") {
  apiPython(
    `from app.crypto import email_index, encrypt, hash_password, normalize_email
from app.identity.models import Role, User
from app.identity.schemas import TERMS_VERSION
from app.models_base import utcnow
async def main(db):
    email = os.environ["ARG_EMAIL"]
    db.add(User(
        email_index=email_index(email),
        email_encrypted=encrypt(normalize_email(email), "users.email"),
        password_hash=hash_password(os.environ["ARG_PASSWORD"]),
        role=Role[os.environ["ARG_ROLE"]],
        terms_version=TERMS_VERSION,
        terms_accepted_at=utcnow(),
    ))
    await db.commit()`,
    { ARG_EMAIL: email, ARG_PASSWORD: PASSWORD, ARG_ROLE: role },
  );
}

/** Stands in for a platform admin approving the business (the admin pages are tested on their own). */
export function approveBusiness(name: string) {
  apiPython(
    `from sqlalchemy import text
async def main(db):
    await db.execute(text("UPDATE businesses SET approval_status = 'approved' WHERE name = :n"), {"n": os.environ["ARG_NAME"]})
    await db.commit()`,
    { ARG_NAME: name },
  );
}

/**
 * Stands in for the staff member's inbox: the API only prints emails in tests, so this swaps
 * the invite sent to `email` for a token the test knows, using the same hashing as the API.
 */
export function inviteToken(email: string): string {
  return apiPython(
    `from sqlalchemy import update
from app.crypto import email_index, hash_token, new_token
from app.team.models import StaffInvite
async def main(db):
    token = new_token()
    await db.execute(
        update(StaffInvite)
        .where(StaffInvite.email_index == email_index(os.environ["ARG_EMAIL"]), StaffInvite.used_at.is_(None))
        .values(token_hash=hash_token(token))
    )
    await db.commit()
    print(token)`,
    { ARG_EMAIL: email },
  );
}

/** A new owner with a submitted business, one location and one team member (Marta). Returns its name. */
export async function ownerWithBusiness(page: Page): Promise<string> {
  const email = uniqueEmail("owner");
  createOwner(email);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await enrolTwoStep(page);
  const name = `Linden Studio ${Math.random().toString(36).slice(2, 7)}`;
  await page.getByLabel("Business name").fill(name);
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
  return name;
}

export async function addService(page: Page, name: string, price: string) {
  await page.getByRole("main").getByRole("button", { name: "Add service" }).first().click();
  const panel = page.getByRole("region", { name: "New service" });
  await panel.getByLabel("Name").fill(name);
  await panel.getByLabel("Price").fill(price);
  await panel.getByRole("button", { name: "Add service" }).click();
  await expect(page.getByRole("status")).toHaveText(`Added ${name}.`);
}

/** Runs `async def main(db)` against the e2e database, with the API's own code. */
function apiPython(body: string, args: Record<string, string>): string {
  const script = `import asyncio, os
from app.db import get_sessionmaker
${body}
async def run():
    async with get_sessionmaker()() as db:
        await main(db)
asyncio.run(run())`;
  return execFileSync("uv", ["run", "python", "-c", script], {
    cwd: "../api",
    encoding: "utf8",
    env: {
      ...process.env,
      ...args,
      SPRUCE_DATA_KEY: "ZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGQ=",
      SPRUCE_INDEX_KEY: "aWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWk=",
    },
  })
    .trim()
    .split("\n")
    .at(-1)!;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Marta works every day 09:00 to 17:00, this week and next, so tomorrow always has times. */
export async function martaEveryDay(page: Page) {
  // Wait for each week's saved shifts to load, so they don't replace what's picked next.
  const loaded = () => page.waitForResponse((r) => r.url().includes("/shifts?week=") && r.request().method() === "GET");
  await Promise.all([loaded(), page.goto("/dashboard/team/shifts")]);
  for (const week of ["This week", "Next week"]) {
    if (week === "Next week") await Promise.all([loaded(), page.getByRole("button", { name: week }).click()]);
    for (const day of DAYS) await page.getByLabel(`Marta, ${day}, starts`).selectOption("09:00");
    await page.getByRole("button", { name: "Save week" }).click();
    await expect(page.getByText("Unsaved changes")).toBeHidden();
  }
}

/** Stands in for the clock: the business's bookings started a minute ago, so they can be marked. */
export function startBookings(name: string) {
  apiPython(
    `from sqlalchemy import text
async def main(db):
    await db.execute(text("""UPDATE bookings SET starts_at = now() - interval '1 minute',
        ends_at = now() + interval '44 minutes'
        WHERE business_id = (SELECT id FROM businesses WHERE name = :n)"""), {"n": os.environ["ARG_NAME"]})
    await db.commit()`,
    { ARG_NAME: name },
  );
}

/** Stands in for a larger venue: `count` more team members at the first location, and a second location. */
export function growBusiness(name: string, people: string[], secondLocation: string) {
  apiPython(
    `from sqlalchemy import text
async def main(db):
    b = (await db.execute(text("SELECT id FROM businesses WHERE name = :n"), {"n": os.environ["ARG_NAME"]})).scalar_one()
    loc = (await db.execute(text("SELECT id FROM locations WHERE business_id = :b ORDER BY created_at LIMIT 1"), {"b": b})).scalar_one()
    for i, person in enumerate(os.environ["ARG_PEOPLE"].split(",")):
        await db.execute(text("""INSERT INTO staff_profiles (id, created_at, business_id, location_id, display_name, title, active)
            VALUES (gen_random_uuid(), now() + make_interval(secs => :i + 1), :b, :l, :n, '', true)"""), {"i": i, "b": b, "l": loc, "n": person})
    await db.execute(text("""INSERT INTO locations (id, created_at, business_id, name, street, postal_code, city, country_code,
        address_text, latitude, longitude, timezone)
        SELECT gen_random_uuid(), now() + interval '1 hour', business_id, :n, street, postal_code, city, country_code,
        address_text, latitude, longitude, timezone FROM locations WHERE id = :l"""), {"n": os.environ["ARG_LOCATION"], "l": loc})
    await db.commit()`,
    { ARG_NAME: name, ARG_PEOPLE: people.join(","), ARG_LOCATION: secondLocation },
  );
}
