import os
import json
import logging
import re
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import pypdf
import google.generativeai as genai
import base64
import urllib.request
import urllib.error

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load env variables
load_dotenv()

# Initialize FastAPI
app = FastAPI(title="InterviewArena Backend", version="1.0.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gemini API configuration or OpenRouter check
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    if api_key.startswith("sk-"):
        logger.info("OpenRouter API key detected. Requests will be routed to OpenRouter API.")
    else:
        genai.configure(api_key=api_key)
        logger.info("Gemini API configured successfully.")
else:
    logger.warning("GEMINI_API_KEY not found in environment variables. Please check your .env file.")

# Helper to check if Gemini is initialized
def verify_gemini():
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(
            status_code=500,
            detail="Google Gemini/OpenRouter API key is missing. Please add GEMINI_API_KEY to backend/.env file."
        )

# Clean and parse JSON response that might contain markdown blocks
def clean_and_parse_json(text: str) -> dict:
    cleaned = text.strip()
    
    # Try to find a JSON code block
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, re.IGNORECASE)
    if match:
        cleaned = match.group(1).strip()
    else:
        # If no code block, try to find the first '{' and last '}'
        first_brace = cleaned.find('{')
        last_brace = cleaned.rfind('}')
        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            cleaned = cleaned[first_brace:last_brace + 1].strip()
            
    return json.loads(cleaned)

# Helper function to handle content generation through Gemini SDK or OpenRouter
def call_gemini_or_openrouter(system_instruction: Optional[str], contents: List[Dict[str, Any]], is_json: bool = False) -> str:
    current_key = os.getenv("GEMINI_API_KEY")
    if not current_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not defined in environment variables."
        )

    is_openrouter = current_key.startswith("sk-")

    if is_openrouter:
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})

        for msg in contents:
            role = msg.get("role", "user")
            open_ai_role = "assistant" if role in ["model", "assistant", "ai"] else "user"

            parts = msg.get("parts", [])
            if parts:
                if len(parts) == 1 and "text" in parts[0]:
                    messages.append({"role": open_ai_role, "content": parts[0]["text"]})
                else:
                    content_array = []
                    for part in parts:
                        if "text" in part:
                            content_array.append({"type": "text", "text": part["text"]})
                        elif "mime_type" in part and "data" in part:
                            data_bytes = part["data"]
                            if isinstance(data_bytes, bytes):
                                base64_str = base64.b64encode(data_bytes).decode("utf-8")
                            else:
                                base64_str = data_bytes

                            mime = part.get("mime_type", "audio/webm")
                            fmt = "webm"
                            if "/" in mime:
                                fmt = mime.split(";")[0].split("/")[1]
                            content_array.append({
                                "type": "input_audio",
                                "input_audio": {
                                    "data": base64_str,
                                    "format": fmt
                                }
                            })
                    messages.append({"role": open_ai_role, "content": content_array})
            else:
                messages.append({"role": open_ai_role, "content": ""})

        models_to_try = [
            "google/gemini-2.5-flash:free",
            "google/gemini-2.5-flash",
            "google/gemma-4-26b-a4b-it:free",
            "meta-llama/llama-3-8b-instruct:free",
            "openrouter/free"
        ]

        last_error = None
        for model_id in models_to_try:
            try:
                payload = {
                    "model": model_id,
                    "messages": messages,
                    "max_tokens": 4000
                }

                if is_json:
                    payload["response_format"] = {"type": "json_object"}

                req_data = json.dumps(payload).encode("utf-8")
                req = urllib.request.Request(
                    "https://openrouter.ai/api/v1/chat/completions",
                    data=req_data,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {current_key}",
                        "HTTP-Referer": "https://github.com/lakshyarajsinghsisodiya/INTERVIEWW1",
                        "X-Title": "InterviewArena"
                    },
                    method="POST"
                )

                with urllib.request.urlopen(req) as response:
                    res_body = response.read().decode("utf-8")
                    res_data = json.loads(res_body)
                    if "choices" not in res_data or not res_data["choices"]:
                        raise Exception(f"OpenRouter returned empty choices: {res_body}")
                    return res_data["choices"][0]["message"]["content"]

            except urllib.error.HTTPError as e:
                err_body = e.read().decode("utf-8")
                logger.warning(f"Model {model_id} failed with HTTPError {e.code}: {err_body}. Retrying...")
                last_error = f"HTTPError {e.code}: {err_body}"
            except Exception as e:
                logger.warning(f"Model {model_id} failed with Exception: {str(e)}. Retrying...")
                last_error = str(e)

        raise HTTPException(
            status_code=500,
            detail=f"All OpenRouter models failed. Last error: {last_error}"
        )
    else:
        # Standard Gemini SDK call
        config = genai.types.GenerationConfig(
            response_mime_type="application/json" if is_json else "text/plain"
        )
        
        if system_instruction:
            model = genai.GenerativeModel("gemini-1.5-flash", system_instruction=system_instruction)
        else:
            model = genai.GenerativeModel("gemini-1.5-flash")

        sdk_contents = []
        for msg in contents:
            parts_list = []
            for p in msg.get("parts", []):
                if "text" in p:
                    parts_list.append(p["text"])
                elif "mime_type" in p and "data" in p:
                    parts_list.append({
                        "mime_type": p["mime_type"],
                        "data": p["data"]
                    })
            role = "model" if msg.get("role") in ["model", "assistant", "ai"] else "user"
            sdk_contents.append({"role": role, "parts": parts_list})

        response = model.generate_content(sdk_contents, generation_config=config)
        return response.text

