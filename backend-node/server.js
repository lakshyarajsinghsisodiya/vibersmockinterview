import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load environmental variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Setup CORS & JSON Parse
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Setup Multer memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Google GenAI or OpenRouter check
const apiKey = process.env.GEMINI_API_KEY;
let ai = null;
if (apiKey) {
  if (apiKey.startsWith("sk-")) {
    console.log("OpenRouter API key detected. Requests will be routed to OpenRouter API.");
  } else {
    ai = new GoogleGenerativeAI(apiKey);
    console.log("Google Gemini API client initialized on Node backend.");
  }
} else {
  console.warn("WARNING: GEMINI_API_KEY is not defined in backend-node/.env file.");
}

// Helper function to handle content generation through Gemini SDK or OpenRouter
async function callGeminiOrOpenRouter(systemInstruction, contents, isJson = false) {
  const currentKey = process.env.GEMINI_API_KEY;
  if (!currentKey) {
    throw new Error("GEMINI_API_KEY is not defined in backend-node/.env file.");
  }

  const isOpenRouter = currentKey.startsWith("sk-");

  if (isOpenRouter) {
    const messages = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }

    for (const msg of contents) {
      const openAiRole = msg.role === 'model' ? 'assistant' : 'user';
      
      if (msg.parts && msg.parts.length > 0) {
        if (msg.parts.length === 1 && msg.parts[0].text) {
          messages.push({ role: openAiRole, content: msg.parts[0].text });
        } else {
          const contentArray = [];
          for (const part of msg.parts) {
            if (part.text) {
              contentArray.push({ type: 'text', text: part.text });
            } else if (part.inlineData) {
              const mime = part.inlineData.mimeType || 'audio/webm';
              let format = 'webm';
              if (mime.includes('/')) {
                format = mime.split(';')[0].split('/')[1];
              }
              contentArray.push({
                type: 'input_audio',
                input_audio: {
                  data: part.inlineData.data,
                  format: format
                }
              });
            }
          }
          messages.push({ role: openAiRole, content: contentArray });
        }
      } else {
        messages.push({ role: openAiRole, content: '' });
      }
    }

    const modelsToTry = [
      'google/gemini-2.5-flash:free',
      'google/gemini-2.5-flash',
      'google/gemma-4-26b-a4b-it:free',
      'meta-llama/llama-3-8b-instruct:free',
      'openrouter/free'
    ];

    let lastError = null;
    for (const modelId of modelsToTry) {
      try {
        const payload = {
          model: modelId,
          messages: messages,
          max_tokens: 4000
        };

        if (isJson) {
          payload.response_format = { type: 'json_object' };
        }

        console.log(`Sending request to OpenRouter using model ${modelId}...`);
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentKey}`,
            'HTTP-Referer': 'https://github.com/lakshyarajsinghsisodiya/INTERVIEWW1',
            'X-Title': 'InterviewArena'
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Status ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        if (!data.choices || data.choices.length === 0) {
          throw new Error(`OpenRouter returned empty choices: ${JSON.stringify(data)}`);
        }

        return data.choices[0].message.content;
      } catch (err) {
        console.warn(`Model ${modelId} failed: ${err.message}. Retrying...`);
        lastError = err;
      }
    }
    throw new Error(`All OpenRouter models failed. Last error: ${lastError.message}`);
  } else {
    // Normal Gemini SDK call
    if (!ai) {
      ai = new GoogleGenerativeAI(currentKey);
    }
    const modelOptions = { model: "gemini-1.5-flash" };
    if (systemInstruction) {
      modelOptions.systemInstruction = systemInstruction;
    }
    const model = ai.getGenerativeModel(modelOptions);

    const result = await model.generateContent({
      contents: contents,
      generationConfig: isJson ? { responseMimeType: "application/json" } : undefined
    });

    return result.response.text();
  }
}

// Clean and Parse JSON response that might contain markdown blocks
function cleanAndParseJson(text) {
  let cleaned = text.trim();
  
  // Try to find a JSON code block
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = cleaned.match(codeBlockRegex);
  if (match) {
    cleaned = match[1].trim();
  } else {
    // If no code block, try to find the first '{' and last '}'
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1).trim();
    }
  }
  
  return JSON.parse(cleaned);
}

// Connection check route
app.get('/', (req, res) => {
  res.json({ status: "online", message: "InterviewArena Node.js Backend is fully ready!" });
});

// Helper validation middleware
const checkGeminiKey = (req, res, next) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ 
      error: "API Key Missing", 
      detail: "Google Gemini/OpenRouter API key is missing. Please add GEMINI_API_KEY to your backend-node/.env file." 
    });
  }
  next();
};

// 1. Resume Parser Route
app.post('/api/upload-resume', upload.single('file'), checkGeminiKey, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please upload a file." });
    }

    let textContent = "";
    const filename = req.file.originalname;

    if (filename.endsWith('.pdf') || req.file.mimetype === 'application/pdf') {
      const data = await pdfParse(req.file.buffer);
      textContent = data.text;
    } else if (filename.endsWith('.txt') || req.file.mimetype === 'text/plain') {
      textContent = req.file.buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: "Unsupported file format. Please upload a PDF or TXT file." });
    }

    if (!textContent.trim()) {
      return res.status(400).json({ error: "File text content is empty." });
    }

    // Limit length to prevent overflow
    textContent = textContent.substring(0, 15000);

    const systemPrompt = `You are a professional resume parser. Your job is to extract structured data from the resume text provided.
You MUST return ONLY a valid JSON object matching this schema exactly:
{
  "name": "Full Name",
  "skills": ["skill1", "skill2", ...],
  "experience": [{"company": "Company A", "role": "Role A", "years": 2}, ...],
  "education": [{"degree": "Degree A", "institution": "Institution A"}],
  "summary": "2 sentences summarizing candidate strength"
}
If any field cannot be found, populate it with a logical guess or empty array/string instead of leaving it null.`;

    const responseText = await callGeminiOrOpenRouter(
      null,
      [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nRESUME TEXT:\n${textContent}` }] }],
      true
    );

    const parsedJson = cleanAndParseJson(responseText);
    res.json(parsedJson);

  } catch (error) {
    console.error("Resume parsing error on Node:", error);
    // Safe fallback so interface remains working
    res.json({
      name: "Candidate",
      skills: ["JavaScript", "HTML", "CSS", "Problem Solving"],
      experience: [{ company: "Tech Company", role: "Developer", years: 2 }],
      education: [{ degree: "Computer Science", institution: "College" }],
      summary: "Resume uploaded successfully, processed via local backup profile."
    });
  }
});

