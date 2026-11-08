"""
QUIZ GENERATOR AGENT — Creates tests from notes/PDFs
Features: MCQ, True/False, Fill in blanks, Difficulty calibration
"""

import asyncio
import json
import os
import tempfile

import pdfplumber
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="Quiz Generator Agent", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

llm = ChatOpenAI(
    model=os.getenv("OPENAI_MODEL", "gpt-4o"),
    temperature=0.4,
    api_key=os.getenv("OPENAI_API_KEY"),
    base_url=os.getenv("OPENAI_BASE_URL") or None,  # e.g. Ollama: http://host.docker.internal:11434/v1
)


class QuizRequest(BaseModel):
    subject: str
    topic: str | None = None
    difficulty: str = "INTERMEDIATE"
    questionCount: int = 10
    questionTypes: list[str] = ["MCQ"]
    sourceText: str | None = None


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
async def generate_quiz_json(request: QuizRequest) -> list[dict]:
    prompt = f"""You are an educational assessment expert.
Generate a quiz with the following parameters:
Subject: {request.subject}
Topic: {request.topic or "General"}
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
    response = await llm.ainvoke(
        [
            SystemMessage(content="You are a professional quiz generator. Output ONLY JSON."),
            HumanMessage(content=prompt),
        ]
    )

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
    return {"success": True, "data": {"questions": questions, "count": len(questions)}}


@app.post("/generate-from-file")
async def generate_from_file(
    file: UploadFile = File(...),
    subject: str = Form(...),
    difficulty: str = Form("INTERMEDIATE"),
    questionCount: int = Form(10),
    questionTypes: str = Form("MCQ"),
):
    # Never build a path from the client-supplied filename (path traversal); use a private temp file.
    content = await file.read()
    fd, file_path = tempfile.mkstemp(suffix=".pdf")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(content)
        # pdfplumber is synchronous; keep it off the event loop
        text = await asyncio.to_thread(extract_text_from_pdf, file_path)
    finally:
        os.remove(file_path)

    # Generate quiz
    request = QuizRequest(
        subject=subject,
        difficulty=difficulty,
        questionCount=questionCount,
        questionTypes=questionTypes.split(","),
        sourceText=text,
    )

    questions = await generate_quiz_json(request)

    return {"success": True, "data": {"questions": questions, "count": len(questions)}}
