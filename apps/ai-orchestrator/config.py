"""Configuration settings for AI Orchestrator"""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-ada-002"

    REDIS_URL: str = "redis://localhost:6379"
    MONGODB_URL: str = "mongodb://localhost:27017/agentic_ai_logs"
    MONGO_DB: str = "agentic_ai_logs"

    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:4000"]

    PLANNER_AGENT_URL: str = "http://localhost:8001"
    TUTOR_AGENT_URL: str = "http://localhost:8002"
    QUIZ_AGENT_URL: str = "http://localhost:8003"
    REVISION_AGENT_URL: str = "http://localhost:8004"
    ANALYZER_AGENT_URL: str = "http://localhost:8005"
    ACCESSIBILITY_AGENT_URL: str = "http://localhost:8006"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
