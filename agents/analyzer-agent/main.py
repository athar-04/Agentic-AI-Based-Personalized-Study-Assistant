"""
ANALYZER AGENT — Performance analysis and insights generation
Features: Weak topic detection, Engagement analytics, Predictive readiness scoring
"""
import os
import json
from typing import Any, Dict, List, Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

load_dotenv()

app = FastAPI(title="Analyzer Agent", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

llm = ChatOpenAI(
    model=os.getenv("OPENAI_MODEL", "gpt-4o"),
    temperature=0.2,
    api_key=os.getenv("OPENAI_API_KEY"),
)

class AnalysisRequest(BaseModel):
    userId: str
    quizAttempts: List[Dict[str, Any]]
    studySessions: List[Dict[str, Any]]

@app.get("/health")
async def health():
    return {"status": "healthy", "agent": "analyzer"}

@app.post("/analyze/performance")
async def analyze_performance(request: AnalysisRequest):
    # Prepare data for LLM analysis
    data_summary = {
        "attemptCount": len(request.quizAttempts),
        "avgScore": sum(a.get("score", 0) for a in request.quizAttempts) / len(request.quizAttempts) if request.quizAttempts else 0,
        "studyHours": sum(s.get("durationMinutes", 0) for s in request.studySessions) / 60,
        "recentAttempts": request.quizAttempts[:5],
    }
    
    prompt = f"""You are a senior education data scientist.
Analyze the following student performance data and provide actionable insights.

Data Summary:
{json.dumps(data_summary, indent=2)}

Provide:
1. Identified weak topics (based on quiz scores < 70%)
2. Recommended focus areas for the next 7 days
3. A predictive "Exam Readiness Score" (0-100)
4. Personalized study tips

Return ONLY JSON:
{{
  "weakTopics": ["...", "..."],
  "recommendations": ["...", "..."],
  "readinessScore": 85,
  "insights": "..."
}}
"""
    response = await llm.ainvoke([
        SystemMessage(content="You are an expert academic analyzer. Output ONLY JSON."),
        HumanMessage(content=prompt)
    ])
    
    try:
        content = response.content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        return {
            "success": True,
            "data": json.loads(content)
        }
    except Exception as e:
        print(f"Analysis Parsing error: {e}")
        return {"success": False, "error": "Failed to parse analysis"}

@app.post("/analyze/weak-topics")
async def weak_topics(body: Dict[str, Any]):
    """Specific endpoint for weak topic detection"""
    # In a real app, this would fetch data from DB. 
    # Here we simulate with dummy analysis for the API structure.
    return {
        "success": True,
        "weakTopics": [
            {"topic": "Quantum Mechanics", "score": 45, "recommendation": "Review Wave-Particle Duality"},
            {"topic": "Organic Chemistry", "score": 58, "recommendation": "Practice Reaction Mechanisms"}
        ]
    }
