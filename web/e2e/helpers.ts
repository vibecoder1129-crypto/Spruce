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
export function createOwner(email: string) {
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
        role=Role.owner,
        terms_version=TERMS_VERSION,
        terms_accepted_at=utcnow(),
    ))
    await db.commit()`,
    { ARG_EMAIL: email, ARG_PASSWORD: PASSWORD },
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
