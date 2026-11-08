"""Redis-backed memory manager for AI context"""

import json
import os
from typing import Any

import redis.asyncio as aioredis


class MemoryManager:
    def __init__(self):
        self.redis = aioredis.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6379"),
            encoding="utf-8",
            decode_responses=True,
        )
        self.ttl = 86400  # 24 hours

    async def get_context(self, user_id: str) -> dict[str, Any]:
        key = f"ai:context:{user_id}"
        try:
            data = await self.redis.get(key)
            return json.loads(data) if data else {}
        except Exception:
            return {}

    async def update_context(self, user_id: str, update: dict[str, Any]) -> None:
        if not update:
            return
        key = f"ai:context:{user_id}"
        try:
            current = await self.get_context(user_id)
            current.update(update)
            await self.redis.setex(key, self.ttl, json.dumps(current))
        except Exception:
            pass

    async def clear_context(self, user_id: str) -> None:
        await self.redis.delete(f"ai:context:{user_id}")
