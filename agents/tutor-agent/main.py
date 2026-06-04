"""
TUTOR AGENT — Provides personalized learning support and RAG-based explanations
Features: Contextual help, Step-by-step explanations, RAG pipeline
"""
import os
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_classic.chains import RetrievalQA
from langchain_core.messages import SystemMessage, HumanMessage

load_dotenv()

app = FastAPI(title="Tutor Agent", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

llm = ChatOpenAI(
    model=os.getenv("OPENAI_MODEL", "gpt-4o"),
    temperature=0.7,
    api_key=os.getenv("OPENAI_API_KEY"),
)

embeddings = OpenAIEmbeddings(api_key=os.getenv("OPENAI_API_KEY"))

class ChatRequest(BaseModel):
    userId: str
    message: str
    sessionId: Optional[str] = None
    context: Dict[str, Any] = {}

class ExplainRequest(BaseModel):
    concept: str
    level: str = "beginner"
    subject: Optional[str] = None

# ─── RAG Helpers ─────────────────────────────────────────────
# In a real production app, we'd load index from disk/Pinecone
vector_db = None

@app.get("/health")
async def health():
    return {"status": "healthy", "agent": "tutor"}

@app.post("/chat")
async def chat(request: ChatRequest):
    # Basic tutor persona
    system_prompt = f"""You are a helpful, encouraging AI Tutor. 
Your goal is to help the student understand concepts through explanations and Socratic questioning.
User Context: {request.context}
"""
    
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=request.message)
    ]
    
    response = await llm.ainvoke(messages)
    
    return {
        "success": True,
        "data": {
            "reply": response.content,
            "sessionId": request.sessionId
        }
    }

@app.post("/explain")
async def explain(request: ExplainRequest):
    prompt = f"""Explain the following concept to a {request.level} student.
Concept: {request.concept}
Subject: {request.subject or 'General'}

Provide:
1. Simple definition
2. Step-by-step breakdown
3. A real-world analogy
4. A quick check-for-understanding question
"""
    response = await llm.ainvoke([HumanMessage(content=prompt)])
    
    return {
        "success": True,
        "data": {
            "explanation": response.content
        }
    }

@app.post("/index-document")
async def index_document(userId: str, text: str):
    """Adds text to the user's vector memory for RAG"""
    global vector_db
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    docs = text_splitter.split_text(text)
    
    if vector_db is None:
        vector_db = FAISS.from_texts(docs, embeddings)
    else:
        vector_db.add_texts(docs)
    
    return {"success": True, "message": "Document indexed for RAG"}