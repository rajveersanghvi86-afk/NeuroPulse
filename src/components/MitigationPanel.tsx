import React from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { Monitor, Moon, MessageSquare, Headphones } from 'lucide-react';
import { acousticEngine } from '../lib/acousticEngine';

export const MitigationPanel: React.FC = () => {
  const { mfi, isCallAssistActive, setCallAssistActive } = useTelemetryStore();

  const isWarning = mfi > 60;
  const isSevere = mfi > 75;

  const handleToggleCallAssist = () => {
    const newState = !isCallAssistActive;
    setCallAssistActive(newState);
    acousticEngine.toggleCallAssist(newState);
  };

  return (
    <div className="flex flex-col gap-4">
      
      {/* Phase 3: Call Assist Toggle */}
      <div className={`p-4 rounded-xl border transition-colors cursor-pointer hover:bg-slate-700/50 ${isCallAssistActive ? 'bg-baseline/20 border-baseline text-white' : 'bg-slate-800/30 border-white/5'}`}
           onClick={handleToggleCallAssist}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Headphones className={`w-5 h-5 ${isCallAssistActive ? 'text-baseline' : 'text-slate-400'}`} />
            <h4 className="font-semibold text-sm">🎧 Call Assist Mode</h4>
          </div>
          <div className={`w-10 h-5 rounded-full p-1 transition-colors ${isCallAssistActive ? 'bg-baseline' : 'bg-slate-600'}`}>
            <div className={`w-3 h-3 bg-white rounded-full transition-transform ${isCallAssistActive ? 'translate-x-5' : ''}`} />
          </div>
        </div>
        <p className="text-xs text-slate-400">
          {isCallAssistActive ? 'Aggressive smoothing active. Clipping VoIP harshness.' : 'Toggle ON during Zoom/Teams calls to reduce acoustic strain.'}
        </p>
      </div>

      {/* OS Contrast / Warmth */}
      <div className={`p-4 rounded-xl border transition-colors ${isWarning ? (isSevere ? 'bg-severe/10 border-severe/30' : 'bg-warning/10 border-warning/30') : 'bg-slate-800/30 border-white/5'}`}>
        <div className="flex items-center gap-3 mb-2">
          <Monitor className={`w-5 h-5 ${isWarning ? (isSevere ? 'text-severe' : 'text-warning') : 'text-slate-400'}`} />
          <h4 className="font-semibold text-sm text-slate-200">Display Profile</h4>
        </div>
        <p className="text-xs text-slate-400">
          {isWarning ? 'Warm shift & contrast reduction active.' : 'Standard contrast profile.'}
        </p>
      </div>

      {/* IDE Theme */}
      <div className={`p-4 rounded-xl border transition-colors ${isSevere ? 'bg-severe/10 border-severe/30' : 'bg-slate-800/30 border-white/5'}`}>
        <div className="flex items-center gap-3 mb-2">
          <Moon className={`w-5 h-5 ${isSevere ? 'text-severe' : 'text-slate-400'}`} />
          <h4 className="font-semibold text-sm text-slate-200">IDE Syntax Theme</h4>
        </div>
        <p className="text-xs text-slate-400">
          {isSevere ? 'Simplified monochrome syntax active.' : 'Full syntax highlighting enabled.'}
        </p>
      </div>

      {/* Status Sync */}
      <div className={`p-4 rounded-xl border transition-colors ${isSevere ? 'bg-severe/10 border-severe/30' : 'bg-slate-800/30 border-white/5'}`}>
        <div className="flex items-center gap-3 mb-2">
          <MessageSquare className={`w-5 h-5 ${isSevere ? 'text-severe' : 'text-slate-400'}`} />
          <h4 className="font-semibold text-sm text-slate-200">Status Sync (Slack/Teams)</h4>
        </div>
        <p className="text-xs text-slate-400">
          {isSevere ? '"Deep Work / Low Bandwidth" auto-set.' : 'Available.'}
        </p>
      </div>

    </div>
  );
};
