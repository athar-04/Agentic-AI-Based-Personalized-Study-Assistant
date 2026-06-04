"""
AI Orchestrator — Central LangGraph coordination hub
Coordinates all 6 AI agents: Planner, Tutor, Quiz, Revision, Analyzer, Accessibility
"""
import os
import uuid
from typing import Any, Dict, Optional
from contextlib import asynccontextmanager
from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

from orchestrator.graph import build_orchestrator_graph
from orchestrator.memory import MemoryManager
from orchestrator.mongo_logger import MongoLogger
from config import settings

# ─── Lifespan ───────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.memory = MemoryManager()
    app.state.mongo = MongoLogger()
    await app.state.mongo.connect()
    app.state.graph = build_orchestrator_graph()
    print("✅ AI Orchestrator ready")
    yield
    await app.state.mongo.disconnect()
    print("AI Orchestrator shut down")

app = FastAPI(
    title="Agentic AI Study Assistant — Orchestrator",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Request / Response Models ───────────────────────────────
class OrchestrateRequest(BaseModel):
    userId: str
    task: str  # "plan", "quiz", "tutor", "revision", "analyze", "voice"
    payload: Dict[str, Any] = {}
    sessionId: Optional[str] = None

class OrchestrateResponse(BaseModel):
    success: bool
    data: Any
    sessionId: str
    agentUsed: str
    tokensUsed: Optional[int] = None

# ─── Routes ──────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "healthy", "service": "ai-orchestrator"}

@app.post("/api/orchestrate", response_model=OrchestrateResponse)
async def orchestrate(request: OrchestrateRequest, background_tasks: BackgroundTasks):
    session_id = request.sessionId or str(uuid.uuid4())
    try:
        graph = app.state.graph
        memory = app.state.memory

        # Load context from memory
        context = await memory.get_context(request.userId)

        # Run orchestrator graph
        result = await graph.ainvoke({
            "userId": request.userId,
            "task": request.task,
            "payload": request.payload,
            "context": context,
            "sessionId": session_id,
        })

        # Save interaction to MongoDB in background
        background_tasks.add_task(
            app.state.mongo.log_interaction,
            userId=request.userId,
            sessionId=session_id,
            task=request.task,
            payload=request.payload,
            result=result.get("output"),
            agentUsed=result.get("agentUsed", "unknown"),
        )

        # Update memory context
        await memory.update_context(request.userId, result.get("contextUpdate", {}))

        return OrchestrateResponse(
            success=True,
            data=result.get("output"),
            sessionId=session_id,
            agentUsed=result.get("agentUsed", "unknown"),
            tokensUsed=result.get("tokensUsed"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/plan/generate")
async def generate_plan(body: Dict[str, Any]):
    """Called by study-service to generate AI study plans"""
    return await orchestrate(OrchestrateRequest(
        userId=body.get("userId", ""),
        task="plan",
        payload=body,
    ), BackgroundTasks())

@app.post("/api/quiz/generate")
async def generate_quiz(body: Dict[str, Any]):
    return await orchestrate(OrchestrateRequest(
        userId=body.get("userId", "system"),
        task="quiz",
        payload=body,
    ), BackgroundTasks())

@app.post("/api/tutor/chat")
async def tutor_chat(body: Dict[str, Any]):
    return await orchestrate(OrchestrateRequest(
        userId=body.get("userId", ""),
        task="tutor",
        payload=body,
        sessionId=body.get("sessionId"),
    ), BackgroundTasks())
