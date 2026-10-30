import React from 'react';
import { motion } from 'framer-motion';
import { mfiLevel } from '../lib/mfiCalculator';

interface MFIGaugeProps {
  value: number | null; // 0 to 100, null while warming up
  confidence: number; // 0 to 1
}

const COLORS = { unknown: '#64748B', nominal: '#14B8A6', elevated: '#F59E0B', severe: '#F43F5E' };
const LABELS = { unknown: 'Warming up', nominal: 'Low', elevated: 'Elevated', severe: 'High' };

export const MFIGauge: React.FC<MFIGaugeProps> = ({ value, confidence }) => {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const v = value ?? 0;
  const strokeDashoffset = arcLength - (v / 100) * arcLength;
  const level = mfiLevel(value);
  const color = COLORS[level];
  const confLabel = confidence >= 0.7 ? 'High' : confidence >= 0.4 ? 'Medium' : 'Low';

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex items-center justify-center">
        <svg className="w-48 h-48 transform rotate-[135deg]">
          <circle cx="96" cy="96" r={radius} fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="12"
            strokeDasharray={`${arcLength} ${circumference}`} strokeLinecap="round" />
          <motion.circle
            cx="96" cy="96" r={radius} fill="none" stroke={color} strokeWidth="12"
            strokeDasharray={`${arcLength} ${circumference}`} strokeLinecap="round"
            initial={{ strokeDashoffset: arcLength }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{ filter: `drop-shadow(0 0 10px ${color}80)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-4xl font-bold text-white tracking-tighter">
            {value === null ? '--' : value.toFixed(0)}
            {value !== null && <span className="text-xl text-slate-400">%</span>}
          </span>
          <span className="text-xs uppercase font-semibold mt-1" style={{ color }}>{LABELS[level]}</span>
        </div>
      </div>
      {value !== null && (
        <span className="text-xs text-slate-500 -mt-4">Confidence: {confLabel}</span>
      )}
    </div>
  );
};