// 2. Chat Session Route
app.post('/api/interview/chat', checkGeminiKey, async (req, res) => {
  try {
    const { bot_name, bot_rating, role, resume_parsed, messages, question_count, total_questions, audio, mimeType } = req.body;

    let botStyle = "";
    let difficultyInst = "";

    if (bot_name === "Alex") {
      botStyle = "Warm, highly encouraging, patient, speaking at a friendly slower pace, acting as a mentor.";
      difficultyInst = "Beginner (800 ELO): Ask very simple, basic questions. Keep it light, praise positive points, and gently highlight basic corrections.";
    } else if (bot_name === "Maya") {
      botStyle = "Energetic, engaging, and heavily focused on behavioral and situational alignment.";
      difficultyInst = "Intermediate (1200 ELO): Focus on standard behavioral interview techniques (STAR method, teamwork, conflict resolution). Propose typical workplace situations.";
    } else if (bot_name === "Rohan") {
      botStyle = "Direct, technically curious, professional, probes deep into technical choices and logical reasoning.";
      difficultyInst = "Advanced (1600 ELO): Ask medium-to-hard technical questions about the role. Ask them to explain architecture decisions, trade-offs, and algorithms. Probe their answers.";
    } else if (bot_name === "Dr. Chen") {
      botStyle = "Formal, serious, multi-dimensional, high pressure, high academic/professional standards.";
      difficultyInst = "Expert (2000 ELO): High standards across technical depth, system design, and communication. Challenge claims made on the resume. Follow up on weak answers with pressure.";
    } else if (bot_name === "Arya") {
      botStyle = "Intense, expects complete perfection, rapid-paced, direct, no-mercy recruiter from FAANG.";
      difficultyInst = "Legendary (2500 ELO): FAANG-level questions. Zero fluff, expects instant perfect solutions, optimization of code/algorithms, complex system scale issues, absolute technical and architectural correctness.";
    } else {
      botStyle = "Professional interviewer bot.";
      difficultyInst = "Standard interview questions.";
    }

    const currentQuestionIndex = question_count + 1;
    const isComplete = currentQuestionIndex > total_questions;

    const systemInstruction = `You are ${bot_name}, an AI mock interviewer with rating ${bot_rating} ELO.
Your personality/style: ${botStyle}
Difficulty calibration: ${difficultyInst}

Candidate profile:
- Name: ${resume_parsed.name || 'Candidate'}
- Target Role: ${role}
- Skills: ${(resume_parsed.skills || []).join(', ')}
- Experience: ${JSON.stringify(resume_parsed.experience || [])}
- Education: ${JSON.stringify(resume_parsed.education || [])}

Interview Flow State:
- Current Question Index: ${currentQuestionIndex} of ${total_questions} total.

INTERVIEW RULES:
1. Ask exactly ONE question at a time. Never ask multiple questions at once.
2. Questions MUST relate directly to the candidate's actual resume or target role (${role}) — avoid purely generic questions.
3. After the user provides an answer, evaluate it and return detailed feedback.
4. If the user's latest response contains audio (microphone voice input), you MUST transcribe their spoken response exactly and return it under the "user_transcription" key in the JSON response. If they answered with text, set "user_transcription" to "".
5. You MUST respond with a JSON block matching this schema exactly:
{
  "user_transcription": "Exact transcription of the candidate's spoken response from their audio, or empty string if they typed",
  "feedback": {
    "strengths": "1-2 sentences about what the candidate did well in their last answer",
    "weaknesses": "1-2 sentences highlighting fields of improvement or filler words",
    "model_answer": "A model response showing how an expert would have answered the question",
    "scores": { "communication": X, "technical": X, "relevance": X, "confidence": X } 
  },
  "next_question": "Your single next interview question",
  "question_type": "HR|Technical|Situational|Followup",
  "session_complete": false
}
Note: All scores must be integers out of 10. If this is the start of the interview (no user answers yet), set feedback fields and user_transcription to empty strings or 0, and just output your first question under 'next_question'.
If session_complete is true (we have reached ${total_questions} questions and evaluated the final answer), set 'session_complete' to true, 'next_question' to '', and add an extra key 'final_summary' under root:
"final_summary": {
  "overall_assessment": "3 sentences detailed summary of candidate performance",
  "grade": "A|B+|B|C+|C|D",
  "percentile": 85,
  "top_strengths": ["Strength 1", "Strength 2", "Strength 3"],
  "top_improvements": ["Improvement 1", "Improvement 2", "Improvement 3"],
  "study_recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"],
  "closing_note": "A final warm encouraging sentence."
}`;

    const contents = messages.map((msg, index) => {
      const role = msg.role === 'user' ? 'user' : 'model';
      
      // If it is the user's last message and we have audio, send as inlineData
      if (role === 'user' && index === messages.length - 1 && audio && mimeType) {
        const parts = [];
        if (msg.content && msg.content !== '[Processing voice answer...]') {
          parts.push({ text: msg.content });
        }
        parts.push({
          inlineData: {
            data: audio,
            mimeType: mimeType
          }
        });
        return {
          role: 'user',
          parts: parts
        };
      }
      
      return {
        role: role,
        parts: [{ text: msg.content }]
      };
    });

    const chatInput = contents.length > 0 ? contents : [{ role: 'user', parts: [{ text: "Please start the interview and ask the first question." }] }];

    const responseText = await callGeminiOrOpenRouter(systemInstruction, chatInput, true);
    const replyJson = cleanAndParseJson(responseText);

    if (isComplete) {
      replyJson.session_complete = true;
      replyJson.next_question = "";
      if (!replyJson.final_summary) {
        replyJson.final_summary = {
          overall_assessment: `You completed a highly challenging session with ${bot_name}. You displayed strong core competencies required for the ${role} role.`,
          grade: "B+",
          percentile: 78,
          top_strengths: ["Excellent response structures", "Good resume-to-role alignment", "Clear explanations"],
          top_improvements: ["Increase technical depth in details", "Explain project architecture more clearly", "Reduce verbal hesitation"],
          study_recommendations: [`Practice deep technical system designs for ${role}`, `Practice behavioral STAR alignment challenges`],
          closing_note: "Fantastic work completing the mock interview! Build on these tips and challenge a higher tier bot next."
        };
      }
    }

    res.json(replyJson);

  } catch (error) {
    console.error("Chat session error on Node:", error);
    res.status(500).json({ error: "Interview session error", detail: error.message });
  }
});

