"""Fixed-window rate limits in Redis. Keys hold hashes, never raw emails or IPs."""

import hashlib

from fastapi import HTTPException, status

from app.redis import get_redis


async def hit(bucket: str, subject: str, *, limit: int, window_seconds: int) -> None:
    digest = hashlib.sha256(subject.encode()).hexdigest()[:32]
    key = f"rl:{bucket}:{digest}"
    redis = get_redis()
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, window_seconds)
    if count > limit:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Please wait a few minutes and try again.",
            headers={"Retry-After": str(window_seconds)},
        )
