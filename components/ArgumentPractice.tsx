
import React, { useState, useRef, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import { MOCK_OPPONENT } from '../constants';
import { CoachingAnalysis, Message, TrialPhase, SimulationMode } from '../types';
import { Mic, MicOff, Activity, Volume2, AlertTriangle, BarChart2, Lightbulb, AlertCircle, PlayCircle, MessageSquare, BookOpen, Sword, GraduationCap, User, Gavel, ArrowLeft, FileText, XCircle, Users, Scale } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration, Blob } from "@google/genai";
import { getTrialSimSystemInstruction } from '../services/geminiService';
import { Link } from 'react-router-dom';

// --- Audio Utils for Live API ---
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

  // Refs
  const sessionRef = useRef<any>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
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
      stopLiveSession();
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
      // 1. Ensure AudioContext is resumed (User Gesture)
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      await inputCtx.resume();
      await outputCtx.resume();

      inputContextRef.current = inputCtx;
      outputContextRef.current = outputCtx;
      
      const outputNode = outputCtx.createGain();
      outputNode.connect(outputCtx.destination);

      // 2. Get Media Stream — declared here so onopen callback can access it
      let micStream: MediaStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });
        streamRef.current = micStream;
      } catch (micError) {
        console.error('Microphone access denied or unavailable:', micError);
        throw new Error('Microphone access denied. Please check browser permissions and that you are on HTTPS.');
      }

      // 3. Connect to Gemini
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || '';
      if (!apiKey) {
        throw new Error('Gemini API key not found. Please set VITE_GEMINI_API_KEY environment variable.');
      }
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
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }, 
          },
          systemInstruction: systemInstruction,
          tools: [{ functionDeclarations: [coachingTool, objectionTool] }],
          inputAudioTranscription: { model: "gemini-2.5-flash-native-audio-preview-09-2025" },
          outputAudioTranscription: { model: "gemini-2.5-flash-native-audio-preview-09-2025" },
        },
        callbacks: {
          onopen: () => {
            console.log("Live Connected");
            setIsLive(true);
            setIsConnecting(false);

            // Send initial "Start" signal
            sessionPromise.then(session => session.sendToolResponse({
                functionResponses: {
                    name: 'initial_context_trigger',
                    id: 'init',
                    response: { status: 'ready' }
                }
            }));

            // Audio Processing — use micStream captured in outer scope (not streamRef to avoid stale closure)
            const source = inputCtx.createMediaStreamSource(micStream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              // Viz
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
              setLiveVolume(Math.sqrt(sum / inputData.length) * 100);

              const pcmBlob = createBlob(inputData);
              sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
             // Audio Output
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

             // Live captioning — update incrementally as text arrives
             if (msg.serverContent?.inputTranscription?.text) {
               const chunk = msg.serverContent.inputTranscription.text;
               currentInputTranscription.current += chunk;
               setLiveCaption({ text: currentInputTranscription.current, speaker: 'you' });
               clearTimeout(liveCaptionTimer.current);
             }
             if (msg.serverContent?.outputTranscription?.text) {
               const chunk = msg.serverContent.outputTranscription.text;
               currentOutputTranscription.current += chunk;
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
                 // Clear live caption after a short delay so user can read the final line
                 liveCaptionTimer.current = setTimeout(() => setLiveCaption(null), 3000);
             }

             // Tool Calls
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
                        setObjectionAlert({
                            grounds: args.grounds,
                            explanation: args.explanation
                        });
                        sessionPromise.then(s => s.sendToolResponse({
                            functionResponses: { id: fc.id, name: fc.name, response: { result: "alert_shown" } }
                        }));
                     }
                 }
             }
          },
          onclose: () => stopLiveSession(),
          onerror: (e) => {
              console.error(e);
              stopLiveSession();
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

  const stopLiveSession = () => {
    setIsLive(false);
    setIsConnecting(false);
    setLiveVolume(0);
    streamRef.current?.getTracks().forEach(t => t.stop());
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
                     ? 'bg-gold-600 text-slate-900 border-gold-500 shadow-lg scale-105' 
                     : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                   <div className={`p-3 rounded-full w-fit ${phase === item.id ? 'bg-slate-900/20 text-slate-900' : 'bg-slate-700 text-gold-500'}`}>
                      <Icon size={24} />
                   </div>
                   <div>
                      <h3 className="font-bold text-lg leading-tight mb-1">{item.label}</h3>
                      <p className={`text-xs ${phase === item.id ? 'text-slate-800' : 'text-slate-400'}`}>{item.desc}</p>
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
                  ? 'bg-blue-600 text-white border-blue-500' 
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
               }`}
             >
                <div className="flex items-center gap-2 mb-2"><GraduationCap /> <span className="font-bold">Learn</span></div>
                <p className="text-xs opacity-80">AI provides full scripts, halts for coaching, and is forgiving.</p>
             </button>

             <button 
               onClick={() => setMode('practice')}
               className={`p-6 rounded-xl border text-left transition-all ${
                  mode === 'practice' 
                  ? 'bg-green-600 text-white border-green-500' 
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
               }`}
             >
                 <div className="flex items-center gap-2 mb-2"><Mic /> <span className="font-bold">Practice</span></div>
                 <p className="text-xs opacity-80">Balanced. Real-time feedback tips, occasional objections.</p>
             </button>

             <button 
               onClick={() => setMode('trial')}
               className={`p-6 rounded-xl border text-left transition-all ${
                  mode === 'trial' 
                  ? 'bg-red-600 text-white border-red-500' 
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
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
            className="bg-gradient-to-r from-gold-600 to-gold-500 text-slate-900 font-bold text-xl px-12 py-4 rounded-full disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 transition-transform shadow-xl"
          >
             Enter Courtroom
          </button>
       </div>
    </div>
  );

  const renderActiveSim = () => (
    <div className="h-[calc(100vh-8rem)] flex gap-6 relative">
       
       {/* Objection Overlay */}
       {objectionAlert && (
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
             <div className="bg-red-600/90 backdrop-blur-md p-10 rounded-2xl border-4 border-white shadow-2xl animate-bounce-in text-center max-w-2xl">
                <div className="text-6xl font-black text-white tracking-tighter mb-2 font-serif">OBJECTION!</div>
                <div className="text-2xl font-bold text-red-100 uppercase mb-4">{objectionAlert.grounds}</div>
                <div className="text-lg text-white bg-black/20 p-4 rounded-lg">{objectionAlert.explanation}</div>
             </div>
          </div>
       )}

       {/* Left: Simulation Context & Visuals */}
       <div className="flex-1 flex flex-col bg-slate-900 border border-slate-700 rounded-xl overflow-hidden relative shadow-2xl">
          
          {/* Header */}
          <div className="h-16 bg-slate-800 border-b border-slate-700 flex items-center px-6 justify-between">
             <div className="flex items-center gap-4">
                <button onClick={() => { stopLiveSession(); setSimState('setup'); }} className="text-slate-400 hover:text-white">
                   <ArrowLeft size={24} />
                </button>
                <div>
                   <h2 className="text-white font-bold text-lg capitalize">{phase?.replace('-', ' ')}</h2>
                   <p className="text-xs text-slate-400 uppercase tracking-wider">Mode: {mode}</p>
                </div>
             </div>
             <div className="flex items-center gap-3">
                {isLive && (
                   <div className="flex items-center gap-2 px-3 py-1 bg-red-900/50 border border-red-500/50 rounded-full animate-pulse">
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      <span className="text-xs text-red-200 font-bold">ON AIR</span>
                   </div>
                )}
             </div>
          </div>

          {/* Main Visual Area */}
          <div className="flex-1 bg-gradient-to-b from-slate-900 to-slate-850 flex flex-col items-center justify-center relative p-8">
             
             {/* Opponent Avatar */}
             <div className={`w-48 h-48 rounded-full flex items-center justify-center mb-8 relative transition-all duration-300 ${isLive && liveVolume > 5 ? 'scale-105 border-4 border-red-500' : 'border-4 border-slate-700'}`}>
                <img 
                  src={phase === 'defendant-testimony' ? 'https://picsum.photos/id/1005/200/200' : 'https://picsum.photos/id/1025/200/200'} 
                  alt="Opponent" 
                  className="w-full h-full rounded-full object-cover opacity-80"
                />
                {/* Audio Viz Ring */}
                {isLive && (
                   <div className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-20"></div>
                )}
             </div>

             {/* Status / Turn Indicator */}
             <div className="text-center space-y-2">
                <h3 className="text-2xl font-serif font-bold text-white">
                   {phase === 'defendant-testimony' ? 'Prosecutor ' + opponentName : 'Opposing Counsel ' + opponentName}
                </h3>
                <p className="text-slate-400 italic">
                   {isConnecting ? "Connecting to courtroom..." : isLive ? "Listening..." : "Session Paused"}
                </p>
             </div>

             {/* Live Caption Bar — shows real-time transcription as it streams in */}
             <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
               {liveCaption ? (
                 <div className={`mx-4 mb-4 px-5 py-3 rounded-xl backdrop-blur-md border shadow-2xl transition-all ${
                   liveCaption.speaker === 'you'
                     ? 'bg-blue-950/80 border-blue-500/50 text-right'
                     : 'bg-red-950/80 border-red-500/50 text-left'
                 }`}>
                   <div className="flex items-center gap-2 mb-1 justify-between">
                     <span className={`text-xs font-bold uppercase tracking-wider ${liveCaption.speaker === 'you' ? 'text-blue-400 ml-auto' : 'text-red-400'}`}>
                       {liveCaption.speaker === 'you' ? '🎤 You' : `🔴 ${opponentName}`}
                     </span>
                     <span className="flex gap-0.5">
                       <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{animationDelay:'0ms'}}></span>
                       <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{animationDelay:'150ms'}}></span>
                       <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{animationDelay:'300ms'}}></span>
                     </span>
                   </div>
                   <p className="text-white text-sm font-medium leading-snug line-clamp-3">{liveCaption.text}</p>
                 </div>
               ) : messages.length > 0 ? (
                 <div className="mx-4 mb-4 px-5 py-3 rounded-xl bg-slate-900/60 border border-slate-700/50 backdrop-blur-sm">
                   <span className="text-xs text-slate-500 uppercase tracking-wider">Last said</span>
                   <p className="text-slate-300 text-sm mt-0.5 line-clamp-2">{messages[messages.length - 1].text}</p>
                 </div>
               ) : null}
             </div>
          </div>

          {/* Controls */}
          <div className="h-24 bg-slate-800 border-t border-slate-700 flex items-center justify-center gap-8">
             {!isLive ? (
                <button 
                  onClick={startLiveSession}
                  disabled={isConnecting}
                  className="flex flex-col items-center gap-1 group"
                >
                   <div className="w-14 h-14 rounded-full bg-gold-600 hover:bg-gold-500 flex items-center justify-center text-slate-900 transition-transform group-hover:scale-110 shadow-lg">
                      {isConnecting ? <Activity className="animate-spin" /> : <Mic size={28} />}
                   </div>
                   <span className="text-xs text-gold-500 font-bold uppercase">{isConnecting ? 'Connecting' : 'Start'}</span>
                </button>
             ) : (
                <button 
                  onClick={stopLiveSession}
                  className="flex flex-col items-center gap-1 group"
                >
                   <div className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center text-white transition-transform group-hover:scale-110 shadow-lg animate-pulse">
                      <MicOff size={28} />
                   </div>
                   <span className="text-xs text-red-500 font-bold uppercase">Stop</span>
                </button>
             )}
          </div>
       </div>

       {/* Right: Coaching & Teleprompter */}
       <div className="w-96 flex flex-col gap-4">
          {/* Teleprompter / Script */}
          <div className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-6 overflow-y-auto">
             <h3 className="text-gold-500 font-bold uppercase text-sm flex items-center gap-2 mb-4 border-b border-slate-800 pb-2">
                <FileText size={16} /> 
                {mode === 'learn' ? 'AI Script Generator' : 'Reference Notes'}
             </h3>
             
             {coachingTip?.teleprompterScript ? (
                <div className="prose prose-invert prose-sm">
                   <div className="whitespace-pre-wrap text-slate-300 font-medium leading-relaxed">
                      {coachingTip.teleprompterScript}
                   </div>
                </div>
             ) : (
                <div className="text-slate-500 text-sm italic text-center mt-10">
                   Waiting for AI to generate script based on context...
                   <br/>
                   Start speaking to trigger suggestions.
                </div>
             )}
          </div>

          {/* Coaching Feedback */}
          <div className="h-1/2 bg-slate-800 border border-slate-700 rounded-xl p-6 overflow-y-auto">
             <h3 className="text-blue-400 font-bold uppercase text-sm flex items-center gap-2 mb-4 border-b border-slate-700 pb-2">
                <Lightbulb size={16} /> Real-time Coaching
             </h3>

             {coachingTip ? (
                <div className="space-y-4 animate-fadeIn">
                   <div>
                      <label className="text-xs text-slate-500 uppercase font-bold">Critique</label>
                      <p className="text-sm text-white">{coachingTip.critique}</p>
                   </div>
                   <div>
                      <label className="text-xs text-slate-500 uppercase font-bold">Next Step</label>
                      <p className="text-sm text-gold-400 font-medium">{coachingTip.suggestion}</p>
                   </div>
                   {coachingTip.fallaciesIdentified?.length > 0 && (
                      <div className="bg-red-900/30 p-3 rounded border border-red-500/30">
                         <span className="text-red-400 text-xs font-bold flex items-center gap-1 mb-1"><AlertTriangle size={12}/> Fallacy Detected</span>
                         <ul className="list-disc list-inside text-xs text-red-200">
                            {coachingTip.fallaciesIdentified.map((f, i) => <li key={i}>{f}</li>)}
                         </ul>
                      </div>
                   )}
                </div>
             ) : (
                <div className="text-slate-500 text-sm text-center mt-4">
                   Live feedback will appear here.
                </div>
             )}
          </div>
       </div>
    </div>
  );

  return activeCase ? (simState === 'setup' ? renderSetup() : renderActiveSim()) : (
     <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] text-slate-500">
        <AlertCircle size={48} className="mb-4 opacity-50" />
        <p className="text-lg font-semibold">No Active Case Selected</p>
        <p className="text-sm mt-2 max-w-md text-center leading-relaxed mb-6">
           Please select a case in "Case Files". You can create a new real-life case or load a mock scenario from our library.
        </p>
        <Link to="/cases" className="bg-gold-600 hover:bg-gold-500 text-slate-900 font-bold px-6 py-3 rounded-lg transition-colors">
           Go to Case Files
        </Link>
     </div>
  );
};

export default TrialSim;
