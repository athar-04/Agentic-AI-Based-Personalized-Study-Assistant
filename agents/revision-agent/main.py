"""
REVISION AGENT — Implements SM-2 Spaced Repetition algorithm
Based on the Ebbinghaus Forgetting Curve
Intervals: 1 → 3 → 7 → 21 → 30 days
"""

import json
import os
from datetime import UTC, datetime, timedelta

import redis.asyncio as aioredis
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

# ─── SM-2 Algorithm ──────────────────────────────────────────
REVISION_INTERVALS = [1, 3, 7, 21, 30]  # Days


def sm2_next_interval(
    repetitions: int,
    ease_factor: float,
    quality: int,  # 0-5 scale (0=blackout, 5=perfect)
) -> tuple[int, float, int]:
    """
    SM-2 Algorithm implementation.
    Returns: (interval_days, new_ease_factor, new_repetitions)
    """
    if quality < 3:
        # Failed recall — reset
        return 1, max(1.3, ease_factor - 0.2), 0

    if repetitions < len(REVISION_INTERVALS):
        interval = REVISION_INTERVALS[repetitions]
    else:
        interval = round(REVISION_INTERVALS[-1] * ease_factor)

    new_ef = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    new_ef = max(1.3, new_ef)
    new_reps = repetitions + 1

    return interval, new_ef, new_reps


# ─── Models ─────────────────────────────────────────────────
class ScheduleRequest(BaseModel):
    userId: str
    topicId: str
    sessionId: str | None = None
    quality: int = Field(default=3, ge=0, le=5)  # 0-5 recall quality


class RevisionItem(BaseModel):
    userId: str
    topicId: str
    title: str
    content: str | None = None


class UpdateRequest(BaseModel):
    userId: str
    itemId: str
    quality: int = Field(ge=0, le=5)


# ─── Redis client ─────────────────────────────────────────────
redis_client = aioredis.from_url(
    os.getenv("REDIS_URL", "redis://localhost:6379"),
    encoding="utf-8",
    decode_responses=True,
)


async def get_revision_data(user_id: str, topic_id: str) -> dict:
    key = f"revision:{user_id}:{topic_id}"
    data = await redis_client.get(key)
    if data:
        return json.loads(data)
    return {"repetitions": 0, "easeFactor": 2.5, "intervalDays": 1}


async def save_revision_data(user_id: str, topic_id: str, data: dict):
    key = f"revision:{user_id}:{topic_id}"
    await redis_client.setex(key, 86400 * 60, json.dumps(data))


def utcnow() -> datetime:
    # Timezone-aware: naive datetime.utcnow().timestamp() is interpreted as *local* time.
    return datetime.now(UTC)


async def add_to_revision_queue(user_id: str, topic_id: str, next_ts: float):
    """One member per topic: re-scheduling overwrites the score instead of adding a duplicate."""
    queue_key = f"revision:queue:{user_id}"
    await redis_client.zadd(queue_key, {topic_id: next_ts})


# ─── FastAPI App ─────────────────────────────────────────────
app = FastAPI(title="Revision Agent", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
async def health():
    return {"status": "healthy", "agent": "revision"}


@app.post("/schedule")
async def schedule_revision(request: ScheduleRequest):
    """Schedule next revision for a completed topic"""
    data = await get_revision_data(request.userId, request.topicId)

    interval_days, new_ef, new_reps = sm2_next_interval(
        repetitions=data["repetitions"],
        ease_factor=data["easeFactor"],
        quality=request.quality,
    )

    now = utcnow()
    next_date = now + timedelta(days=interval_days)
    next_ts = next_date.timestamp()

    updated_data = {
        "repetitions": new_reps,
        "easeFactor": new_ef,
        "intervalDays": interval_days,
        "topicId": request.topicId,
        "lastRevisedAt": now.isoformat(),
        "nextRevisionAt": next_date.isoformat(),
        "nextRevisionTimestamp": next_ts,
    }

    await save_revision_data(request.userId, request.topicId, updated_data)
    await add_to_revision_queue(request.userId, request.topicId, next_ts)

    return {
        "success": True,
        "data": {
            "topicId": request.topicId,
            "nextRevisionAt": next_date.isoformat(),
            "intervalDays": interval_days,
            "repetitionCount": new_reps,
            "easeFactor": round(new_ef, 2),
            "allIntervals": REVISION_INTERVALS,
        },
    }


@app.get("/due/{userId}")
async def get_due_revisions(userId: str, limit: int = 20):
    """Get items due for revision (sorted by urgency)"""
    queue_key = f"revision:queue:{userId}"
    now_ts = utcnow().timestamp()

    try:
        topic_ids = await redis_client.zrangebyscore(queue_key, 0, now_ts, start=0, num=limit)
        due_items = []
        for topic_id in topic_ids:
            data = await get_revision_data(userId, str(topic_id))
            due_items.append({**data, "topicId": topic_id})
        return {"success": True, "data": {"dueItems": due_items, "count": len(due_items)}}
    except Exception as e:
        return {"success": False, "error": str(e), "data": {"dueItems": [], "count": 0}}


@app.post("/update")
async def update_revision(request: UpdateRequest):
    """Update revision result after a review session"""
    data = await get_revision_data(request.userId, request.itemId)
    interval_days, new_ef, new_reps = sm2_next_interval(
        data["repetitions"],
        data["easeFactor"],
        request.quality,
    )
    now = utcnow()
    next_date = now + timedelta(days=interval_days)
    await save_revision_data(
        request.userId,
        request.itemId,
        {
            **data,
            "repetitions": new_reps,
            "easeFactor": new_ef,
            "intervalDays": interval_days,
            "lastRevisedAt": now.isoformat(),
            "nextRevisionAt": next_date.isoformat(),
            "nextRevisionTimestamp": next_date.timestamp(),
        },
    )
    await add_to_revision_queue(request.userId, request.itemId, next_date.timestamp())
    return {"success": True, "data": {"nextRevisionAt": next_date.isoformat(), "intervalDays": interval_days}}


@app.get("/stats/{userId}")
async def get_stats(userId: str):
    """Get spaced repetition statistics for a user"""
    queue_key = f"revision:queue:{userId}"
    now = utcnow()
    now_ts = now.timestamp()
    future_ts = (now + timedelta(days=7)).timestamp()

    try:
        due_count = await redis_client.zcount(queue_key, 0, now_ts)
        upcoming_count = await redis_client.zcount(queue_key, now_ts, future_ts)
        total_count = await redis_client.zcard(queue_key)

        return {
            "success": True,
            "data": {
                "dueNow": due_count,
                "upcomingWeek": upcoming_count,
                "totalScheduled": total_count,
                "intervals": REVISION_INTERVALS,
            },
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
