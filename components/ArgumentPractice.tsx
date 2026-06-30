import React, { useState, useRef, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import { MOCK_OPPONENT } from '../constants';
import { CoachingAnalysis, Message, TrialPhase, SimulationMode } from '../types';
import { Mic, MicOff, Activity, Volume2, AlertTriangle, BarChart2, Lightbulb, AlertCircle, PlayCircle, MessageSquare, BookOpen, Sword, GraduationCap, User, Gavel, ArrowLeft, FileText, XCircle, Users, Scale, CheckCircle2, TrendingUp, Target } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration, Blob } from "@google/genai";
import { getTrialSimSystemInstruction } from '../services/geminiService';
import AgentHeader from './AgentHeader';
import { OPERATIONAL_AGENTS } from '../agents/personas';
import { addInsight } from '../services/agentMemory';
import { deepseekChat } from '../services/deepseek';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';

const REX = OPERATIONAL_AGENTS.find(a => a.id === 'rex')!;

// --- Audio Utils for Live API ---
function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const nextIndex = Math.floor(i * ratio);
    result[i] = input[nextIndex];
  }
  return result;
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const AudioVisualizer = ({ volume, isActive }: { volume: number, isActive: boolean }) => {
  // A simple pure CSS equalizer that scales based on the volume prop
  const bars = Array.from({ length: 32 });
  return (
    <div className="flex items-center justify-center gap-[2px] h-32 w-full mt-4">
      {bars.map((_, i) => {
        // Create a pseudo-random wave pattern based on index and current volume
        const baseHeight = 10;
        const randomFactor = Math.sin(i * 0.5) * Math.cos(Date.now() * 0.001) * 0.5 + 0.5; // 0 to 1
        const height = isActive ? baseHeight + (volume * 1.5 * randomFactor * (i % 3 === 0 ? 1 : 0.6)) : baseHeight;
        
        return (
          <div 
            key={i} 
            className="w-1.5 rounded-full transition-all duration-75 ease-out"
            style={{ 
              height: `${Math.min(100, Math.max(10, height))}%`,
              backgroundColor: isActive 
                ? (volume > 20 ? '#ef4444' : '#3b82f6') // Red if loud, blue if normal
                : '#334155'
            }}
          />
        );
      })}
    </div>
  );
};

