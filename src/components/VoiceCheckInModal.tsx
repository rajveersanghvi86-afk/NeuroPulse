import React, { useState, useEffect } from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { acousticEngine } from '../lib/acousticEngine';
import { Mic, Activity, X } from 'lucide-react';

export const VoiceCheckInModal: React.FC = () => {
  const { showVoiceCheckIn, setVoiceCheckIn } = useTelemetryStore();
  const [status, setStatus] = useState<'idle' | 'recording' | 'analyzing' | 'done'>('idle');
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    if (showVoiceCheckIn) {
      setStatus('idle');
      setScore(null);
    }
  }, [showVoiceCheckIn]);

  if (!showVoiceCheckIn) return null;

  const handleStart = async () => {
    setStatus('recording');
    
    // Ensure acoustic engine is initialized
    if (!acousticEngine.isInitialized) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        await acousticEngine.initialize(stream);
      } catch (err) {
        console.error("Mic error:", err);
        setVoiceCheckIn(false);
        return;
      }
    }

    // 5s Jitter analysis
    const jitterScore = await acousticEngine.analyzeVoiceTremor();
    setStatus('analyzing');
    
    setTimeout(() => {
      setScore(jitterScore);
      setStatus('done');
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-6">
      
      <div className="relative w-full max-w-lg glass-panel p-8 flex flex-col items-center border border-white/10 rounded-2xl">
        <button 
          onClick={() => setVoiceCheckIn(false)}
          className="absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          <X className="w-6 h-6" />
        </button>

        <h2 className="text-2xl font-bold text-white mb-2">Cognitive Voice Check</h2>
        <p className="text-slate-400 text-center mb-8">
          Read the phrase below aloud. We will analyze micro-tremors in your voice pitch to assess fatigue.
        </p>

        <div className="bg-slate-800/50 p-6 rounded-xl border border-white/5 mb-8 w-full">
          <p className="text-2xl text-center font-serif text-slate-200 italic">
            "The quick brown fox jumps over the lazy dog."
          </p>
        </div>

        {status === 'idle' && (
          <button 
            onClick={handleStart}
            className="flex items-center gap-2 px-8 py-3 bg-baseline text-slate-900 rounded-full font-bold hover:bg-baseline/80 transition-colors"
          >
            <Mic className="w-5 h-5" /> Start 5-Second Recording
          </button>
        )}

        {status === 'recording' && (
          <div className="flex flex-col items-center gap-4">
            <div className="relative flex items-center justify-center">
              <Mic className="w-8 h-8 text-severe animate-pulse" />
              <div className="absolute inset-0 border-2 border-severe rounded-full animate-ping opacity-20" />
            </div>
            <p className="text-severe font-bold">Recording... Please speak.</p>
          </div>
        )}

        {status === 'analyzing' && (
          <div className="flex flex-col items-center gap-4">
            <Activity className="w-8 h-8 text-warning animate-bounce" />
            <p className="text-warning font-bold">Analyzing Pitch Jitter...</p>
          </div>
        )}

        {status === 'done' && score !== null && (
          <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in">
            <div className={`text-5xl font-bold ${score > 50 ? 'text-severe' : score > 25 ? 'text-warning' : 'text-baseline'}`}>
              {score}
            </div>
            <p className="text-slate-300 font-semibold uppercase tracking-wider text-sm">Vocal Tremor Score</p>
            <p className="text-slate-400 text-sm text-center">
              {score > 50 
                ? "High variance detected. Strong indicator of cognitive fatigue." 
                : score > 25 
                ? "Moderate tremor detected. Mild fatigue." 
                : "Steady pitch. Vocal chords show minimal fatigue."}
            </p>
            <button 
              onClick={() => setVoiceCheckIn(false)}
              className="mt-4 px-6 py-2 bg-slate-800 text-white rounded-full hover:bg-slate-700"
            >
              Done
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
