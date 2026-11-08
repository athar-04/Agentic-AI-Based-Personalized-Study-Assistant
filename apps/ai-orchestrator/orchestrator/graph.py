"""LangGraph orchestrator graph — routes tasks to the correct agent"""

import os
from typing import Any, TypedDict

import httpx
from langgraph.graph import END, StateGraph


class OrchestratorState(TypedDict):
    userId: str
    task: str
    payload: dict[str, Any]
    context: dict[str, Any]
    sessionId: str
    output: Any | None
    agentUsed: str | None
    tokensUsed: int | None
    contextUpdate: dict[str, Any] | None
    error: str | None


AGENT_URLS = {
    "plan": os.getenv("PLANNER_AGENT_URL", "http://localhost:8001"),
    "tutor": os.getenv("TUTOR_AGENT_URL", "http://localhost:8002"),
    "quiz": os.getenv("QUIZ_AGENT_URL", "http://localhost:8003"),
    "revision": os.getenv("REVISION_AGENT_URL", "http://localhost:8004"),
    "analyze": os.getenv("ANALYZER_AGENT_URL", "http://localhost:8005"),
    "voice": os.getenv("ACCESSIBILITY_AGENT_URL", "http://localhost:8006"),
}

TASK_ENDPOINTS = {
    "plan": "/generate",
    "tutor": "/chat",
    "quiz": "/generate",
    "revision": "/schedule",
    "analyze": "/analyze/performance",
    "voice": "/transcribe",
}


async def route_to_agent(state: OrchestratorState) -> OrchestratorState:
    """Route the task to the appropriate agent"""
    task = state["task"]
    agent_url = AGENT_URLS.get(task)
    endpoint = TASK_ENDPOINTS.get(task, "/")

    if not agent_url:
        return {**state, "error": f"Unknown task: {task}", "output": None, "agentUsed": "none"}

    payload = {
        **state["payload"],
        "userId": state["userId"],
        "context": state["context"],
        "sessionId": state["sessionId"],
    }

    try:
        async with httpx.AsyncClient(timeout=float(os.getenv("AGENT_TIMEOUT_SECONDS", "180"))) as client:
            response = await client.post(f"{agent_url}{endpoint}", json=payload)
            response.raise_for_status()
            data = response.json()
            if isinstance(data, dict) and data.get("success") is False:
                return {
                    **state,
                    "error": data.get("error") or f"{task} agent failed",
                    "output": None,
                    "agentUsed": task,
                }
            return {
                **state,
                "output": data.get("data") or data,
                "agentUsed": task,
                "tokensUsed": data.get("tokensUsed"),
                "contextUpdate": data.get("contextUpdate", {}),
            }
    except httpx.HTTPStatusError as e:
        return {
            **state,
            "error": f"{task} agent returned HTTP {e.response.status_code}",
            "output": None,
            "agentUsed": task,
        }
    except (httpx.HTTPError, ValueError) as e:  # connection/timeout errors, or a non-JSON body
        return {**state, "error": f"{task} agent unavailable: {e}", "output": None, "agentUsed": task}


def should_retry(state: OrchestratorState) -> str:
    if state.get("error"):
        return "end_with_error"
    return "success"


def build_orchestrator_graph():
    graph = StateGraph(OrchestratorState)

    graph.add_node("route_to_agent", route_to_agent)

    graph.set_entry_point("route_to_agent")
    graph.add_edge("route_to_agent", END)

    return graph.compile()