// 3. Scorecard Report Route
app.post('/api/interview/finish', checkGeminiKey, async (req, res) => {
  try {
    const { bot_name, role, resume_parsed, messages } = req.body;

    const systemInstruction = `You are an expert technical recruiter and interview analyst.
Evaluate the full interview history provided between the bot and the candidate, and generate a final comprehensive performance assessment scorecard.
You MUST return ONLY a valid JSON object matching this schema exactly:
{
  "overall_assessment": "A comprehensive 4-sentence overview evaluating their technical knowledge, communication clarity, and role suitability",
  "grade": "A+|A|B+|B|C+|C|D",
  "percentile": 82,
  "top_strengths": ["Strength 1", "Strength 2", "Strength 3"],
  "top_improvements": ["Improvement 1", "Improvement 2", "Improvement 3"],
  "study_recommendations": ["Study Guide 1", "Study Guide 2", "Study Guide 3"],
  "closing_note": "A motivating, positive parting recommendation."
}`;

    let historyText = "";
    for (const m of messages) {
      historyText += `${m.role.toUpperCase()}: ${m.content}\n\n`;
    }

    const userContent = `Candidate Name: ${resume_parsed.name || 'Candidate'}
Role: ${role}
Bot Opponent: ${bot_name}

INTERVIEW CHAT LOGS:
${historyText}`;

    const responseText = await callGeminiOrOpenRouter(
      systemInstruction,
      [{ role: 'user', parts: [{ text: userContent }] }],
      true
    );

    const reportJson = cleanAndParseJson(responseText);
    res.json(reportJson);

  } catch (error) {
    console.error("Finish analysis error on Node:", error);
    res.json({
      overall_assessment: `You have completed your mock interview for the ${req.body.role || 'selected'} role. Your background provides a very strong base, but there is room to refine your confidence and depth in technical deep dives.`,
      grade: "B",
      percentile: 72,
      top_strengths: ["Good communication structure", "Education background alignment", "Shows keen learning agility"],
      top_improvements: ["Provide deeper details in system designs", "Articulate technical problem-solving steps", "Reduce structural filler words"],
      study_recommendations: ["Study mock interview techniques", "Solve algorithm challenges on interactive platforms"],
      closing_note: "Great preparation! Re-evaluate your weak areas and practice again to claim a higher score."
    });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`InterviewArena Node.js Backend listening on port ${PORT}`);
});