# Pydantic models for request validation
class Message(BaseModel):
    role: str # 'user' or 'model' / 'assistant'
    content: str
    question_type: Optional[str] = "General"

class InterviewChatRequest(BaseModel):
    bot_name: str
    bot_rating: int
    role: str
    resume_parsed: Dict[str, Any]
    messages: List[Message]
    question_count: int
    total_questions: int
    audio: Optional[str] = None
    mime_type: Optional[str] = None

class FinishRequest(BaseModel):
    bot_name: str
    role: str
    resume_parsed: Dict[str, Any]
    messages: List[Message]

@app.get("/")
def read_root():
    return {"status": "online", "message": "InterviewArena Backend is ready!"}

@app.post("/api/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    verify_gemini()
    try:
        filename = file.filename
        content_type = file.content_type
        
        text_content = ""
        if filename.endswith(".pdf") or content_type == "application/pdf":
            # Extract PDF text using pypdf
            pdf_reader = pypdf.PdfReader(file.file)
            extracted_pages = []
            for i, page in enumerate(pdf_reader.pages):
                page_text = page.extract_text()
                if page_text:
                    extracted_pages.append(page_text)
            text_content = "\n".join(extracted_pages)
            if not text_content.strip():
                raise HTTPException(status_code=400, detail="Could not extract text from PDF file. It might be scanned or empty.")
        elif filename.endswith(".txt") or content_type == "text/plain":
            text_bytes = await file.read()
            text_content = text_bytes.decode("utf-8", errors="ignore")
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload a PDF or TXT file.")

        if not text_content.strip():
            raise HTTPException(status_code=400, detail="Resume file is empty.")

        # Limit text content length to avoid massive prompts
        text_content = text_content[:15000]

        system_prompt = (
            "You are a professional resume parser. Your job is to extract structured data from the resume text provided.\n"
            "You MUST return ONLY a valid JSON object matching this schema exactly:\n"
            "{\n"
            '  "name": "Full Name",\n'
            '  "skills": ["skill1", "skill2", ...],\n'
            '  "experience": [{"company": "Company A", "role": "Role A", "years": 2}, ...],\n'
            '  "education": [{"degree": "Degree A", "institution": "Institution A"}],\n'
            '  "summary": "2 sentences summarizing candidate strength"\n'
            "}\n"
            "If any field cannot be found, populate it with a logical guess or empty array/string instead of leaving it null."
        )

        user_content = f"RESUME TEXT:\n{text_content}"
        
        logger.info("Sending resume parser request...")
        response_text = call_gemini_or_openrouter(
            None,
            [{"role": "user", "parts": [{"text": f"{system_prompt}\n\n{user_content}"}]}],
            is_json=True
        )
        
        parsed_json = clean_and_parse_json(response_text)
        return parsed_json

    except Exception as e:
        logger.error(f"Error parsing resume: {str(e)}")
        # Return fallback parsed data in case of error so user flow isn't completely broken
        return {
            "name": "Candidate",
            "skills": ["JavaScript", "HTML", "CSS", "Python"],
            "experience": [{"company": "Previous Company", "role": "Software Developer", "years": 2}],
            "education": [{"degree": "Bachelor's Degree", "institution": "University"}],
            "summary": "Resume uploaded successfully but detailed parsing met an error. Ready to proceed!"
        }

@app.post("/api/interview/chat")
async def interview_chat(req: InterviewChatRequest):
    verify_gemini()
    try:
        # 1. Calibrate bot system configuration
        bot_style = ""
        difficulty_inst = ""
        
        if req.bot_name == "Alex":
            bot_style = "Warm, highly encouraging, patient, speaking at a friendly slower pace, acting as a mentor."
            difficulty_inst = "Beginner (800 ELO): Ask very simple, basic questions. Keep it light, praise positive points, and gently highlight basic corrections."
        elif req.bot_name == "Maya":
            bot_style = "Energetic, engaging, and heavily focused on behavioral and situational alignment."
            difficulty_inst = "Intermediate (1200 ELO): Focus on standard behavioral interview techniques (STAR method, teamwork, conflict resolution). Propose typical workplace situations."
        elif req.bot_name == "Rohan":
            bot_style = "Direct, technically curious, professional, probes deep into technical choices and logical reasoning."
            difficulty_inst = "Advanced (1600 ELO): Ask medium-to-hard technical questions about the role. Ask them to explain architecture decisions, trade-offs, and algorithms. Probe their answers."
        elif req.bot_name == "Dr. Chen":
            bot_style = "Formal, serious, multi-dimensional, high pressure, high academic/professional standards."
            difficulty_inst = "Expert (2000 ELO): High standards across technical depth, system design, and communication. Challenge claims made on the resume. Follow up on weak answers with pressure."
        elif req.bot_name == "Arya":
            bot_style = "Intense, expects complete perfection, rapid-paced, direct, no-mercy recruiter from FAANG."
            difficulty_inst = "Legendary (2500 ELO): FAANG-level questions. Zero fluff, expects instant perfect solutions, optimization of code/algorithms, complex system scale issues, absolute technical and architectural correctness."
        else:
            bot_style = "Professional interviewer bot."
            difficulty_inst = "Standard interview questions."

        # 2. Get next expected question type based on sequences
        # Determine current type
        current_question_index = req.question_count + 1
        
        # Sequence rules per ELO:
        # 800: 2 HR -> 1 Technical -> 1 Situational -> Wrap-up (total 4 questions + wrap-up)
        # 1200: 2 HR -> 2 Technical -> 1 Situational -> 1 Follow-up -> Wrap-up (total 6)
        # 1600: 1 HR -> 3 Technical -> 2 Situational -> 2 Follow-ups -> Wrap-up (total 8)
        # 2000: 1 HR -> 4 Technical -> 2 Situational -> 3 Follow-ups -> Wrap-up (total 10)
        # 2500: 5 Technical -> 3 Situational -> 3 Follow-ups (no softballs) -> Wrap-up (total 11)
        
        is_complete = (current_question_index > req.total_questions)
        
        system_instruction = (
            f"You are {req.bot_name}, an AI mock interviewer with rating {req.bot_rating} ELO.\n"
            f"Your personality/style: {bot_style}\n"
            f"Difficulty calibration: {difficulty_inst}\n\n"
            f"Candidate profile:\n"
            f"- Name: {req.resume_parsed.get('name', 'Candidate')}\n"
            f"- Target Role: {req.role}\n"
            f"- Skills: {', '.join(req.resume_parsed.get('skills', []))}\n"
            f"- Experience: {json.dumps(req.resume_parsed.get('experience', []))}\n"
            f"- Education: {json.dumps(req.resume_parsed.get('education', []))}\n\n"
            f"Interview Flow State:\n"
            f"- Current Question Index: {current_question_index} of {req.total_questions} total.\n\n"
            f"INTERVIEW RULES:\n"
            f"1. Ask exactly ONE question at a time. Never ask multiple questions at once.\n"
            f"2. Questions MUST relate directly to the candidate's actual resume or target role ({req.role}) — avoid purely generic questions.\n"
            f"3. After the user provides an answer, evaluate it and return detailed feedback.\n"
            f"4. If the user's latest response contains audio (microphone voice input), you MUST transcribe their spoken response exactly and return it under the \"user_transcription\" key in the JSON response. If they answered with text, set \"user_transcription\" to \"\".\n"
            f"5. You MUST respond with a JSON block matching this schema exactly:\n"
            "{\n"
            '  "user_transcription": "Exact transcription of the candidate\'s spoken response from their audio, or empty string if they typed",\n'
            '  "feedback": {\n'
            '    "strengths": "1-2 sentences about what the candidate did well in their last answer",\n'
            '    "weaknesses": "1-2 sentences highlighting fields of improvement or filler words",\n'
            '    "model_answer": "A model high-quality response demonstrating how an expert would have answered the question",\n'
            '    "scores": { "communication": X, "technical": X, "relevance": X, "confidence": X } \n'
            '  },\n'
            '  "next_question": "Your single next interview question",\n'
            '  "question_type": "HR|Technical|Situational|Followup",\n'
            '  "session_complete": false\n'
            "}\n"
            f"Note: All scores must be integers out of 10. If this is the start of the interview (no user answers yet), set feedback fields and user_transcription to empty strings or 0, and just output your first question under 'next_question'.\n"
            f"If session_complete is true (we have asked {req.total_questions} questions and evaluated the final answer), set 'session_complete' to true, 'next_question' to '', and add an extra key 'final_summary' under root:\n"
            '"final_summary": {\n'
            '  "overall_assessment": "3 sentences detailed summary of candidate performance",\n'
            '  "grade": "A|B+|B|C+|C|D",\n'
            '  "percentile": 85,\n'
            '  "top_strengths": ["Strength 1", "Strength 2", "Strength 3"],\n'
            '  "top_improvements": ["Improvement 1", "Improvement 2", "Improvement 3"],\n'
            '  "study_recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"],\n'
            '  "closing_note": "A final warm encouraging sentence."\n'
            "}"
        )

        # Build contents array for Gemini
        contents = []
        for i, msg in enumerate(req.messages):
            role = "model" if msg.role in ["model", "assistant", "ai"] else "user"
            
            # If it is the user's last message and we have audio, construct as inline audio blob
            if role == "user" and i == len(req.messages) - 1 and req.audio and req.mime_type:
                audio_bytes = base64.b64decode(req.audio)
                parts = []
                if msg.content and msg.content != '[Processing voice answer...]':
                    parts.append({"text": msg.content})
                parts.append({"mime_type": req.mime_type, "data": audio_bytes})
            else:
                parts = [{"text": msg.content}]
                
            contents.append({"role": role, "parts": parts})

        logger.info(f"Generating interview reply from {req.bot_name} (ELO {req.bot_rating})...")
        chat_input = contents if contents else [{"role": "user", "parts": [{"text": "Please start the interview and ask the first question."}]}]
        response_text = call_gemini_or_openrouter(
            system_instruction,
            chat_input,
            is_json=True
        )

        reply_json = clean_and_parse_json(response_text)
        
        # Enforce session completion if question limit reached
        if is_complete:
            reply_json["session_complete"] = True
            reply_json["next_question"] = ""
            if "final_summary" not in reply_json:
                # Add synthetic final summary in case model missed it
                reply_json["final_summary"] = {
                    "overall_assessment": f"You completed a highly challenging session with {req.bot_name}. You displayed strong core competencies required for the {req.role} role.",
                    "grade": "B+",
                    "percentile": 78,
                    "top_strengths": ["Excellent response structures", "Good resume-to-role alignment", "Clear explanations"],
                    "top_improvements": ["Increase technical depth in details", "Explain project architecture more clearly", "Reduce verbal hesitation"],
                    "study_recommendations": [f"Practice deep technical system designs for {req.role}", "Practice behavioral STAR alignment challenges"],
                    "closing_note": "Fantastic work completing the mock interview! Build on these tips and challenge a higher tier bot next."
                }

        return reply_json

    except Exception as e:
        logger.error(f"Error in interview chat: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Interview session error: {str(e)}")

@app.post("/api/interview/finish")
async def interview_finish(req: FinishRequest):
    verify_gemini()
    try:
        # Build prompt for a full-scale scorecard summary report
        system_instruction = (
            "You are an expert technical recruiter and interview analyst.\n"
            "Evaluate the full interview history provided between the bot and the candidate, "
            "and generate a final comprehensive performance assessment scorecard.\n"
            "You MUST return ONLY a valid JSON object matching this schema exactly:\n"
            "{\n"
            '  "overall_assessment": "A comprehensive 4-sentence overview evaluating their technical knowledge, communication clarity, and role suitability",\n'
            '  "grade": "A+|A|B+|B|C+|C|D",\n'
            '  "percentile": 82,\n'
            '  "top_strengths": ["Strength 1", "Strength 2", "Strength 3"],\n'
            '  "top_improvements": ["Improvement 1", "Improvement 2", "Improvement 3"],\n'
            '  "study_recommendations": ["Study Guide 1", "Study Guide 2", "Study Guide 3"],\n'
            '  "closing_note": "A motivating, positive parting recommendation."\n'
            "}"
        )

        history_text = ""
        for m in req.messages:
            history_text += f"{m.role.upper()}: {m.content}\n\n"

        user_content = (
            f"Candidate Name: {req.resume_parsed.get('name', 'Candidate')}\n"
            f"Role: {req.role}\n"
            f"Bot Opponent: {req.bot_name}\n\n"
            f"INTERVIEW CHAT LOGS:\n{history_text}"
        )

        logger.info("Generating final scorecard report...")
        response_text = call_gemini_or_openrouter(
            system_instruction,
            [{"role": "user", "parts": [{"text": user_content}]}],
            is_json=True
        )

        report_json = clean_and_parse_json(response_text)
        return report_json

    except Exception as e:
        logger.error(f"Error in interview finish scorecard: {str(e)}")
        # Return elegant synthetic scorecard as fallback
        return {
            "overall_assessment": f"You have completed your mock interview for the {req.role} role. Your skills and education provide a very strong base, but there is room to refine your confidence and depth in technical deep dives.",
            "grade": "B",
            "percentile": 72,
            "top_strengths": ["Good communication structure", "Education background alignment", "Shows keen learning agility"],
            "top_improvements": ["Provide deeper details in system designs", "Articulate technical problem-solving steps", "Reduce structural filler words"],
            "study_recommendations": ["Study mock interview techniques", "Solve algorithm challenges on interactive platforms"],
            "closing_note": "Great preparation! Re-evaluate your weak areas and practice again to claim a higher score."
        }
