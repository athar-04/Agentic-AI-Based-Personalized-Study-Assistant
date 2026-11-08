"""
AI Orchestrator — Central LangGraph coordination hub
Coordinates all 6 AI agents: Planner, Tutor, Quiz, Revision, Analyzer, Accessibility
"""

import uuid
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

load_dotenv()

from auth import require_user_id
from config import settings
from orchestrator.graph import build_orchestrator_graph
from orchestrator.memory import MemoryManager
from orchestrator.mongo_logger import MongoLogger


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
    task: str  # "plan", "quiz", "tutor", "revision", "analyze", "voice"
    payload: dict[str, Any] = {}
    sessionId: str | None = None


class OrchestrateResponse(BaseModel):
    success: bool
    data: Any
    sessionId: str
    agentUsed: str
    tokensUsed: int | None = None


# ─── Routes ──────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "healthy", "service": "ai-orchestrator"}


@app.post("/api/orchestrate", response_model=None)
async def orchestrate(
    request: OrchestrateRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(require_user_id),
) -> OrchestrateResponse | JSONResponse:
    return await _run(user_id, request, background_tasks)


async def _run(
    user_id: str, request: OrchestrateRequest, background_tasks: BackgroundTasks
) -> OrchestrateResponse | JSONResponse:
    session_id = request.sessionId or str(uuid.uuid4())
    try:
        graph = app.state.graph
        memory = app.state.memory

        # Load context from memory
        context = await memory.get_context(user_id)

        # Run orchestrator graph
        result = await graph.ainvoke(
            {
                "userId": user_id,
                "task": request.task,
                "payload": request.payload,
                "context": context,
                "sessionId": session_id,
            }
        )

        # Save interaction to MongoDB in background (failures are logged too)
        background_tasks.add_task(
            app.state.mongo.log_interaction,
            userId=user_id,
            sessionId=session_id,
            task=request.task,
            payload=request.payload,
            result=result.get("output"),
            agentUsed=result.get("agentUsed", "unknown"),
        )

        if result.get("error"):
            # Surface agent failures instead of returning success=True with an error payload.
            return JSONResponse(
                status_code=502,
                content={"success": False, "error": result["error"], "agentUsed": result.get("agentUsed", "unknown")},
            )

        # Update memory context
        await memory.update_context(user_id, result.get("contextUpdate") or {})

        return OrchestrateResponse(
            success=True,
            data=result.get("output"),
            sessionId=session_id,
            agentUsed=result.get("agentUsed", "unknown"),
            tokensUsed=result.get("tokensUsed"),
        )
    except HTTPException:
        raise
    except Exception as e:
        # Details go to the server log, not to the client.
        print(f"orchestrate failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="The AI service hit an internal error") from e


@app.post("/api/plan/generate")
async def generate_plan(
    body: dict[str, Any], background_tasks: BackgroundTasks, user_id: str = Depends(require_user_id)
):
    """Called by study-service (forwarding the student's token) to generate AI study plans"""
    body.pop("userId", None)
    return await _run(user_id, OrchestrateRequest(task="plan", payload=body), background_tasks)


@app.post("/api/quiz/generate")
async def generate_quiz(
    body: dict[str, Any], background_tasks: BackgroundTasks, user_id: str = Depends(require_user_id)
):
    body.pop("userId", None)
    return await _run(user_id, OrchestrateRequest(task="quiz", payload=body), background_tasks)


@app.post("/api/tutor/chat")
async def tutor_chat(body: dict[str, Any], background_tasks: BackgroundTasks, user_id: str = Depends(require_user_id)):
    body.pop("userId", None)
    return await _run(
        user_id,
        OrchestrateRequest(task="tutor", payload=body, sessionId=body.get("sessionId")),
        background_tasks,
    )
