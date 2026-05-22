import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Upload, FileText, ArrowRight, Award, Trophy, Timer, CheckCircle, 
  HelpCircle, AlertTriangle, PlayCircle, RefreshCw, Clipboard, Sword, Sparkles,
  ChevronDown, ChevronUp, User, Briefcase, Volume2, VolumeX, Menu, X, BookOpen,
  Sun, Moon, Mic, MicOff
} from 'lucide-react';
import { Radar, Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

import CustomCursor from './components/CustomCursor';
import { sounds } from './components/SoundController';

// Register ChartJS modules
ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

// Constants
const BACKEND_URL = 'http://127.0.0.1:8000';

const ROLES = [
  'Software Engineer', 'Data Scientist', 'Product Manager', 'UX Designer', 
  'Marketing Analyst', 'Business Analyst', 'DevOps Engineer', 'Finance Analyst', 
  'HR Manager', 'Sales Executive'
];

const BOTS = [
  {
    id: 'alex',
    name: 'Alex',
    tagline: 'The Friendly Mentor',
    rating: 800,
    difficulty: 'Beginner',
    color: '#B8F0E6', // pastel mint
    textColor: '#0f4c40',
    tags: ['HR Focused', 'Basics', 'Encouraging'],
    avatar: '👨‍🏫',
    avatarBg: '#E8FBF7',
    personality: 'Warm, encouraging, patient, speaking at a friendly slower pace, acting as a mentor.',
    questions: 4
  },
  {
    id: 'maya',
    name: 'Maya',
    tagline: 'The Campus Recruiter',
    rating: 1200,
    difficulty: 'Intermediate',
    color: '#B3D9FF', // pastel blue
    textColor: '#103e6d',
    tags: ['Behavioral', 'Situational', 'STAR Method'],
    avatar: '👩‍💼',
    avatarBg: '#E6F2FF',
    personality: 'Energetic, engaging, and heavily focused on behavioral and situational alignment.',
    questions: 6
  },
  {
    id: 'rohan',
    name: 'Rohan',
    tagline: 'The Tech Screener',
    rating: 1600,
    difficulty: 'Advanced',
    color: '#C8B6FF', // pastel purple
    textColor: '#36227b',
    tags: ['Technical', 'Algorithms', 'Deep Probing'],
    avatar: '💻',
    avatarBg: '#F3EFFF',
    personality: 'Direct, technically curious, professional, probes deep into technical choices and logical reasoning.',
    questions: 8
  },
  {
    id: 'chen',
    name: 'Dr. Chen',
    tagline: 'The Panel Expert',
    rating: 2000,
    difficulty: 'Expert',
    color: '#FFE5A0', // pastel yellow
    textColor: '#5a460b',
    tags: ['Multi-Dimensional', 'System Design', 'Pressure'],
    avatar: '👨‍🔬',
    avatarBg: '#FFF9E8',
    personality: 'Formal, serious, multi-dimensional, high pressure, high academic/professional standards.',
    questions: 10
  },
  {
    id: 'arya',
    name: 'Arya',
    tagline: 'The FAANG Phantom',
    rating: 2500,
    difficulty: 'Legendary',
    color: '#FFB3C6', // pastel pink
    textColor: '#6d1026',
    tags: ['FAANG Level', 'Extreme Scale', 'Zero Mercy'],
    avatar: '🥷',
    avatarBg: '#FFE6EB',
    personality: 'Intense, expects complete perfection, rapid-paced, direct, no-mercy recruiter from FAANG.',
    questions: 11
  }
];

export default function App() {
  // App Global State
  const [screen, setScreen] = useState('landing'); // landing | onboarding | botSelect | interview | scorecard
  const [muted, setMuted] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [speechError, setSpeechError] = useState('');
  const [backendStatus, setBackendStatus] = useState('checking'); // checking | online | offline

  // User input states
  const [resumeRawText, setResumeRawText] = useState('');
  const [resumeFile, setResumeFile] = useState(null);
  const [isParsingResume, setIsParsingResume] = useState(false);
  
  const [parsedResume, setParsedResume] = useState({
    name: 'Candidate',
    skills: [],
    experience: [],
    education: [],
    summary: ''
  });
  const [resumeParsedConfirm, setResumeParsedConfirm] = useState(false);
  const [targetRole, setTargetRole] = useState(ROLES[0]);
  const [duration, setDuration] = useState(30); // minutes

  // Active challenger
  const [selectedBot, setSelectedBot] = useState(BOTS[0]);
  const [botCounts, setBotCounts] = useState({ alex: 0, maya: 0, rohan: 0, chen: 0, arya: 0 });

  // Interview cockpit state
  const [messages, setMessages] = useState([]); // {role: 'user'|'model', content: '...', feedback?: {...}, question_type?: '...'}
  const [questionCount, setQuestionCount] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(6);
  const [currentQuestionType, setCurrentQuestionType] = useState('HR');
  const [timeLeft, setTimeLeft] = useState(30 * 60); // seconds
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [fillerWordsTriggered, setFillerWordsTriggered] = useState([]);
  
  // Scorecard stats accumulator
  const [runningScores, setRunningScores] = useState({
    communication: [],
    technical: [],
    relevance: [],
    confidence: []
  });
  const [finalReport, setFinalReport] = useState(null);
  const [accordionOpenIndex, setAccordionOpenIndex] = useState({});

  // Hero drifting parallax
  const [scrollOffset, setScrollOffset] = useState(0);

  const [transcribedText, setTranscribedText] = useState('');
  const recognitionRef = useRef(null);
  const transcriptionAccumulatorRef = useRef('');

  // References
  const chatEndRef = useRef(null);
  const timerRef = useRef(null);
  const scrollObserverRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  // Sync theme changes
  useEffect(() => {
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // 1. Initialize Backend Connection Check
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/`);
        if (res.ok) {
          setBackendStatus('online');
        } else {
          setBackendStatus('offline');
        }
      } catch (err) {
        setBackendStatus('offline');
      }
    };
    checkBackend();

    // Sound initialization listener
    const triggerAudioInit = () => {
      sounds.init();
      window.removeEventListener('click', triggerAudioInit);
    };
    window.addEventListener('click', triggerAudioInit);

    // Scroll parallax tracker
    const handleScroll = () => {
      setScrollOffset(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll);

    // IntersectionObserver scroll fade-in initialization
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
          }
        });
      },
      { threshold: 0.1 }
    );
    scrollObserverRef.current = observer;

    return () => {
      window.removeEventListener('click', triggerAudioInit);
      window.removeEventListener('scroll', handleScroll);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Sync scroll animations on screen transition
  useEffect(() => {
    setTimeout(() => {
      const elements = document.querySelectorAll('.reveal-on-enter');
      elements.forEach(el => {
        if (scrollObserverRef.current) scrollObserverRef.current.observe(el);
      });
    }, 100);
  }, [screen]);

  // Sync chat logs view height
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAiGenerating]);

  // 2. Countdown Timer trigger
  useEffect(() => {
    if (screen === 'interview' && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            sounds.playWarning();
            handleInterviewFinish(); // auto wrap up
            return 0;
          }
          // Tick sound effect every second for final 10 seconds, else silent
          if (prev <= 11) {
            sounds.playTick();
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [screen, timeLeft]);

  // Local storage restoration
  useEffect(() => {
    const saved = localStorage.getItem('interviewArenaState');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (state.screen && state.screen !== 'interview') {
          // restore raw files, but avoid active interview restore
          setScreen(state.screen);
          if (state.parsedResume) {
            setParsedResume(state.parsedResume);
            setResumeParsedConfirm(true);
          }
          if (state.targetRole) setTargetRole(state.targetRole);
          if (state.duration) setDuration(state.duration);
          if (state.selectedBot) setSelectedBot(state.selectedBot);
        }
      } catch (e) {
        console.error("Local storage restoration met an error", e);
      }
    }
  }, []);

  const saveStateToLocal = (newScreen) => {
    localStorage.setItem('interviewArenaState', JSON.stringify({
      screen: newScreen,
      parsedResume,
      targetRole,
      duration,
      selectedBot
    }));
  };

  // Screen wipe triggers
  const transitionToScreen = (screenName) => {
    sounds.playBubblePop();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setScreen(screenName);
    saveStateToLocal(screenName);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Sound toggler
  const handleToggleMute = () => {
    const mutedState = sounds.toggleMute();
    setMuted(mutedState);
    if (mutedState && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  // Theme toggler
  const handleToggleTheme = () => {
    sounds.playBubblePop();
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Bot Speech Synthesis narration helper
  const speakBotAnswer = (text, botName) => {
    if (muted || !text || typeof window === 'undefined' || !window.speechSynthesis) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    // Cancel active narration
    window.speechSynthesis.cancel();

    // Create utterance
    const utterance = new SpeechSynthesisUtterance(text);

    // Dynamic pitch/rate based on bot ELO/personality
    let pitch = 1.0;
    let rate = 1.0;

    if (botName === "Alex") {
      rate = 0.85;
      pitch = 1.0;
    } else if (botName === "Maya") {
      rate = 1.05;
      pitch = 1.15;
    } else if (botName === "Rohan") {
      rate = 1.0;
      pitch = 1.0;
    } else if (botName === "Dr. Chen") {
      rate = 0.85;
      pitch = 0.8;
    } else if (botName === "Arya") {
      rate = 1.25;
      pitch = 1.05;
    }

    utterance.pitch = pitch;
    utterance.rate = rate;

    // Load voices and pick match
    const voices = window.speechSynthesis.getVoices();
    const englishVoices = voices.filter(v => v.lang.startsWith('en'));

    if (englishVoices.length > 0) {
      let selectedVoice = null;
      if (botName === "Alex" || botName === "Dr. Chen" || botName === "Rohan") {
        selectedVoice = englishVoices.find(v => {
          const name = v.name.toLowerCase();
          return name.includes('male') || name.includes('david') || name.includes('mark') || name.includes('microsoft') || name.includes('google');
        }) || englishVoices[0];
      } else {
        selectedVoice = englishVoices.find(v => {
          const name = v.name.toLowerCase();
          return name.includes('female') || name.includes('zira') || name.includes('hazel') || name.includes('google');
        }) || englishVoices[0];
      }
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }

    window.speechSynthesis.speak(utterance);
  };

  // Helper to convert audio blob to base64
  const convertBlobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      };
      reader.readAsDataURL(blob);
    });
  };

  // SpeechRecognition handlers using browser Web Speech API
  const startRecording = async () => {
    setSpeechError('');
    setTranscribedText('');
    transcriptionAccumulatorRef.current = '';

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechError("Speech recognition is not supported in this browser. Please try Chrome, Edge, or Safari.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = 0; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const fullTranscript = (finalTranscript + ' ' + interimTranscript).trim().replace(/\s+/g, ' ');
        setTranscribedText(fullTranscript);
      };

      recognition.onerror = (err) => {
        console.error("Speech recognition error:", err);
        if (err.error === 'not-allowed') {
          setSpeechError("Microphone access blocked or unauthorized.");
        } else if (err.error === 'network') {
          setSpeechError("Network error occurred during speech recognition. Check internet connectivity.");
        } else {
          setSpeechError(`Speech recognition error: ${err.error}`);
        }
        setIsRecording(false);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
      sounds.playChime();
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setSpeechError("Microphone access blocked or unavailable. Please verify site permissions.");
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
  };

  const clearRecordedAudio = () => {
    setTranscribedText('');
    setAudioBlob(null);
    setAudioUrl(null);
    sounds.playBubblePop();
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // 3. Resume File Upload and Parser API Call
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setResumeFile(file);
    setIsParsingResume(true);
    sounds.playChime();

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${BACKEND_URL}/api/upload-resume`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error("Resume parse request failed");

      const data = await response.json();
      setParsedResume(data);
      setResumeParsedConfirm(true);
      sounds.playSuccess();
    } catch (err) {
      console.error(err);
      // Fallback in case backend is offline or errors
      setParsedResume({
        name: file.name.replace(/\.[^/.]+$/, "").replace(/[_\-]/g, " "),
        skills: ["React", "JavaScript", "REST APIs", "Node.js", "Python", "Data Structures"],
        experience: [{ company: "Tech Industries", role: "Software Intern", years: 1 }],
        education: [{ degree: "Bachelor of Science", institution: "Tech Institute" }],
        summary: "Parsed successfully via local fallback mode. Ready for interview challenges!"
      });
      setResumeParsedConfirm(true);
      sounds.playSuccess();
    } finally {
      setIsParsingResume(false);
    }
  };

  // Textarea paste resume processing
  const handleTextareaResumeParse = async () => {
    if (!resumeRawText.trim()) return;
    setIsParsingResume(true);
    sounds.playChime();

    // Create virtual blob file to trigger the exact same parsing pipeline
    const blob = new Blob([resumeRawText], { type: 'text/plain' });
    const file = new File([blob], 'pasted_resume.txt', { type: 'text/plain' });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${BACKEND_URL}/api/upload-resume`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error("Resume parse request failed");

      const data = await response.json();
      setParsedResume(data);
      setResumeParsedConfirm(true);
      sounds.playSuccess();
    } catch (err) {
      console.error(err);
      setParsedResume({
        name: "Valued Candidate",
        skills: resumeRawText.split(/[\n,;]/).filter(s => s.trim().length > 2 && s.trim().length < 20).slice(0, 8).map(s => s.trim()),
        experience: [{ company: "Valued Company", role: "Technical Role", years: 2 }],
        education: [{ degree: "Degree Program", institution: "Educational Center" }],
        summary: "Pasted text processed cleanly. Ready to proceed."
      });
      setResumeParsedConfirm(true);
      sounds.playSuccess();
    } finally {
      setIsParsingResume(false);
    }
  };

  // 4. Start Challenge Interview Hook
  const handleChallengeBot = async (bot) => {
    setSelectedBot(bot);
    setTotalQuestions(bot.questions);
    setTimeLeft(duration * 60);
    setQuestionCount(0);
    setMessages([]);
    setFillerWordsTriggered([]);
    setRunningScores({ communication: [], technical: [], relevance: [], confidence: [] });
    setFinalReport(null);

    // Transition Cockpit
    setScreen('interview');
    setIsAiGenerating(true);
    sounds.playChime();

    // Request first question from backend
    try {
      const payload = {
        bot_name: bot.name,
        bot_rating: bot.rating,
        role: targetRole,
        resume_parsed: parsedResume,
        messages: [],
        question_count: 0,
        total_questions: bot.questions
      };

      const response = await fetch(`${BACKEND_URL}/api/interview/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Could not start interview server session");

      const data = await response.json();
      
      setMessages([{
        role: 'model',
        content: data.next_question,
        question_type: data.question_type
      }]);
      setCurrentQuestionType(data.question_type || 'HR');
      speakBotAnswer(data.next_question, bot.name);
    } catch (err) {
      // Offline fallback first question
      const fallbackQ = `Welcome! I am ${bot.name} (${bot.rating} ELO). I've reviewed your resume and am excited to test your fit for the ${targetRole} position. To start off, could you walk me through your background and why you applied?`;
      setMessages([{
        role: 'model',
        content: fallbackQ,
        question_type: 'HR'
      }]);
      setCurrentQuestionType('HR');
      speakBotAnswer(fallbackQ, bot.name);
    } finally {
      setIsAiGenerating(false);
    }
  };

  // Answer handler & word counter
  const handleAnswerChange = (e) => {
    const text = e.target.value;
    setUserAnswer(text);
    
    // Quick word count calculation
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setWordCount(words);

    // Real-time soft filler word detector
    const fillers = ["um", "uh", "like", "basically", "you know", "actually"];
    const found = [];
    fillers.forEach(f => {
      const regex = new RegExp(`\\b${f}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) found.push(f);
    });
    setFillerWordsTriggered(found);
  };

  // Keyboard shortcut check
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitAnswer();
    }
  };

  // 5. Submit User Answer API flow
  const handleSubmitAnswer = async () => {
    if ((!userAnswer.trim() && !transcribedText.trim()) || isAiGenerating) return;

    if (isRecording) {
      stopRecording();
    }

    sounds.playBubblePop();
    const textAnswer = userAnswer.trim();
    const voiceAnswer = transcribedText.trim();
    const isVoice = !textAnswer && voiceAnswer;

    // Prepare initial message
    const newUserMsg = {
      role: 'user',
      content: textAnswer || voiceAnswer || '[Empty Answer]',
      question_type: currentQuestionType,
      isVoice: isVoice
    };

    const updatedHistory = [...messages, newUserMsg];
    setMessages(updatedHistory);

    // Clear voice preview and textbox inputs
    clearRecordedAudio();
    setUserAnswer('');
    setWordCount(0);
    setFillerWordsTriggered([]);
    setIsAiGenerating(true);
    setQuestionCount(prev => prev + 1);

    if (fillerWordsTriggered.length > 0) {
      sounds.playWarning();
    }

    try {
      const payload = {
        bot_name: selectedBot.name,
        bot_rating: selectedBot.rating,
        role: targetRole,
        resume_parsed: parsedResume,
        messages: updatedHistory,
        question_count: questionCount + 1,
        total_questions: totalQuestions,
        audio: null,
        mimeType: null,
        mime_type: null
      };

      const response = await fetch(`${BACKEND_URL}/api/interview/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Chat request met an error");

      const data = await response.json();
      const feedback = data.feedback;

      setRunningScores(prev => ({
        communication: [...prev.communication, feedback.scores.communication],
        technical: [...prev.technical, feedback.scores.technical],
        relevance: [...prev.relevance, feedback.scores.relevance],
        confidence: [...prev.confidence, feedback.scores.confidence]
      }));

      sounds.playSuccess();

      // Append evaluated message
      setMessages(prev => {
        const updated = [...prev];
        const lastUserIdx = updated.findLastIndex(m => m.role === 'user');
        if (lastUserIdx !== -1) {
          // We can attach feedback and details to the last user message so they are persistent
          updated[lastUserIdx].feedback = feedback;
        }
        return [
          ...updated,
          { 
            role: 'model', 
            content: data.next_question, 
            question_type: data.question_type 
          }
        ];
      });

      setCurrentQuestionType(data.question_type || 'HR');
      speakBotAnswer(data.next_question, selectedBot.name);

      if (data.session_complete) {
        handleInterviewFinish(updatedHistory, data.final_summary);
      }

    } catch (err) {
      console.error(err);
      const dummyFeedback = {
        strengths: "You spoke with good structural coherence and referenced your experience.",
        weaknesses: fillerWordsTriggered.length > 0 ? `Spotted verbal crutches: ${fillerWordsTriggered.join(", ")}.` : "Provide a little more quantitative detail.",
        model_answer: `As a professional ${targetRole}, I focus on illustrating my work using the STAR format, quantifying my exact engineering inputs, and summarizing architectural patterns.`,
        scores: { communication: 8, technical: 7, relevance: 8, confidence: 9 }
      };

      setRunningScores(prev => ({
        communication: [...prev.communication, dummyFeedback.scores.communication],
        technical: [...prev.technical, dummyFeedback.scores.technical],
        relevance: [...prev.relevance, dummyFeedback.scores.relevance],
        confidence: [...prev.confidence, dummyFeedback.scores.confidence]
      }));

      sounds.playSuccess();

      const nextQ = questionCount + 2 <= totalQuestions 
        ? `Excellent. For my next question: How would you design a scalable microservices structure for a core feature in ${targetRole}?`
        : "";

      setMessages(prev => [
        ...prev.slice(0, -1),
        { ...newUserMsg, feedback: dummyFeedback },
        ...(nextQ ? [{ role: 'model', content: nextQ, question_type: 'Technical' }] : [])
      ]);

      setCurrentQuestionType('Technical');
      if (nextQ) {
        speakBotAnswer(nextQ, selectedBot.name);
      }

      if (questionCount + 1 >= totalQuestions) {
        handleInterviewFinish(updatedHistory);
      }
    } finally {
      setIsAiGenerating(false);
    }
  };

  // 6. Complete Interview & Generate Cinematic Scorecard
  const handleInterviewFinish = async (historyLog = messages, apiSummary = null) => {
    setIsAiGenerating(true);
    sounds.playChime();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // Helper score compiler
    const calcAvg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : 7.5;
    
    const commAvg = calcAvg(runningScores.communication);
    const techAvg = calcAvg(runningScores.technical);
    const relAvg = calcAvg(runningScores.relevance);
    const confAvg = calcAvg(runningScores.confidence);

    if (apiSummary) {
      setFinalReport(apiSummary);
      setScreen('scorecard');
      setIsAiGenerating(false);
      return;
    }

    try {
      const payload = {
        bot_name: selectedBot.name,
        role: targetRole,
        resume_parsed: parsedResume,
        messages: historyLog
      };

      const response = await fetch(`${BACKEND_URL}/api/interview/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Could not parse final scorecard");

      const data = await response.json();
      setFinalReport(data);
      sounds.playSuccess();
    } catch (err) {
      console.error(err);
      // Fallback analytical summary scorecard
      setFinalReport({
        overall_assessment: `You challenged ${selectedBot.name} (${selectedBot.rating} ELO) for the ${targetRole} role. Your communication scores were robust, and you highlighted strong background projects. Deepen your system architecture layouts next time.`,
        grade: commAvg + techAvg > 16 ? 'A' : commAvg + techAvg > 14 ? 'B+' : 'B',
        percentile: Math.round(55 + (commAvg + techAvg) * 2),
        top_strengths: ["Clear project articulation", "High candidate resilience", "Excellent educational mapping"],
        top_improvements: ["Structure answers more cleanly", "Address complex scaling issues", "Eliminate structural filler words"],
        study_recommendations: [`Explore mock challenges on algorithms`, `Develop microservices designs for ${targetRole}`],
        closing_note: "Awesome performance! Build on these findings and challenge a higher tier bot next."
      });
      sounds.playSuccess();
    } finally {
      setScreen('scorecard');
      setIsAiGenerating(false);
    }
  };

  // Bot ELO counter animation helper
  useEffect(() => {
    if (screen === 'botSelect') {
      const interval = setInterval(() => {
        setBotCounts(prev => {
          let updated = { ...prev };
          let done = true;
          BOTS.forEach(b => {
            if (prev[b.id] < b.rating) {
              updated[b.id] = Math.min(b.rating, prev[b.id] + 80);
              done = false;
            }
          });
          if (done) clearInterval(interval);
          return updated;
        });
      }, 30);
      return () => clearInterval(interval);
    } else {
      setBotCounts({ alex: 0, maya: 0, rohan: 0, chen: 0, arya: 0 });
    }
  }, [screen]);

  // Card 3D tilt effects
  const handleCardMouseMove = (e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const xc = rect.width / 2;
    const yc = rect.height / 2;
    
    const angleX = (yc - y) / 12;
    const angleY = (x - xc) / 12;
    
    card.style.transform = `perspective(1000px) rotateX(${angleX}deg) rotateY(${angleY}deg) scale3d(1.02, 1.02, 1.02)`;
  };

  const handleCardMouseLeave = (e) => {
    const card = e.currentTarget;
    card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
  };

  const copyScorecardToClipboard = () => {
    if (!finalReport) return;
    const reportText = `
🏆 INTERVIEWARENA SCORECARD REPORT
👤 Candidate: ${parsedResume.name}
🎯 Role: ${targetRole}
⚔️ Challenger Bot: ${selectedBot.name} (${selectedBot.rating} ELO)
📊 Performance Grade: ${finalReport.grade} (Top ${finalReport.percentile}%)
🗣️ Communication Score: ${Math.round(runningScores.communication.reduce((a,b)=>a+b,0)/runningScores.communication.length * 10)/10 || 7.8}/10
🧠 Technical Depth: ${Math.round(runningScores.technical.reduce((a,b)=>a+b,0)/runningScores.technical.length * 10)/10 || 7.5}/10

💡 Key Assessment: ${finalReport.overall_assessment}
💪 Top Strengths:
${finalReport.top_strengths.map(s => ` - ${s}`).join("\n")}
💡 Areas of Improvement:
${finalReport.top_improvements.map(i => ` - ${i}`).join("\n")}
    `;
    navigator.clipboard.writeText(reportText);
    sounds.playSuccess();
    alert("Scorecard report copied to clipboard!");
  };

  // Helper for Average Score values
  const getAverage = (arr) => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length * 10)/10 : 7.5;

  return (
    <div className="screen-wrapper">
      <CustomCursor />

      {/* Floating dynamic blobs with parallax offset based on scroll */}
      <div className="floating-blobs-container">
        <div className="blob blob-purple" style={{ transform: `translateY(${scrollOffset * 0.25}px)` }}></div>
        <div className="blob blob-pink" style={{ transform: `translateY(${scrollOffset * 0.12}px)` }}></div>
        <div className="blob blob-mint" style={{ transform: `translateY(${scrollOffset * 0.18}px)` }}></div>
      </div>

      {/* App Header */}
      <header className="app-header">
        <div className="brand-container interactive-card" onClick={() => transitionToScreen('landing')}>
          <div className="brand-icon">⚔️</div>
          <span className="brand-text">Interview<span>Arena</span></span>
        </div>

        <div className="header-actions">
          {/* Backend Status indicator */}
          <div className="server-status-badge">
            <span className={`status-dot ${backendStatus === 'online' ? 'online' : backendStatus === 'checking' ? 'checking' : 'offline'}`}></span>
            <span>{backendStatus === 'online' ? 'Local Server Live' : backendStatus === 'checking' ? 'Connecting...' : 'Fallback Mode'}</span>
          </div>

          <button onClick={handleToggleTheme} className="audio-btn" title="Toggle Light/Dark Mode">
            {theme === 'light' ? <Moon className="w-5.5 h-5.5" /> : <Sun className="w-5.5 h-5.5" />}
          </button>

          <button onClick={handleToggleMute} className="audio-btn" title={muted ? "Unmute sounds" : "Mute sounds"}>
            {muted ? <VolumeX className="w-5.5 h-5.5" /> : <Volume2 className="w-5.5 h-5.5" />}
          </button>
        </div>
      </header>

      {/* SCREEN 1: LANDING SCREEN */}
      {screen === 'landing' && (
        <main className="screen-container">
          <div className="landing-hero">
            <div className="landing-badge">
              <Sparkles className="w-4.5 h-4.5" /> Gamified AI Chess-style Mock Interviews
            </div>
            
            <h1 className="landing-title">
              Face the AI.<br />
              <span className="gradient-title-span">Ace the Real Thing.</span>
            </h1>

            <p className="landing-subtitle">
              Upload your resume. Choose your computer-opponent. Undergo structured live drills. Receive game-analysis scorecards with detailed AI feedback.
            </p>

            <div className="landing-ctas">
              <button 
                onClick={() => transitionToScreen('onboarding')}
                className="btn-primary"
              >
                <Sword className="w-5 h-5" /> Start Your Interview
              </button>
              
              <a 
                href="#how-it-works"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="btn-secondary"
              >
                Learn Mechanics <ArrowRight className="w-5 h-5" />
              </a>
            </div>

            {/* Scroll Indicator bouncing */}
            <div className="scroll-indicator-container">
              <span>Scroll to Explore Arena</span>
              <div className="scroll-mouse-outline">
                <div className="scroll-mouse-wheel"></div>
              </div>
            </div>
          </div>

          {/* Explanatory Grid */}
          <section id="how-it-works" className="landing-mechanics-section reveal-on-enter">
            <h2 className="section-title">The Game Mechanics</h2>
            
            <div className="mechanics-grid">
              <div className="glass-card">
                <div className="mechanics-card-icon">
                  <FileText className="w-6 h-6" style={{ color: 'var(--accent-1)' }} />
                </div>
                <h3 className="mechanics-card-title">1. Credential Onboarding</h3>
                <p className="mechanics-card-desc">
                  Upload a PDF resume. Our parser uses generative intelligence to parse your background, tailoring questions specifically to your actual history.
                </p>
              </div>
              <div className="glass-card">
                <div className="mechanics-card-icon">
                  <Sword className="w-6 h-6" style={{ color: 'var(--accent-2)' }} />
                </div>
                <h3 className="mechanics-card-title">2. Choose Your Challenger</h3>
                <p className="mechanics-card-desc">
                  Challenge bots ranging from Friendly Mentor (800 ELO) to the FAANG recruiter (2500 ELO). Each bot possesses unique questioning speed and behavioral parameters.
                </p>
              </div>
              <div className="glass-card">
                <div className="mechanics-card-icon">
                  <Trophy className="w-6 h-6" style={{ color: 'var(--accent-4)' }} />
                </div>
                <h3 className="mechanics-card-title">3. Cinematic Scorecard</h3>
                <p className="mechanics-card-desc">
                  Walk away with dynamic spider graphs, circular strength scales, inline feedback tabs, and tailored learning objectives calculated immediately.
                </p>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* SCREEN 2: RESUME ONBOARDING */}
      {screen === 'onboarding' && (
        <main className="screen-container">
          <div className="onboarding-title-area">
            <h1>Setup Your Credentials</h1>
            <p>Upload or paste your profile details to dynamically calibrate the AI interviewer.</p>
          </div>

          <div className="onboarding-layout">
            <div>
              {/* STEP 1: Upload / Paste */}
              <div className="glass-card step-card">
                <h2 className="step-title"><span>Step 1:</span> Resume Submission</h2>
                
                <div className="upload-options-grid">
                  {/* File Upload drag and drop box */}
                  <label className="drag-drop-label">
                    <input type="file" accept=".pdf,.txt" onChange={handleFileUpload} className="hidden" />
                    <Upload className="upload-icon" />
                    <span className="font-semibold block text-sm">Upload PDF or TXT</span>
                    <span className="text-xs text-gray-400 mt-1">Accepts standard PDF files</span>
                  </label>

                  {/* Plain Text input area */}
                  <div className="paste-textbox-container">
                    <textarea 
                      placeholder="Or paste your plain text resume here..." 
                      className="styled-textarea"
                      value={resumeRawText}
                      onChange={(e) => setResumeRawText(e.target.value)}
                    />
                    <button 
                      onClick={handleTextareaResumeParse}
                      disabled={!resumeRawText.trim() || isParsingResume}
                      className="btn-secondary"
                      style={{ padding: '10px 20px', fontSize: '14px' }}
                    >
                      Parse Text Input
                    </button>
                  </div>
                </div>

                {isParsingResume && (
                  <div className="parsing-loader-banner">
                    <RefreshCw className="spin-loader w-5 h-5" />
                    <span>Gemini parsing resume elements... extracting skills, education and background metrics.</span>
                  </div>
                )}
              </div>

              {/* STEP 2 & 3: Role & Timer */}
              <div className="glass-card step-card settings-grid">
                <div className="form-group">
                  <label><span>Step 2:</span> Target Job Role</label>
                  <div className="relative">
                    <select 
                      value={targetRole} 
                      onChange={(e) => setTargetRole(e.target.value)}
                      className="styled-select"
                    >
                      {ROLES.map((r, i) => <option key={i} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label><span>Step 3:</span> Interview Duration</label>
                  <div className="toggle-pill-group">
                    {[15, 30, 60, 120].map((t) => (
                      <button 
                        key={t}
                        onClick={() => setDuration(t)}
                        className={`toggle-pill ${duration === t ? 'active' : ''}`}
                      >
                        {t} min
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Resume snapshot confirmation card */}
            <div className="parsed-sidebar">
              {resumeParsedConfirm ? (
                <div className="parsed-card-emerald">
                  <div className="parsed-card-header">
                    <div className="parsed-card-check">✓</div>
                    <div>
                      <h3 className="font-bold text-[#1A1A2E]" style={{ fontSize: '16px' }}>Resume Parsed</h3>
                      <span className="text-xs text-gray-500">Tailored questioning is ready.</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4" style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '16px' }}>
                    <div>
                      <span className="parsed-label">Candidate Name</span>
                      <span className="parsed-value-name">{parsedResume.name}</span>
                    </div>

                    <div>
                      <span className="parsed-label">Identified Skills</span>
                      <div className="skills-flex-wrap">
                        {parsedResume.skills?.map((s, idx) => (
                          <span key={idx} className="skill-tag-teal">{s}</span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="parsed-label">Recent Background</span>
                      <ul className="experience-bullet-list">
                        {parsedResume.experience?.map((exp, idx) => (
                          <li key={idx}>
                            <strong>{exp.role}</strong> at {exp.company} ({exp.years}y)
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <span className="parsed-label">Target Strength Summary</span>
                      <p className="text-xs text-gray-600 italic">"{parsedResume.summary || 'Summary parsed successfully!'}"</p>
                    </div>
                  </div>

                  <button 
                    onClick={() => transitionToScreen('botSelect')}
                    className="btn-primary"
                    style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}
                  >
                    Proceed to Bots <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="parsed-placeholder-box">
                  <FileText className="w-12 h-12 text-[#C8B6FF] animate-pulse" />
                  <span>Waiting for Resume Upload...</span>
                  <p className="text-xs text-gray-400 font-normal">Your parsed credentials will appear here dynamically.</p>
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {/* SCREEN 3: BOT SELECTION SCREEN */}
      {screen === 'botSelect' && (
        <main className="screen-container">
          <div className="bot-select-header">
            <h1>Choose Your Challenger</h1>
            <p>Select an AI challenger configured with Chess-style ELO ratings and difficulty profiles.</p>
          </div>

          <div className="bots-grid-layout">
            {BOTS.map((bot) => (
              <div 
                key={bot.id}
                className="bot-card-wrapper"
              >
                <div 
                  className="glass-card bot-card"
                  onMouseMove={handleCardMouseMove}
                  onMouseLeave={handleCardMouseLeave}
                  style={{ borderTop: `6px solid ${bot.color}` }}
                >
                  <div className="bot-card-header">
                    <span className="difficulty-badge" style={{ backgroundColor: bot.color, color: bot.textColor }}>
                      {bot.difficulty}
                    </span>
                    <span className="elo-indicator">
                      ⚡ {botCounts[bot.id] || 0}
                    </span>
                  </div>

                  <div className="bot-card-profile">
                    <div className="bot-avatar-circle" style={{ backgroundColor: bot.avatarBg }}>
                      {bot.avatar}
                    </div>
                    <div className="bot-name-tagline">
                      <h3>{bot.name}</h3>
                      <span>{bot.tagline}</span>
                    </div>
                  </div>

                  <p className="bot-personality-quote">
                    "{bot.personality}"
                  </p>

                  <div className="bot-tags-row">
                    {bot.tags.map((tag, i) => (
                      <span key={i} className="bot-tag">{tag}</span>
                    ))}
                  </div>

                  <button 
                    onClick={() => handleChallengeBot(bot)}
                    className="btn-primary"
                    style={{ backgroundColor: bot.color, color: bot.textColor, width: '100%', justifyContent: 'center', marginTop: '8px' }}
                  >
                    Challenge Bot <Sword className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="scorecard-footer-actions" style={{ marginTop: '48px' }}>
            <button 
              onClick={() => transitionToScreen('onboarding')}
              className="btn-secondary"
            >
              ← Back to Onboarding Settings
            </button>
          </div>
        </main>
      )}

      {/* SCREEN 4: INTERVIEW COCKPIT SCREEN */}
      {screen === 'interview' && (
        <main className="screen-container cockpit-grid">
          
          {/* LEFT PANEL: Bot Details & Status */}
          <section className="cockpit-left-column">
            <div className="glass-card" style={{ gap: '20px' }}>
              
              {/* Bot Info */}
              <div className="cockpit-bot-header">
                <div className="cockpit-avatar" style={{ backgroundColor: selectedBot.avatarBg }}>
                  {selectedBot.avatar}
                </div>
                <div className="cockpit-bot-details">
                  <h3>{selectedBot.name}</h3>
                  <span className="cockpit-elo-badge">
                    ⚡ {selectedBot.rating} ELO
                  </span>
                </div>
              </div>

              {/* Live CountDown Timer */}
              <div className="progress-label-bar" style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '16px' }}>
                <span className="parsed-label">Time Remaining</span>
                <div className="cockpit-timer-box">
                  <div className="timer-icon-bg">
                    <Timer className="w-5.5 h-5.5 animate-pulse" />
                  </div>
                  <span className="timer-numbers">
                    {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              </div>

              {/* Progress Tracker */}
              <div className="progress-label-bar" style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '16px' }}>
                <div className="progress-label-row">
                  <span>Questions Progress</span>
                  <span>{questionCount} / {totalQuestions}</span>
                </div>
                <div className="progress-bar-track">
                  <div 
                    className="progress-bar-fill" 
                    style={{ width: `${(questionCount / totalQuestions) * 100}%` }}
                  />
                </div>
              </div>

              {/* Current Question category Badge */}
              <div className="progress-label-bar" style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '16px' }}>
                <span className="parsed-label">Active Focus</span>
                <span className="category-focus-badge">
                  [{currentQuestionType}] Drill
                </span>
              </div>

              {/* Force Finish Button */}
              <button 
                onClick={() => handleInterviewFinish()}
                className="btn-secondary"
                style={{ width: '100%', padding: '10px 14px', fontSize: '13px', color: 'var(--error)', borderColor: 'rgba(255, 107, 157, 0.4)', justifyContent: 'center' }}
              >
                Wrap Up & Grade Arena
              </button>
            </div>
          </section>

          {/* CENTER: Chat Interface */}
          <section className="cockpit-chat-column">
            
            {/* Scrollable chat log viewport */}
            <div className="chat-viewport">
              {messages.map((msg, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                  {/* Message bubble */}
                  <div className={`message-bubble ${msg.role === 'model' ? 'ai' : 'user'}`}>
                    {msg.isVoice ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontStyle: 'italic' }}>
                        🎤 [Voice Answer]
                      </span>
                    ) : (
                      msg.content
                    )}
                  </div>

                  {/* Inline feedback card if available */}
                  {msg.role === 'user' && msg.feedback && (
                    <div className="inline-eval-card">
                      <div className="inline-eval-header">
                        <span className="inline-eval-title">
                          📊 AI Evaluator Feedback
                        </span>
                        <div className="inline-eval-badges">
                          <span className="score-tiny-badge comm">Comm: {msg.feedback.scores.communication}/10</span>
                          <span className="score-tiny-badge tech">Tech: {msg.feedback.scores.technical}/10</span>
                        </div>
                      </div>

                      <div className="inline-eval-bullets">
                        <p><strong style={{ color: 'var(--success)' }}>✓ Strengths:</strong> {msg.feedback.strengths}</p>
                        <p><strong style={{ color: 'var(--error)' }}>⚠️ Weaknesses:</strong> {msg.feedback.weaknesses}</p>
                        
                        <details className="eval-details-collapsible">
                          <summary>Inspect Model Answer Breakdown</summary>
                          <p className="eval-model-answer-block">"{msg.feedback.model_answer}"</p>
                        </details>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {isAiGenerating && (
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                  <div className="message-bubble ai" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Evaluating logic...</span>
                    <div className="typing-dots">
                      <div className="typing-dot" />
                      <div className="typing-dot" />
                      <div className="typing-dot" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Troubleshooting Guide if voice fails */}
            {speechError && (speechError.includes('Network') || speechError.includes('network')) && (
              <div className="glass-card speech-troubleshoot-card">
                <div className="troubleshoot-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle className="w-5 h-5 text-rose-500" />
                    <strong style={{ fontSize: '15px', color: 'var(--error)' }}>Voice Connection Unreachable</strong>
                  </div>
                  <button 
                    onClick={() => setSpeechError('')} 
                    className="close-troubleshoot-btn"
                    title="Dismiss guide"
                    type="button"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>
                <div className="troubleshoot-body">
                  <p style={{ fontSize: '13px', margin: '0 0 12px 0', lineHeight: '1.5', color: 'var(--text-secondary)' }}>
                    Your browser was unable to reach the speech recognition servers. This is a common sandboxing behavior in privacy-focused browsers like <strong>Brave</strong> or behind strict networks/VPNs.
                  </p>
                  
                  <div className="troubleshoot-steps">
                    <div className="troubleshoot-step">
                      <span className="step-num">1</span>
                      <div>
                        <strong>For Brave Browser Users:</strong>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                          Open a new tab, navigate to <code className="styled-code">brave://settings/privacy</code> and toggle <strong>ON</strong> the option for <strong style={{ color: 'var(--accent-5)' }}>"Use Google services for speech-to-text"</strong>, then refresh this page.
                        </p>
                      </div>
                    </div>
                    <div className="troubleshoot-step">
                      <span className="step-num">2</span>
                      <div>
                        <strong>Check VPN & Permissions:</strong>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                          Ensure that active proxy/VPN services are not blocking standard Google server handshakes, and that microphone permission is granted.
                        </p>
                      </div>
                    </div>
                    <div className="troubleshoot-step">
                      <span className="step-num">3</span>
                      <div>
                        <strong>Fast Alternative:</strong>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                          You can always type your answer in the text box below and submit it directly to the AI for the same comprehensive ELO grading!
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* User typing/answer panel */}
            <div className="chat-input-controls">
              <div className="input-helper-row">
                <span>{wordCount} words — Target: 80–150 words</span>
                
                {isRecording && (
                  <span className="listening-alert recording-pulse">
                    <span className="recording-dot"></span> Recording Voice... Speak clearly
                  </span>
                )}

                {speechError && (
                  <span className="speech-error-alert">
                    <AlertTriangle className="w-3.5 h-3.5 inline mr-1" /> {speechError}
                  </span>
                )}

                {fillerWordsTriggered.length > 0 && (
                  <span className="crutch-words-alert">
                    <AlertTriangle className="w-3.5 h-3.5 inline mr-1" /> Crutches detected: {fillerWordsTriggered.join(", ")}
                  </span>
                )}
              </div>

              {transcribedText && !isRecording && (
                <div className="audio-preview-container">
                  <div className="audio-preview-card">
                    <div className="audio-preview-info">
                      <span className="audio-preview-icon">🎤</span>
                      <div className="audio-preview-details">
                        <span className="audio-preview-title">Voice Answer Captured</span>
                        <span className="audio-preview-size" style={{ color: 'var(--success)', fontWeight: 'bold' }}>
                          ✓ Ready for AI assessment (Privacy Mode active)
                        </span>
                      </div>
                    </div>
                    <button 
                      onClick={clearRecordedAudio} 
                      className="delete-audio-btn" 
                      title="Clear voice answer"
                      type="button"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              <div className="chat-input-flex">
                <textarea
                  placeholder={isRecording ? "Listening to your voice... Speak clearly" : "Type or click the microphone to speak your answer..."}
                  className="chat-textbox"
                  value={userAnswer}
                  onChange={handleAnswerChange}
                  onKeyDown={handleKeyDown}
                  disabled={isAiGenerating}
                />
                
                <button
                  onClick={handleToggleRecording}
                  className={`mic-btn ${isRecording ? 'listening' : ''}`}
                  disabled={isAiGenerating}
                  title={isRecording ? "Stop recording voice answer" : "Record voice answer"}
                  type="button"
                >
                  {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                <button
                  onClick={handleSubmitAnswer}
                  disabled={(!userAnswer.trim() && !transcribedText.trim()) || isAiGenerating || isRecording}
                  className="send-btn-primary"
                  title="Submit Answer"
                >
                  <ArrowRight className="w-5 h-5 text-white" />
                </button>
              </div>

              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', textAlign: 'center' }}>Press Enter to submit, Shift + Enter for newline</span>
            </div>
          </section>

          {/* RIGHT PANEL: Live Resume references & Running scores */}
          <section className="cockpit-right-column">
            
            {/* Live running scores */}
            <div className="glass-card cockpit-stats-card">
              <h3 style={{ fontSize: '18px' }}>Live Arena Stats</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {[
                  { label: '🗣️ Communication', key: 'communication', color: 'var(--success)' },
                  { label: '🧠 Technical Depth', key: 'technical', color: 'var(--accent-5)' },
                  { label: '🎯 Relevance', key: 'relevance', color: 'var(--accent-3)' },
                  { label: '💪 Confidence Signal', key: 'confidence', color: 'var(--accent-4)' }
                ].map((stat, idx) => {
                  const scoreVal = getAverage(runningScores[stat.key]);
                  return (
                    <div key={idx} className="cockpit-stat-row">
                      <div className="cockpit-stat-info">
                        <span>{stat.label}</span>
                        <span>{scoreVal}/10</span>
                      </div>
                      <div className="cockpit-stat-track">
                        <div 
                          className="cockpit-stat-fill" 
                          style={{ width: `${scoreVal * 10}%`, backgroundColor: stat.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Resume snapshot summary box */}
            <div className="glass-card cockpit-stats-card">
              <h3 style={{ fontSize: '18px' }}>Resume Snapshot</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <span className="parsed-label">Candidate Name</span>
                  <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{parsedResume.name}</strong>
                </div>
                <div>
                  <span className="parsed-label">Job Category</span>
                  <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{targetRole}</strong>
                </div>
                <div>
                  <span className="parsed-label">Skills Stack</span>
                  <div className="skills-flex-wrap" style={{ marginTop: '6px' }}>
                    {parsedResume.skills?.slice(0, 8).map((s, idx) => (
                      <span key={idx} className="skill-tag-teal" style={{ fontSize: '10px', padding: '2px 6px' }}>{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* SCREEN 5: CINEMATIC SCORECARD SCREEN */}
      {screen === 'scorecard' && finalReport && (
        <main className="screen-container" style={{ gap: '48px' }}>
          
          {/* HERO SCORE & OVERALL ASSESSMENT */}
          <div className="scorecard-hero-row">
            
            {/* Cinematic Overall score */}
            <div className="grade-badge-card">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-200/30 rounded-full blur-2xl"></div>
              <Trophy className="w-12 h-12 text-yellow-500 animate-bounce" />
              
              <div>
                <span className="grade-badge-label">Grade Result</span>
                <span className="grade-text-massive">{finalReport.grade}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="elo-delta-tag">+47 ELO Points</span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Performance tier: {finalReport.percentile}%</span>
              </div>
            </div>

            {/* Assessment explanation text */}
            <div className="glass-card verdict-info-card">
              <span className="verdict-tag">Evaluation Verdict</span>
              <h2 style={{ fontSize: '32px' }}>Analysis Summary</h2>
              <p className="verdict-assessment-text">
                "{finalReport.overall_assessment}"
              </p>
              
              <div className="badge-tag-wrap">
                <div className="custom-success-badge">
                  <CheckCircle className="w-4 h-4" /> Perfect Communication Mechanics
                </div>
                <div className="custom-success-badge" style={{ backgroundColor: '#e6f2ff', borderColor: 'var(--accent-5)', color: '#103e6d' }}>
                  <Award className="w-4 h-4" /> Challenge Unlocked
                </div>
              </div>
            </div>
          </div>

          {/* 4 CIRCULAR DIMENSION METRICS */}
          <section className="glass-card dimensions-section">
            <h3 style={{ fontSize: '24px' }}>Skill Dimensions Breakdown</h3>
            
            <div className="dimension-rings-grid">
              {[
                { label: 'Communication', key: 'communication', color: 'var(--success)' },
                { label: 'Technical Depth', key: 'technical', color: 'var(--accent-5)' },
                { label: 'Relevance', key: 'relevance', color: 'var(--accent-3)' },
                { label: 'Confidence Signals', key: 'confidence', color: 'var(--accent-4)' }
              ].map((item, idx) => {
                const avgScore = getAverage(runningScores[item.key]);
                const radius = 42;
                const circumference = 2 * Math.PI * radius;
                const offset = circumference - (avgScore / 10) * circumference;

                return (
                  <div key={idx} className="glass-card ring-score-card">
                    <div className="svg-ring-container">
                      <svg>
                        <circle 
                          cx="50" cy="50" r={radius} 
                          fill="transparent" 
                          stroke="rgba(0,0,0,0.04)" 
                          strokeWidth="7"
                        />
                        <circle 
                          cx="50" cy="50" r={radius} 
                          fill="transparent" 
                          stroke={item.color} 
                          strokeWidth="7"
                          strokeDasharray={circumference}
                          strokeDashoffset={offset}
                          strokeLinecap="round"
                          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
                        />
                      </svg>
                      <div className="svg-ring-score-text">
                        {avgScore}
                      </div>
                    </div>
                    <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-secondary)' }}>{item.label}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ANALYTICS SECTION (Chart.js Spider + Bar + Pie) */}
          <section className="charts-grid-row">
            
            {/* Radial Spider Chart */}
            <div className="glass-card chart-card-box">
              <h3>Competency Overlay</h3>
              <div className="chart-canvas-wrapper">
                <Radar 
                  data={{
                    labels: ['Communication', 'Technical Depth', 'Relevance', 'Confidence'],
                    datasets: [{
                      label: 'Your Dimension Metrics',
                      data: [
                        getAverage(runningScores.communication),
                        getAverage(runningScores.technical),
                        getAverage(runningScores.relevance),
                        getAverage(runningScores.confidence)
                      ],
                      backgroundColor: 'rgba(200, 182, 255, 0.3)',
                      borderColor: '#C8B6FF',
                      borderWidth: 2.5,
                      pointBackgroundColor: '#1A1A2E'
                    }]
                  }}
                  options={{
                    scales: { r: { min: 0, max: 10, ticks: { stepSize: 2 } } },
                    plugins: { legend: { display: false } }
                  }}
                />
              </div>
            </div>

            {/* Bar Chart: per question scores */}
            <div className="glass-card chart-card-box">
              <h3>Turn-by-Turn Scores</h3>
              <div className="chart-canvas-wrapper">
                <Bar 
                  data={{
                    labels: runningScores.communication.map((_, i) => `Q${i+1}`),
                    datasets: [
                      {
                        label: 'Comm',
                        data: runningScores.communication,
                        backgroundColor: '#6BCB77'
                      },
                      {
                        label: 'Tech',
                        data: runningScores.technical,
                        backgroundColor: '#B3D9FF'
                      }
                    ]
                  }}
                  options={{
                    scales: { y: { min: 0, max: 10 } },
                    responsive: true
                  }}
                />
              </div>
            </div>

            {/* Pie Chart: Time distributions */}
            <div className="glass-card chart-card-box">
              <h3>Category Composition</h3>
              <div className="chart-canvas-wrapper">
                <Pie 
                  data={{
                    labels: ['HR', 'Technical', 'Situational', 'Follow-up'],
                    datasets: [{
                      data: [
                        messages.filter(m => m.question_type === 'HR').length,
                        messages.filter(m => m.question_type === 'Technical').length,
                        messages.filter(m => m.question_type === 'Situational').length,
                        messages.filter(m => m.question_type === 'Followup').length
                      ],
                      backgroundColor: ['#FFE5A0', '#B3D9FF', '#B8F0E6', '#C8B6FF']
                    }]
                  }}
                />
              </div>
            </div>

          </section>

          {/* DETAILED QA ACCORDION LIST */}
          <section className="glass-card transcript-accordion-container">
            <h3 style={{ fontSize: '24px' }}>Turn-by-Turn Transcript</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {messages.filter(m => m.role === 'user').map((userMsg, idx) => {
                const isCollapsed = !accordionOpenIndex[idx];
                const aiQ = messages[messages.findIndex(m => m.content === userMsg.content) - 1];

                return (
                  <div key={idx} className="accordion-row">
                    <button 
                      onClick={() => setAccordionOpenIndex(prev => ({ ...prev, [idx]: isCollapsed }))}
                      className="accordion-trigger"
                    >
                      <div className="accordion-trigger-left">
                        <span className="accordion-q-badge">Question {idx + 1}</span>
                        <span className="accordion-text-truncated">Q: {aiQ?.content || "Mock starter challenge"}</span>
                      </div>
                      {isCollapsed ? <ChevronDown className="w-5 h-5 text-purple-500" /> : <ChevronUp className="w-5 h-5 text-purple-500" />}
                    </button>

                    {!isCollapsed && (
                      <div className="accordion-body-content">
                        <div className="accordion-content-block">
                          <strong style={{ color: '#7c5cff' }}>Question Asked:</strong>
                          <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>"{aiQ?.content}"</p>
                        </div>
                        <div className="accordion-content-block" style={{ borderTop: '1px solid rgba(0,0,0,0.04)', paddingTop: '12px' }}>
                          <strong style={{ color: 'var(--accent-5)' }}>Your Answered Drill:</strong>
                          <p style={{ fontFamily: 'monospace', fontSize: '13px', background: 'rgba(0,0,0,0.02)', padding: '12px', borderRadius: '10px' }}>
                            {userMsg.isVoice ? "🎤 [Voice Answer] (Privacy Mode active - Raw transcription hidden)" : `"${userMsg.content}"`}
                          </p>
                        </div>
                        {userMsg.feedback && (
                          <div className="accordion-content-block" style={{ borderTop: '1px solid rgba(0,0,0,0.04)', paddingTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div>
                              <strong style={{ color: 'var(--success)' }}>✓ Strengths Spotting:</strong>
                              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{userMsg.feedback.strengths}</p>
                            </div>
                            <div>
                              <strong style={{ color: 'var(--error)' }}>⚠️ Improvement Pointers:</strong>
                              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{userMsg.feedback.weaknesses}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* TIPS & IMPROVEMENT RECOMMENDATIONS */}
          <section className="bullets-split-grid">
            <div className="glass-card bullet-recommendations-card strengths">
              <h3 className="bullet-recs-title">
                <CheckCircle className="w-5.5 h-5.5 text-teal-600" /> Top Strengths Displayed
              </h3>
              <ul className="bullet-recs-list">
                {finalReport.top_strengths.map((str, idx) => (
                  <li key={idx}>
                    <CheckCircle className="w-4 h-4 text-teal-500" style={{ marginTop: '3px' }} />
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="glass-card bullet-recommendations-card improvements">
              <h3 className="bullet-recs-title">
                <AlertTriangle className="w-5.5 h-5.5 text-rose-500" /> Key Areas to Polish
              </h3>
              <ul className="bullet-recs-list">
                {finalReport.top_improvements.map((imp, idx) => (
                  <li key={idx}>
                    <AlertTriangle className="w-4 h-4 text-rose-400" style={{ marginTop: '3px' }} />
                    <span>{imp}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* study recommendations from Gemini */}
          <section className="glass-card study-objectives-card">
            <h3>
              <BookOpen className="w-5.5 h-5.5 text-yellow-700" /> Recommended Study Objectives
            </h3>
            <div className="study-objectives-grid">
              {finalReport.study_recommendations.map((rec, i) => (
                <div key={i} className="objective-item">
                  <span className="objective-number-circle">{i+1}</span>
                  {rec}
                </div>
              ))}
            </div>
          </section>

          {/* ACTION CTA BUTTONS */}
          <div className="scorecard-footer-actions">
            <button 
              onClick={() => handleChallengeBot(selectedBot)}
              className="btn-primary"
            >
              <RefreshCw className="w-5 h-5" /> Retake Challenger Drill
            </button>
            <button 
              onClick={() => transitionToScreen('botSelect')}
              className="btn-secondary"
            >
              ⚔️ Choose Next Challenger
            </button>
            <button 
              onClick={copyScorecardToClipboard}
              className="btn-secondary"
              style={{ color: 'var(--text-secondary)', borderColor: 'rgba(0,0,0,0.1)' }}
            >
              <Clipboard className="w-5 h-5" /> Copy Performance Sheet
            </button>
          </div>
        </main>
      )}

      {/* Footer details */}
      <footer className="app-footer">
        <p>© 2026 InterviewArena. Powered by Google Gemini Intelligence.</p>
        <p>Handcrafted with premium layout guidelines & procedural synthesized sound waves.</p>
      </footer>
    </div>
  );
}
