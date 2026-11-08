"""
PLANNER AGENT — Generates adaptive study plans using Bloom's Taxonomy
Uses LangGraph for stateful multi-step planning
"""

import json
import os
from datetime import datetime, timedelta
from typing import Any, TypedDict

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from pydantic import BaseModel, Field

load_dotenv()

# ─── LLM ────────────────────────────────────────────────────
llm = ChatOpenAI(
    model=os.getenv("OPENAI_MODEL", "gpt-4o"),
    temperature=0.3,
    api_key=os.getenv("OPENAI_API_KEY"),
    base_url=os.getenv("OPENAI_BASE_URL") or None,  # e.g. Ollama: http://host.docker.internal:11434/v1
)


# ─── Models ─────────────────────────────────────────────────
class PlanRequest(BaseModel):
    userId: str
    subject: str
    examDate: str | None = None
    dailyHours: float = Field(default=2.0, gt=0, le=16)
    currentLevel: str = "beginner"
    topics: list[str] | None = None
    context: dict[str, Any] = {}
    sessionId: str | None = None


class PlannerState(TypedDict):
    subject: str
    examDate: str | None
    dailyHours: float
    currentLevel: str
    topics: list[str]
    generatedTopics: list[dict] | None
    schedule: list[dict] | None
    bloomMapping: dict | None


# ─── Agent Nodes ─────────────────────────────────────────────
async def extract_topics(state: PlannerState) -> PlannerState:
    """Step 1: Extract and structure topics for the subject"""
    prompt = f"""You are an expert curriculum designer.
Subject: {state["subject"]}
Current level: {state["currentLevel"]}
Exam date: {state.get("examDate", "not specified")}

Generate a structured list of 8-15 topics for this subject.
Apply Bloom's Taxonomy levels (REMEMBER, UNDERSTAND, APPLY, ANALYZE, EVALUATE, CREATE).
For each topic provide estimated study hours (0.5-4h).

Return ONLY valid JSON array:
[{{"title": "Topic Name", "bloomLevel": "UNDERSTAND", "estimatedHours": 2.0, "description": "Brief description", "priority": 1}}]
"""
    response = await llm.ainvoke(
        [
            SystemMessage(content="You are a curriculum planning expert. Always return valid JSON."),
            HumanMessage(content=prompt),
        ]
    )
    try:
        content = response.content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        topics = json.loads(content)
        # The LLM sometimes wraps the list ({"topics": [...]}) or returns junk entries.
        if isinstance(topics, dict):
            topics = topics.get("topics")
        if not isinstance(topics, list):
            raise ValueError("expected a JSON array of topics")
        topics = [t for t in topics if isinstance(t, dict) and t.get("title")]
        if not topics:
            raise ValueError("no usable topics")
        return {**state, "generatedTopics": topics}
    except Exception:
        # Fallback default topics
        return {
            **state,
            "generatedTopics": [
                {
                    "title": f"Introduction to {state['subject']}",
                    "bloomLevel": "REMEMBER",
                    "estimatedHours": 1.5,
                    "description": "Core concepts",
                    "priority": 1,
                },
                {
                    "title": f"Core Principles of {state['subject']}",
                    "bloomLevel": "UNDERSTAND",
                    "estimatedHours": 2.0,
                    "description": "Fundamental principles",
                    "priority": 2,
                },
                {
                    "title": "Practical Application",
                    "bloomLevel": "APPLY",
                    "estimatedHours": 2.5,
                    "description": "Hands-on practice",
                    "priority": 3,
                },
                {
                    "title": "Advanced Topics",
                    "bloomLevel": "ANALYZE",
                    "estimatedHours": 3.0,
                    "description": "Deep analysis",
                    "priority": 4,
                },
                {
                    "title": "Exam Preparation",
                    "bloomLevel": "EVALUATE",
                    "estimatedHours": 2.0,
                    "description": "Review and synthesis",
                    "priority": 5,
                },
            ],
        }


async def create_schedule(state: PlannerState) -> PlannerState:
    """Step 2: Create a day-by-day schedule, packing topics into `dailyHours` per day."""
    topics = state.get("generatedTopics") or []
    daily_hours = state["dailyHours"]
    start_date = datetime.now()

    schedule = []
    day = 0
    capacity = daily_hours  # hours left on the current day
    for topic_idx, topic in enumerate(topics):
        try:
            remaining = max(float(topic.get("estimatedHours", 1)), 0.5)
        except (TypeError, ValueError):
            remaining = 1.0
        while remaining > 1e-9:
            hours = min(capacity, remaining)
            schedule.append(
                {
                    "day": day + 1,
                    "date": (start_date + timedelta(days=day)).strftime("%Y-%m-%d"),
                    "topicTitle": topic["title"],
                    "topicIndex": topic_idx,
                    "hours": round(hours, 2),
                    "bloomLevel": topic.get("bloomLevel", "UNDERSTAND"),
                }
            )
            remaining -= hours
            capacity -= hours
            if capacity <= 1e-9:
                day += 1
                capacity = daily_hours

    return {**state, "schedule": schedule}


def build_planner_graph():
    graph = StateGraph(PlannerState)
    graph.add_node("extract_topics", extract_topics)
    graph.add_node("create_schedule", create_schedule)
    graph.set_entry_point("extract_topics")
    graph.add_edge("extract_topics", "create_schedule")
    graph.add_edge("create_schedule", END)
    return graph.compile()


planner_graph = build_planner_graph()

# ─── FastAPI App ─────────────────────────────────────────────
app = FastAPI(title="Planner Agent", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
async def health():
    return {"status": "healthy", "agent": "planner"}


@app.post("/generate")
async def generate_plan(request: PlanRequest):
    try:
        initial_state: PlannerState = {
            "subject": request.subject,
            "examDate": request.examDate,
            "dailyHours": request.dailyHours,
            "currentLevel": request.currentLevel,
            "topics": request.topics or [],
            "generatedTopics": None,
            "schedule": None,
            "bloomMapping": None,
        }
        result = await planner_graph.ainvoke(initial_state)
        return {
            "success": True,
            "data": {
                "topics": result.get("generatedTopics", []),
                "schedule": result.get("schedule", []),
                "subject": request.subject,
                "estimatedDays": len({entry["day"] for entry in result.get("schedule") or []}),
            },
        }
    except Exception as e:
        return {"success": False, "error": str(e), "data": {"topics": [], "schedule": []}}


@app.post("/reschedule")
async def reschedule_plan(request: dict[str, Any]):
    """Reschedule missed sessions using adaptive logic"""
    missed_sessions = request.get("missedSessions", [])
    remaining_days = request.get("remainingDays", 7)
    return {
        "success": True,
        "data": {
            "rescheduled": [
                {**s, "rescheduledDate": (datetime.now() + timedelta(days=i + 1)).strftime("%Y-%m-%d")}
                for i, s in enumerate(missed_sessions[:remaining_days])
            ]
        },
    }
