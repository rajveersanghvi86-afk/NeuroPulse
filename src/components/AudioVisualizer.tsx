import React from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';

export const AudioVisualizer: React.FC = () => {
  const { isTracking, harshBandEnergy } = useTelemetryStore();

  // Mock data for visualizer if actual FFT is not pumping yet
  const mockData = Array.from({ length: 50 }, (_, i) => ({
    value: isTracking ? (Math.random() * 50 + (i > 20 && i < 30 ? harshBandEnergy || Math.random() * 100 : 0)) : 0
  }));

  return (
    <div className="w-full h-full relative">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={mockData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorFft" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#14B8A6" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorHarsh" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, 255]} />
          <Area 
            type="monotone" 
            dataKey="value" 
            stroke={harshBandEnergy > 100 ? "#F59E0B" : "#14B8A6"} 
            fillOpacity={1} 
            fill={harshBandEnergy > 100 ? "url(#colorHarsh)" : "url(#colorFft)"} 
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="absolute top-2 right-2 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${isTracking ? 'bg-baseline animate-pulse' : 'bg-slate-600'}`} />
        <span className="text-xs text-slate-400 font-mono">
          {isTracking ? `2-4kHz: ${harshBandEnergy.toFixed(0)}` : 'IDLE'}
        </span>
      </div>
    </div>
  );
};
