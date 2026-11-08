"""
VOICE / ACCESSIBILITY AGENT — Speech-to-text, Text-to-speech, and accessibility adaptation
Features: Voice navigation, Accessibility adaptation, Simplified language mode
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="Accessibility Agent", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Async client: the sync one blocks the event loop inside `async def` endpoints.
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


class TTSRequest(BaseModel):
    text: str
    voice: str = "alloy"  # alloy, echo, fable, onyx, nova, shimmer


class SimplifyRequest(BaseModel):
    text: str
    level: str = "basic"


@app.get("/health")
async def health():
    return {"status": "healthy", "agent": "accessibility"}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """Convert speech to text using OpenAI Whisper"""
    try:
        # Send the bytes straight to Whisper; never write to a path built from file.filename.
        # Only the extension is kept (Whisper uses it to detect the format).
        content = await file.read()
        suffix = Path(file.filename or "audio.webm").suffix or ".webm"
        transcript = await client.audio.transcriptions.create(
            model="whisper-1",
            file=(f"audio{suffix}", content),
        )

        return {"success": True, "text": transcript.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/synthesize")
async def synthesize(request: TTSRequest):
    """Convert text to speech using OpenAI TTS"""
    try:
        await client.audio.speech.create(
            model="tts-1",
            voice=request.voice,
            input=request.text,
        )
        # In a real app, we'd stream this or save to S3
        # For this demo, we'll return a success msg (client handles Web Speech API usually)
        return {
            "success": True,
            "message": "Speech synthesis generated",
            "info": "In production, this returns a signed URL to the MP3 file.",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/simplify")
async def simplify(request: SimplifyRequest):
    """Simplify complex text for dyslexia or learning disabilities"""
    try:
        prompt = f"Simplify the following text for a student with learning disabilities. Use clear, concise language and bullet points if helpful:\n\n{request.text}"

        response = await client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o"), messages=[{"role": "user", "content": prompt}]
        )

        return {"success": True, "simplifiedText": response.choices[0].message.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
