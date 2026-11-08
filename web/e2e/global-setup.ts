import { execSync } from "node:child_process";

/** Clear rate-limit counters so repeated local runs don't trip the signup limit. */
export default function globalSetup() {
  execSync(
    `uv run python -c "import asyncio; from app.redis import get_redis
async def main():
    r = get_redis()
    keys = [k async for k in r.scan_iter('rl:*')]
    if keys: await r.delete(*keys)
asyncio.run(main())"`,
    {
      cwd: "../api",
      stdio: "inherit",
      env: { ...process.env, SPRUCE_DATA_KEY: "x", SPRUCE_INDEX_KEY: "x" },
    },
  );
}
