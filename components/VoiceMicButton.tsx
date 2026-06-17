import React, { useState, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface Props {
  onTranscript: (text: string) => void;
  className?: string;
  size?: number;
}

const VoiceMicButton: React.FC<Props> = ({ onTranscript, className = '', size = 18 }) => {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  const toggle = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (e: any) => {
      onTranscript(e.results[0][0].transcript);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  };

  return (
    <button
      onClick={toggle}
      type="button"
      title={listening ? 'Stop listening' : 'Voice input'}
      className={`p-2 rounded-lg transition-all ${
        listening
          ? 'text-red-400 bg-red-500/10 animate-pulse'
          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'
      } ${className}`}
    >
      {listening ? <MicOff size={size} /> : <Mic size={size} />}
    </button>
  );
};

export default VoiceMicButton;
