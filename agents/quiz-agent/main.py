"""
QUIZ GENERATOR AGENT — Creates tests from notes/PDFs
Features: MCQ, True/False, Fill in blanks, Difficulty calibration
"""
import os
import json
import fitz  # PyMuPDF
import pdfplumber
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

load_dotenv()

app = FastAPI(title="Quiz Generator Agent", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

llm = ChatOpenAI(
    model=os.getenv("OPENAI_MODEL", "gpt-4o"),
    temperature=0.4,
    api_key=os.getenv("OPENAI_API_KEY"),
)

class QuizRequest(BaseModel):
    subject: str
    topic: Optional[str] = None
    difficulty: str = "INTERMEDIATE"
    questionCount: int = 10
    questionTypes: List[str] = ["MCQ"]
    sourceText: Optional[str] = None

# ─── PDF Parsing ─────────────────────────────────────────────
def extract_text_from_pdf(file_path: str) -> str:
    text = ""
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text += page.extract_text() or ""
    except Exception as e:
        print(f"Error parsing PDF: {e}")
    return text

# ─── Quiz Generation ─────────────────────────────────────────
async def generate_quiz_json(request: QuizRequest) -> List[Dict]:
    prompt = f"""You are an educational assessment expert.
Generate a quiz with the following parameters:
Subject: {request.subject}
Topic: {request.topic or 'General'}
Difficulty: {request.difficulty}
Count: {request.questionCount}
Types: {", ".join(request.questionTypes)}

Source Material:
{request.sourceText[:4000] if request.sourceText else "No source material provided. Use general knowledge."}

Return ONLY a JSON array of questions:
[
  {{
    "type": "MCQ",
    "questionText": "...",
    "options": ["A", "B", "C", "D"],
    "correctAnswer": "...",
    "explanation": "...",
    "difficulty": "{request.difficulty}",
    "bloomLevel": "UNDERSTAND"
  }}
]
"""
    response = await llm.ainvoke([
        SystemMessage(content="You are a professional quiz generator. Output ONLY JSON."),
        HumanMessage(content=prompt)
    ])
    
    try:
        content = response.content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        return json.loads(content)
    except Exception as e:
        print(f"JSON Parsing error: {e}")
        return []

@app.get("/health")
async def health():
    return {"status": "healthy", "agent": "quiz-generator"}

@app.post("/generate")
async def generate(request: QuizRequest):
    questions = await generate_quiz_json(request)
    return {
        "success": True,
        "data": {
            "questions": questions,
            "count": len(questions)
        }
    }

@app.post("/generate-from-file")
async def generate_from_file(
    file: UploadFile = File(...),
    subject: str = Form(...),
    difficulty: str = Form("INTERMEDIATE"),
    questionCount: int = Form(10),
    questionTypes: str = Form("MCQ")
):
    # Save temp file
    os.makedirs("uploads", exist_ok=True)
    file_path = f"uploads/{file.filename}"
    with open(file_path, "wb") as f:
        f.write(await file.read())
    
    # Extract text
    text = extract_text_from_pdf(file_path)
    
    # Generate quiz
    request = QuizRequest(
        subject=subject,
        difficulty=difficulty,
        questionCount=questionCount,
        questionTypes=questionTypes.split(","),
        sourceText=text
    )
    
    questions = await generate_quiz_json(request)
    
    # Cleanup
    os.remove(file_path)
    
    return {
        "success": True,
        "data": {
            "questions": questions,
            "count": len(questions)
        }
    }
