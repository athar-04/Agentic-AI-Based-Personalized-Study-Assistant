"""
PLANNER AGENT — Generates adaptive study plans using Bloom's Taxonomy
Uses LangGraph for stateful multi-step planning
"""
import os
import json
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END
from typing import TypedDict

load_dotenv()

# ─── LLM ────────────────────────────────────────────────────
llm = ChatOpenAI(
    model=os.getenv("OPENAI_MODEL", "gpt-4o"),
    temperature=0.3,
    api_key=os.getenv("OPENAI_API_KEY"),
)

# ─── Models ─────────────────────────────────────────────────
class PlanRequest(BaseModel):
    userId: str
    subject: str
    examDate: Optional[str] = None
    dailyHours: float = 2.0
    currentLevel: str = "beginner"
    topics: Optional[List[str]] = None
    context: Dict[str, Any] = {}
    sessionId: Optional[str] = None

class PlannerState(TypedDict):
    subject: str
    examDate: Optional[str]
    dailyHours: float
    currentLevel: str
    topics: List[str]
    generatedTopics: Optional[List[Dict]]
    schedule: Optional[List[Dict]]
    bloomMapping: Optional[Dict]

# ─── Agent Nodes ─────────────────────────────────────────────
async def extract_topics(state: PlannerState) -> PlannerState:
    """Step 1: Extract and structure topics for the subject"""
    prompt = f"""You are an expert curriculum designer.
Subject: {state['subject']}
Current level: {state['currentLevel']}
Exam date: {state.get('examDate', 'not specified')}

Generate a structured list of 8-15 topics for this subject.
Apply Bloom's Taxonomy levels (REMEMBER, UNDERSTAND, APPLY, ANALYZE, EVALUATE, CREATE).
For each topic provide estimated study hours (0.5-4h).

Return ONLY valid JSON array:
[{{"title": "Topic Name", "bloomLevel": "UNDERSTAND", "estimatedHours": 2.0, "description": "Brief description", "priority": 1}}]
"""
    response = await llm.ainvoke([SystemMessage(content="You are a curriculum planning expert. Always return valid JSON."),
                                   HumanMessage(content=prompt)])
    try:
        content = response.content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        topics = json.loads(content)
        return {**state, "generatedTopics": topics}
    except Exception:
        # Fallback default topics
        return {**state, "generatedTopics": [
            {"title": f"Introduction to {state['subject']}", "bloomLevel": "REMEMBER", "estimatedHours": 1.5, "description": "Core concepts", "priority": 1},
            {"title": f"Core Principles of {state['subject']}", "bloomLevel": "UNDERSTAND", "estimatedHours": 2.0, "description": "Fundamental principles", "priority": 2},
            {"title": f"Practical Application", "bloomLevel": "APPLY", "estimatedHours": 2.5, "description": "Hands-on practice", "priority": 3},
            {"title": f"Advanced Topics", "bloomLevel": "ANALYZE", "estimatedHours": 3.0, "description": "Deep analysis", "priority": 4},
            {"title": f"Exam Preparation", "bloomLevel": "EVALUATE", "estimatedHours": 2.0, "description": "Review and synthesis", "priority": 5},
        ]}


async def create_schedule(state: PlannerState) -> PlannerState:
    """Step 2: Create a day-by-day schedule based on topics"""
    topics = state.get("generatedTopics", [])
    total_hours = sum(t.get("estimatedHours", 1) for t in topics)
    daily_hours = state["dailyHours"]
    total_days = max(7, int(total_hours / daily_hours) + 1)

    exam_date = state.get("examDate")
    start_date = datetime.now()

    schedule = []
    topic_idx = 0
    remaining_hours = topics[0].get("estimatedHours", 1) if topics else 0
    current_topic = topics[0] if topics else None

    for day in range(total_days):
        if topic_idx >= len(topics):
            break
        session_date = start_date + timedelta(days=day)
        schedule.append({
            "day": day + 1,
            "date": session_date.strftime("%Y-%m-%d"),
            "topicTitle": current_topic["title"],
            "topicIndex": topic_idx,
            "hours": min(daily_hours, remaining_hours),
            "bloomLevel": current_topic.get("bloomLevel", "UNDERSTAND"),
        })
        remaining_hours -= daily_hours
        if remaining_hours <= 0 and topic_idx + 1 < len(topics):
            topic_idx += 1
            current_topic = topics[topic_idx]
            remaining_hours = current_topic.get("estimatedHours", 1)

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
                "estimatedDays": len(result.get("schedule", [])),
            },
        }
    except Exception as e:
        return {"success": False, "error": str(e), "data": {"topics": [], "schedule": []}}

@app.post("/reschedule")
async def reschedule_plan(request: Dict[str, Any]):
    """Reschedule missed sessions using adaptive logic"""
    missed_sessions = request.get("missedSessions", [])
    remaining_days = request.get("remainingDays", 7)
    return {
        "success": True,
        "data": {
            "rescheduled": [
                {**s, "rescheduledDate": (datetime.now() + timedelta(days=i+1)).strftime("%Y-%m-%d")}
                for i, s in enumerate(missed_sessions[:remaining_days])
            ]
        }
    }