const TrialSim = () => {
  const { activeCase } = useContext(AppContext);
  
  // State for setup
  const [phase, setPhase] = useState<TrialPhase | null>(null);
  const [mode, setMode] = useState<SimulationMode | null>(null);
  const [simState, setSimState] = useState<'setup' | 'active'>('setup');

  // State for live session
  const [isLive, setIsLive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [liveVolume, setLiveVolume] = useState(0);
  const [objectionAlert, setObjectionAlert] = useState<{grounds: string, explanation: string} | null>(null);
  
  // State for UI
  const [messages, setMessages] = useState<Message[]>([]);
  const [coachingTip, setCoachingTip] = useState<CoachingAnalysis | null>(null);
  const [liveCaption, setLiveCaption] = useState<{text: string; speaker: 'you' | 'opponent'} | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scoring
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [finalScore, setFinalScore] = useState<any>(null);
  const [savingLog, setSavingLog] = useState(false);

  // Refs
  const sessionRef = useRef<any>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Transcription Buffer
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');
  const liveCaptionTimer = useRef<any>(null);

  const opponentName = activeCase?.opposingCounsel && activeCase.opposingCounsel !== 'Unknown' 
  ? activeCase.opposingCounsel 
  : MOCK_OPPONENT.name;

  // Cleanup
  useEffect(() => {
    return () => {
      stopLiveSession(false);
    };
  }, []);

  useEffect(() => {
    if (objectionAlert) {
      const timer = setTimeout(() => setObjectionAlert(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [objectionAlert]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --- Live API Logic ---

  const startLiveSession = async () => {
    if (!activeCase || !phase || !mode) return;

    setIsConnecting(true);
    try {
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      await inputCtx.resume();
      await outputCtx.resume();

      inputContextRef.current = inputCtx;
      outputContextRef.current = outputCtx;
      
      const outputNode = outputCtx.createGain();
      outputNode.connect(outputCtx.destination);

      let micStream: MediaStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ 
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        streamRef.current = micStream;
      } catch (micError) {
        console.error('Microphone access denied:', micError);
        throw new Error('Microphone access denied.');
      }

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || '';
      if (!apiKey) throw new Error('Gemini API key not found.');
      
      const ai = new GoogleGenAI({ apiKey });
      
      const coachingTool: FunctionDeclaration = {
        name: 'sendCoachingTip',
        description: 'Send text-based coaching, feedback, or a suggested script for the user to read. Use this FREQUENTLY.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            critique: { type: Type.STRING, description: "Critique of what user just said." },
            suggestion: { type: Type.STRING, description: "Strategic advice." },
            sampleResponse: { type: Type.STRING, description: "Short rebuttal." },
            teleprompterScript: { type: Type.STRING, description: "A longer script, bullet points, or question list for the user to read/reference." },
            fallaciesIdentified: { type: Type.ARRAY, items: { type: Type.STRING } },
            rhetoricalEffectiveness: { type: Type.NUMBER },
            rhetoricalFeedback: { type: Type.STRING },
          },
          required: ['critique', 'suggestion', 'teleprompterScript']
        }
      };

      const objectionTool: FunctionDeclaration = {
        name: 'raiseObjection',
        description: 'Trigger a visual OBJECTION alert on screen. Call this whenever you verbally object.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                grounds: { type: Type.STRING, description: "The legal grounds (e.g. Hearsay, Leading)." },
                explanation: { type: Type.STRING, description: "Brief explanation of why it is objectionable." }
            },
            required: ['grounds', 'explanation']
        }
      };

      const systemInstruction = getTrialSimSystemInstruction(phase, mode, opponentName, activeCase.summary);

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
          systemInstruction: systemInstruction,
          tools: [{ functionDeclarations: [coachingTool, objectionTool] }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            console.log("Live Connected");
            setIsLive(true);
            setIsConnecting(false);
            sessionPromise.then(session => session.sendToolResponse({
                functionResponses: { name: 'initial_context_trigger', id: 'init', response: { status: 'ready' } }
            }));

            const source = inputCtx.createMediaStreamSource(micStream);
            sourceRef.current = source;
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            processorRef.current = scriptProcessor;
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const resampledInput = resample(inputData, inputCtx.sampleRate, 16000);
              let sum = 0;
              for(let i=0; i<resampledInput.length; i++) sum += resampledInput[i] * resampledInput[i];
              setLiveVolume(Math.sqrt(sum / resampledInput.length) * 100);

              const pcmBlob = createBlob(resampledInput);
              sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
             const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
             if (audioData) {
                if (outputCtx.state === 'suspended') await outputCtx.resume();
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                const audioBuffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
                const source = outputCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputNode);
                source.addEventListener('ended', () => sourcesRef.current.delete(source));
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
             }

             if (msg.serverContent?.inputTranscription?.text) {
               currentInputTranscription.current += msg.serverContent.inputTranscription.text;
               setLiveCaption({ text: currentInputTranscription.current, speaker: 'you' });
               clearTimeout(liveCaptionTimer.current);
             }
             if (msg.serverContent?.outputTranscription?.text) {
               currentOutputTranscription.current += msg.serverContent.outputTranscription.text;
               setLiveCaption({ text: currentOutputTranscription.current, speaker: 'opponent' });
               clearTimeout(liveCaptionTimer.current);
             }

             if (msg.serverContent?.turnComplete) {
                 if (currentInputTranscription.current.trim()) {
                     setMessages(prev => [...prev, { id: Date.now()+'u', sender: 'user', text: currentInputTranscription.current, timestamp: Date.now() }]);
                     currentInputTranscription.current = '';
                 }
                 if (currentOutputTranscription.current.trim()) {
                     setMessages(prev => [...prev, { id: Date.now()+'o', sender: 'opponent', text: currentOutputTranscription.current, timestamp: Date.now() }]);
                     currentOutputTranscription.current = '';
                 }
                 liveCaptionTimer.current = setTimeout(() => setLiveCaption(null), 3000);
             }

             if (msg.toolCall) {
                 for (const fc of msg.toolCall.functionCalls) {
                     if (fc.name === 'sendCoachingTip') {
                         const args = fc.args as any;
                         setCoachingTip({
                            critique: args.critique,
                            suggestion: args.suggestion,
                            sampleResponse: args.sampleResponse,
                            teleprompterScript: args.teleprompterScript,
                            fallaciesIdentified: args.fallaciesIdentified || [],
                            rhetoricalEffectiveness: args.rhetoricalEffectiveness || 50,
                            rhetoricalFeedback: args.rhetoricalFeedback || ""
                         });
                         sessionPromise.then(s => s.sendToolResponse({
                             functionResponses: { id: fc.id, name: fc.name, response: { result: "displayed" } }
                         }));
                     }
                     else if (fc.name === 'raiseObjection') {
                        const args = fc.args as any;
                        setObjectionAlert({ grounds: args.grounds, explanation: args.explanation });
                        sessionPromise.then(s => s.sendToolResponse({
                            functionResponses: { id: fc.id, name: fc.name, response: { result: "alert_shown" } }
                        }));
                     }
                 }
             }
          },
          onclose: () => stopLiveSession(true),
          onerror: (e) => {
              console.error(e);
              stopLiveSession(true);
          }
        }
      });
      sessionRef.current = sessionPromise;

    } catch (e) {
      console.error('Live session error:', e);
      setIsConnecting(false);
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      alert(`Failed to connect: ${errorMsg}`);
    }
  };

  const savePracticeSession = async () => {
    if (!activeCase || messages.length === 0) return null;
    setSavingLog(true);
    const toastId = toast.info("Rex is compiling your trial practice coaching analysis...", { autoClose: false });

    const transcriptText = messages
      .map(m => `${m.sender === 'user' ? 'Attorney' : opponentName}: ${m.text}`)
      .join('\n');

    try {
      const logTitle = `Trial Practice Transcript - ${phase} (${new Date().toLocaleDateString()})`;
      await addInsight('rex', activeCase.id, {
        agentId: 'rex',
        caseId: activeCase.id,
        title: logTitle,
        content: transcriptText.slice(0, 1000),
        confidence: 90,
        type: 'prediction',
        source: 'monitoring',
      });

      const analysisPrompt = `You are Rex, Trial Coach at CaseBuddy Law Firm. Analyze the following practice transcript from a trial simulation session (Phase: ${phase}, Mode: ${mode}) and provide coaching notes. Provide the response as a JSON object with the following structure exactly:
{
  "overallScore": 75, // integer 0-100
  "summary": "2-3 sentences summarizing the performance.",
  "strengths": ["string", "string"],
  "weaknesses": ["string", "string"],
  "missedObjections": ["string", "string"]
}

Practice Transcript:
${transcriptText}`;

      const responseText = await deepseekChat({
        systemInstruction: `You are Rex, the firm's Trial Coach. You output valid JSON.`,
        messages: [{ role: 'user', content: analysisPrompt }],
        temperature: 0.5,
        maxTokens: 800,
        timeoutMs: 30_000,
        jsonMode: true
      });

      const result = JSON.parse(responseText);

      await addInsight('rex', activeCase.id, {
        agentId: 'rex',
        caseId: activeCase.id,
        title: `Rex's Coaching Notes - ${phase} (${new Date().toLocaleDateString()})`,
        content: result.summary,
        confidence: 95,
        type: 'recommendation',
        source: 'learning',
      });

      toast.update(toastId, {
        render: "Trial practice log & coaching feedback saved to Rex's memory!",
        type: "success",
        autoClose: 5000,
        isLoading: false
      } as any);

      return result;
    } catch (err) {
      console.error('Failed to save practice session to agent memory:', err);
      toast.update(toastId, {
        render: "Failed to save coaching log, but transcript is captured.",
        type: "error",
        autoClose: 5000,
        isLoading: false
      } as any);
      return null;
    } finally {
      setSavingLog(false);
    }
  };

  const stopLiveSession = async (triggerScore = true) => {
    if (isLive && messages.length > 0 && triggerScore) {
      const data = await savePracticeSession();
      if (data) {
        setFinalScore(data);
        setShowScoreModal(true);
      }
    }
    setIsLive(false);
    setIsConnecting(false);
    setLiveVolume(0);
    streamRef.current?.getTracks().forEach(t => t.stop());
    try { processorRef.current?.disconnect(); } catch { /* noop */ }
    try { sourceRef.current?.disconnect(); } catch { /* noop */ }
    processorRef.current = null;
    sourceRef.current = null;
    inputContextRef.current?.close();
    outputContextRef.current?.close();
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  // --- Render Logic ---
  
  const PHASES = [
    { id: 'pre-trial-motions', label: 'Pre-Trial Motions', icon: FileText, desc: 'Argue admissibility & procedure' },
    { id: 'voir-dire', label: 'Voir Dire', icon: Users, desc: 'Jury Selection & Questioning' },
    { id: 'opening-statement', label: 'Opening Statement', icon: BookOpen, desc: 'Establish your narrative' },
    { id: 'direct-examination', label: 'Direct Examination', icon: User, desc: 'Question your witness' },
    { id: 'cross-examination', label: 'Cross Examination', icon: Sword, desc: 'Question hostile witness' },
    { id: 'defendant-testimony', label: 'Defendant Testimony', icon: Mic, desc: 'Practice on the stand' },
    { id: 'closing-argument', label: 'Closing Argument', icon: Scale, desc: 'Final persuasion' },
    { id: 'sentencing', label: 'Sentencing', icon: Gavel, desc: 'Argue for leniency or severity' },
  ];

  const renderSetup = () => (
    <div className="max-w-5xl mx-auto space-y-8 p-4">
       <AgentHeader agent={REX} compact />
       <div className="text-center mb-12">
          <h1 className="text-4xl font-serif font-bold text-white mb-4">Trial Simulator</h1>
          <p className="text-slate-400 max-w-2xl mx-auto">
             Immersive, real-time trial preparation. Select a phase and mode to begin your session. 
             Voice recognition is active for realistic practice.
          </p>
       </div>

       {/* 1. Select Phase */}
       <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gold-500 flex items-center gap-2">
             <BookOpen size={24} /> Step 1: Select Trial Phase
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
             {PHASES.map((item) => {
               const Icon = item.icon;
               return (
                <button 
                  key={item.id}
                  onClick={() => setPhase(item.id as TrialPhase)}
                  className={`p-6 rounded-xl border text-left transition-all flex flex-col gap-3 ${
                     phase === item.id 
                     ? 'bg-gold-600 text-slate-900 border-gold-500 shadow-[0_0_20px_rgba(212,175,55,0.4)] scale-105' 
                     : 'bg-slate-900/60 backdrop-blur-sm text-slate-300 border-white/5 hover:bg-slate-800 hover:border-white/10'
                  }`}
                >
                   <div className={`p-3 rounded-full w-fit ${phase === item.id ? 'bg-slate-900/20 text-slate-900' : 'bg-slate-800 text-gold-500'}`}>
                      <Icon size={24} />
                   </div>
                   <div>
                      <h3 className="font-bold text-lg leading-tight mb-1">{item.label}</h3>
                      <p className={`text-xs ${phase === item.id ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>{item.desc}</p>
                   </div>
                </button>
               );
             })}
          </div>
       </div>

       {/* 2. Select Mode */}
       <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gold-500 flex items-center gap-2">
             <Activity size={24} /> Step 2: Select Intensity
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <button 
               onClick={() => setMode('learn')}
               className={`p-6 rounded-xl border text-left transition-all ${
                  mode === 'learn' 
                  ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.4)]' 
                  : 'bg-slate-900/60 backdrop-blur-sm text-slate-300 border-white/5 hover:bg-slate-800 hover:border-white/10'
               }`}
             >
                <div className="flex items-center gap-2 mb-2"><GraduationCap /> <span className="font-bold">Learn</span></div>
                <p className="text-xs opacity-80">AI provides full scripts, halts for coaching, and is forgiving.</p>
             </button>

             <button 
               onClick={() => setMode('practice')}
               className={`p-6 rounded-xl border text-left transition-all ${
                  mode === 'practice' 
                  ? 'bg-green-600 text-white border-green-500 shadow-[0_0_20px_rgba(22,163,74,0.4)]' 
                  : 'bg-slate-900/60 backdrop-blur-sm text-slate-300 border-white/5 hover:bg-slate-800 hover:border-white/10'
               }`}
             >
                 <div className="flex items-center gap-2 mb-2"><Mic /> <span className="font-bold">Practice</span></div>
                 <p className="text-xs opacity-80">Balanced. Real-time feedback tips, occasional objections.</p>
             </button>

             <button 
               onClick={() => setMode('trial')}
               className={`p-6 rounded-xl border text-left transition-all ${
                  mode === 'trial' 
                  ? 'bg-red-600 text-white border-red-500 shadow-[0_0_20px_rgba(220,38,38,0.4)]' 
                  : 'bg-slate-900/60 backdrop-blur-sm text-slate-300 border-white/5 hover:bg-slate-800 hover:border-white/10'
               }`}
             >
                 <div className="flex items-center gap-2 mb-2"><Sword /> <span className="font-bold">Simulate</span></div>
                 <p className="text-xs opacity-80">Real-time. Aggressive objections. No hand-holding. Hard mode.</p>
             </button>
          </div>
       </div>

       {/* Start Button */}
       <div className="flex justify-center pt-8">
          <button 
            disabled={!phase || !mode}
            onClick={() => setSimState('active')}
            className="bg-gradient-to-r from-gold-600 to-gold-500 text-slate-900 font-bold text-xl px-12 py-4 rounded-full disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 transition-transform shadow-[0_0_30px_rgba(212,175,55,0.4)] hover:shadow-[0_0_40px_rgba(212,175,55,0.6)]"
          >
             Enter Courtroom
          </button>
       </div>
    </div>
  );

  const renderActiveSim = () => (
    <div className="h-[calc(100vh-8rem)] flex gap-6 relative">
       
       {/* Full-Screen Objection Overlay */}
       {objectionAlert && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-none transition-all animate-in fade-in zoom-in duration-100">
             <div className="bg-red-600 p-12 rounded-3xl border-[12px] border-white shadow-[0_0_100px_rgba(220,38,38,1)] text-center max-w-4xl w-full transform rotate-[-2deg]">
                <div className="text-8xl font-black text-white tracking-tighter mb-4 font-serif uppercase" style={{ textShadow: '4px 4px 0px #991b1b' }}>OBJECTION!</div>
                <div className="text-4xl font-bold text-yellow-300 uppercase mb-8 tracking-wide">{objectionAlert.grounds}</div>
                <div className="text-2xl text-white bg-red-950/50 p-8 rounded-2xl border border-red-400/30 font-medium leading-relaxed">{objectionAlert.explanation}</div>
             </div>
          </div>
       )}

       {/* Left: Simulation Context & Visuals */}
       <div className="flex-1 flex flex-col bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden relative shadow-2xl">
          
          {/* Header */}
          <div className="h-16 bg-slate-950/50 border-b border-white/5 flex items-center px-6 justify-between">
             <div className="flex items-center gap-4">
                <button onClick={() => { stopLiveSession(false); setSimState('setup'); }} className="text-slate-400 hover:text-white transition-colors bg-white/5 p-2 rounded-lg">
                   <ArrowLeft size={20} />
                </button>
                <div>
                   <h2 className="text-white font-bold text-lg capitalize">{phase?.replace('-', ' ')}</h2>
                   <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold text-gold-500">Mode: {mode}</p>
                </div>
             </div>
             <div className="flex items-center gap-3">
                {isLive ? (
                   <div className="flex items-center gap-2 px-4 py-1.5 bg-red-500/10 border border-red-500/30 rounded-full animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                      <div className="w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,1)]"></div>
                      <span className="text-xs text-red-400 font-bold tracking-widest">ON AIR</span>
                   </div>
                ) : (
                   <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-800 border border-slate-700 rounded-full">
                      <div className="w-2.5 h-2.5 bg-slate-500 rounded-full"></div>
                      <span className="text-xs text-slate-400 font-bold tracking-widest">PAUSED</span>
                   </div>
                )}
             </div>
          </div>

          {/* Main Visual Area */}
          <div className="flex-1 bg-gradient-to-b from-slate-900 to-slate-950 flex flex-col items-center justify-center relative p-8">
             
             {/* Opponent Avatar with Audio Visualizer */}
             <div className="relative mb-12">
               <div className={`w-56 h-56 rounded-full flex items-center justify-center relative transition-all duration-300 z-10 ${isLive && liveVolume > 5 ? 'scale-105' : ''}`}>
                  <div className="absolute inset-0 rounded-full border-4 border-slate-800 shadow-2xl overflow-hidden">
                    <img 
                      src={phase === 'defendant-testimony' ? 'https://picsum.photos/id/1005/300/300' : 'https://picsum.photos/id/1025/300/300'} 
                      alt="Opponent" 
                      className="w-full h-full object-cover opacity-90"
                    />
                  </div>
               </div>
               
               {/* Behind-Avatar Visualizer Glow */}
               {isLive && (
                  <div 
                    className="absolute inset-0 rounded-full bg-blue-500 blur-[80px] -z-10 transition-opacity duration-75"
                    style={{ opacity: Math.min(0.8, liveVolume * 0.05) }}
                  />
               )}
               
               {/* Audio Visualizer Bars beneath avatar */}
               <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-64">
                 <AudioVisualizer volume={liveVolume} isActive={isLive} />
               </div>
             </div>

             {/* Status / Turn Indicator */}
             <div className="text-center space-y-2 mt-12">
                <h3 className="text-3xl font-serif font-bold text-white">
                   {phase === 'defendant-testimony' ? 'Prosecutor ' + opponentName : 'Opposing Counsel ' + opponentName}
                </h3>
                <p className="text-slate-400 font-medium">
                   {isConnecting ? "Establishing secure connection..." : isLive ? "Live analysis active." : "Ready to begin."}
                </p>
             </div>

             {/* Live Caption Bar */}
             <div className="absolute bottom-0 left-0 right-0 pointer-events-none p-6">
               {liveCaption ? (
                 <div className={`max-w-2xl mx-auto px-6 py-4 rounded-2xl backdrop-blur-xl shadow-2xl transition-all ${
                   liveCaption.speaker === 'you'
                     ? 'bg-blue-950/80 border border-blue-500/30'
                     : 'bg-red-950/80 border border-red-500/30'
                 }`}>
                   <div className="flex items-center justify-between mb-2">
                     <span className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${liveCaption.speaker === 'you' ? 'text-blue-400' : 'text-red-400'}`}>
                       {liveCaption.speaker === 'you' ? <Mic size={14}/> : <Volume2 size={14}/>}
                       {liveCaption.speaker === 'you' ? 'You' : opponentName}
                     </span>
                     <span className="flex gap-1">
                       <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${liveCaption.speaker === 'you' ? 'bg-blue-400' : 'bg-red-400'}`} style={{animationDelay:'0ms'}}></span>
                       <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${liveCaption.speaker === 'you' ? 'bg-blue-400' : 'bg-red-400'}`} style={{animationDelay:'150ms'}}></span>
                       <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${liveCaption.speaker === 'you' ? 'bg-blue-400' : 'bg-red-400'}`} style={{animationDelay:'300ms'}}></span>
                     </span>
                   </div>
                   <p className="text-white text-lg font-medium leading-relaxed">{liveCaption.text}</p>
                 </div>
               ) : messages.length > 0 ? (
                 <div className="max-w-2xl mx-auto px-6 py-4 rounded-2xl bg-slate-900/80 border border-slate-700/50 backdrop-blur-xl">
                   <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Previous Transcript</span>
                   <p className="text-slate-300 text-base mt-1 line-clamp-2 italic">"{messages[messages.length - 1].text}"</p>
                 </div>
               ) : null}
             </div>
          </div>

          {/* Controls */}
          <div className="h-28 bg-slate-950/80 backdrop-blur-xl border-t border-white/5 flex items-center justify-center gap-8 relative z-10">
             {!isLive ? (
                <button 
                  onClick={startLiveSession}
                  disabled={isConnecting}
                  className="flex flex-col items-center gap-2 group"
                >
                   <div className="w-16 h-16 rounded-full bg-gold-600 hover:bg-gold-500 flex items-center justify-center text-slate-900 transition-transform group-hover:scale-110 shadow-[0_0_20px_rgba(212,175,55,0.3)] group-hover:shadow-[0_0_30px_rgba(212,175,55,0.5)]">
                      {isConnecting ? <Activity className="animate-spin" size={32} /> : <Mic size={32} />}
                   </div>
                   <span className="text-sm text-gold-500 font-bold uppercase tracking-widest">{isConnecting ? 'Connecting' : 'Start Session'}</span>
                </button>
             ) : (
                <button 
                  onClick={() => stopLiveSession(true)}
                  className="flex flex-col items-center gap-2 group"
                >
                   <div className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center text-white transition-transform group-hover:scale-110 shadow-[0_0_20px_rgba(220,38,38,0.4)] animate-pulse">
                      <MicOff size={32} />
                   </div>
                   <span className="text-sm text-red-500 font-bold uppercase tracking-widest">End Session</span>
                </button>
             )}
          </div>
       </div>

       {/* Right: Coaching & Teleprompter */}
       <div className="w-96 flex flex-col gap-4">
          {/* Teleprompter / Script */}
          <div className="flex-1 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 overflow-y-auto shadow-2xl">
             <h3 className="text-gold-500 font-bold uppercase tracking-wider text-sm flex items-center gap-2 mb-5 border-b border-white/10 pb-3">
                <FileText size={18} /> 
                {mode === 'learn' ? 'AI Script Generator' : 'Teleprompter Notes'}
             </h3>
             
             {coachingTip?.teleprompterScript ? (
                <div className="prose prose-invert prose-sm">
                   <div className="whitespace-pre-wrap text-slate-200 font-medium leading-relaxed text-lg bg-slate-950/50 p-4 rounded-xl border border-white/5 shadow-inner">
                      {coachingTip.teleprompterScript}
                   </div>
                </div>
             ) : (
                <div className="text-slate-500 text-sm text-center mt-12 flex flex-col items-center gap-3">
                   <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                     <BookOpen className="text-slate-600" size={24} />
                   </div>
                   <p>Waiting for context...<br/>Start speaking to generate notes.</p>
                </div>
             )}
          </div>

          {/* Coaching Feedback */}
          <div className="h-1/2 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 overflow-y-auto shadow-2xl">
             <h3 className="text-blue-400 font-bold uppercase tracking-wider text-sm flex items-center gap-2 mb-5 border-b border-white/10 pb-3">
                <Lightbulb size={18} /> Real-time Coaching
             </h3>

             {coachingTip ? (
                <div className="space-y-5 animate-in slide-in-from-bottom-2 fade-in duration-300">
                   <div className="bg-slate-950/50 p-4 rounded-xl border border-white/5">
                      <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1 block">Critique</label>
                      <p className="text-sm text-white font-medium">{coachingTip.critique}</p>
                   </div>
                   <div className="bg-blue-950/30 p-4 rounded-xl border border-blue-500/20">
                      <label className="text-[10px] text-blue-400 uppercase tracking-widest font-bold mb-1 block">Strategic Move</label>
                      <p className="text-sm text-blue-100 font-bold">{coachingTip.suggestion}</p>
                   </div>
                   {coachingTip.fallaciesIdentified?.length > 0 && (
                      <div className="bg-red-950/50 p-4 rounded-xl border border-red-500/30">
                         <span className="text-red-400 text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 mb-2"><AlertTriangle size={14}/> Fallacy Detected</span>
                         <ul className="list-disc list-inside text-sm text-red-200 space-y-1">
                            {coachingTip.fallaciesIdentified.map((f, i) => <li key={i}>{f}</li>)}
                         </ul>
                      </div>
                   )}
                </div>
             ) : (
                <div className="text-slate-500 text-sm text-center mt-8 flex flex-col items-center gap-3">
                   <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                     <Target className="text-slate-600" size={24} />
                   </div>
                   <p>Live tactical feedback will appear here.</p>
                </div>
             )}
          </div>
       </div>

       {/* Score Modal */}
       {showScoreModal && finalScore && (
          <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
             <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-gold-500 to-red-500" />
                <div className="text-center mb-8">
                  <div className="w-24 h-24 rounded-full bg-slate-800 border-4 border-gold-500 flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(212,175,55,0.3)]">
                    <span className="text-4xl font-black text-white">{finalScore.overallScore}</span>
                  </div>
                  <h2 className="text-3xl font-serif font-bold text-white mb-2">Rhetorical Score</h2>
                  <p className="text-slate-400">{finalScore.summary}</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6 mb-8">
                  <div className="bg-green-950/30 border border-green-500/20 rounded-2xl p-5">
                    <h3 className="text-green-400 font-bold uppercase tracking-wider text-xs mb-3 flex items-center gap-2"><CheckCircle2 size={16}/> Strengths</h3>
                    <ul className="space-y-2">
                      {finalScore.strengths.map((s: string, i: number) => <li key={i} className="text-sm text-green-100 flex items-start gap-2"><span className="text-green-500 mt-1">•</span> {s}</li>)}
                    </ul>
                  </div>
                  <div className="bg-red-950/30 border border-red-500/20 rounded-2xl p-5">
                    <h3 className="text-red-400 font-bold uppercase tracking-wider text-xs mb-3 flex items-center gap-2"><TrendingUp size={16}/> Areas to Improve</h3>
                    <ul className="space-y-2">
                      {finalScore.weaknesses.map((w: string, i: number) => <li key={i} className="text-sm text-red-100 flex items-start gap-2"><span className="text-red-500 mt-1">•</span> {w}</li>)}
                    </ul>
                  </div>
                </div>

                {finalScore.missedObjections && finalScore.missedObjections.length > 0 && (
                  <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5 mb-8">
                    <h3 className="text-gold-500 font-bold uppercase tracking-wider text-xs mb-3 flex items-center gap-2"><AlertTriangle size={16}/> Missed Objections</h3>
                    <ul className="space-y-2">
                      {finalScore.missedObjections.map((o: string, i: number) => <li key={i} className="text-sm text-slate-300 flex items-start gap-2"><span className="text-gold-600 mt-1">•</span> {o}</li>)}
                    </ul>
                  </div>
                )}

                <div className="flex justify-center">
                  <button onClick={() => { setShowScoreModal(false); setSimState('setup'); }} className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-10 py-3 rounded-xl transition-colors">
                    Close Analysis
                  </button>
                </div>
             </div>
          </div>
       )}
    </div>
  );

  return activeCase ? (simState === 'setup' ? renderSetup() : renderActiveSim()) : (
     <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] text-slate-500">
        <AlertCircle size={48} className="mb-4 opacity-50" />
        <p className="text-lg font-semibold">No Active Case Selected</p>
        <p className="text-sm mt-2 max-w-md text-center leading-relaxed mb-6">
           Please select a case in "Case Files". You can create a new real-life case or load a mock scenario from our library.
        </p>
        <Link to="/app/cases" className="bg-gold-600 hover:bg-gold-500 text-slate-900 font-bold px-6 py-3 rounded-lg transition-colors">
           Go to Case Files
        </Link>
     </div>
  );
};

export default TrialSim;
