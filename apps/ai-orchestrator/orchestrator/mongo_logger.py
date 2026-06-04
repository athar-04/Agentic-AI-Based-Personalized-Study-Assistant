"""MongoDB interaction logger for all AI agent conversations"""
import os
from datetime import datetime
from typing import Any, Optional
import motor.motor_asyncio


class MongoLogger:
    def __init__(self):
        self.client = None
        self.db = None

    async def connect(self):
        url = os.getenv("MONGODB_URL", "mongodb://localhost:27017/agentic_ai_logs")
        self.client = motor.motor_asyncio.AsyncIOMotorClient(url)
        self.db = self.client[os.getenv("MONGO_DB", "agentic_ai_logs")]
        print("✅ MongoDB logger connected")

    async def disconnect(self):
        if self.client:
            self.client.close()

    async def log_interaction(
        self,
        userId: str,
        sessionId: str,
        task: str,
        payload: Any,
        result: Any,
        agentUsed: str,
    ):
        doc = {
            "userId": userId,
            "sessionId": sessionId,
            "task": task,
            "agentUsed": agentUsed,
            "payload": payload,
            "result": result,
            "timestamp": datetime.utcnow(),
        }
        try:
            await self.db["interaction_logs"].insert_one(doc)
        except Exception as e:
            print(f"MongoDB log error: {e}")

    async def get_chat_history(self, userId: str, limit: int = 20):
        cursor = self.db["chat_history"].find(
            {"userId": userId},
            sort=[("timestamp", -1)],
            limit=limit,
        )
        return await cursor.to_list(length=limit)

    async def save_chat_message(self, userId: str, sessionId: str, role: str, content: str):
        await self.db["chat_history"].insert_one({
            "userId": userId,
            "sessionId": sessionId,
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow(),
        })
