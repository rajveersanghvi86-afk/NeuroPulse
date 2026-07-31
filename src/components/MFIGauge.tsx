import React from 'react';
import { motion } from 'framer-motion';

interface MFIGaugeProps {
  value: number; // 0 to 100
}

export const MFIGauge: React.FC<MFIGaugeProps> = ({ value }) => {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  // Map value to stroke dashoffset (0 to half circle = 100 to 0)
  // Let's make it a 3/4 circle for aesthetic
  const arcLength = circumference * 0.75;
  const strokeDashoffset = arcLength - (value / 100) * arcLength;

  let color = '#14B8A6'; // baseline
  if (value > 50) color = '#F59E0B'; // warning
  if (value > 80) color = '#F43F5E'; // severe

  return (
    <div className="relative flex items-center justify-center">
      <svg className="w-48 h-48 transform -rotate-[135deg]">
        {/* Background Track */}
        <circle
          cx="96"
          cy="96"
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.05)"
          strokeWidth="12"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
        />
        {/* Value Track */}
        <motion.circle
          cx="96"
          cy="96"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
          initial={{ strokeDashoffset: arcLength }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 10px ${color}80)` }}
        />
      </svg>
      
      {/* Center Value */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-4xl font-bold text-white tracking-tighter" style={{ textShadow: `0 0 20px ${color}40` }}>
          {value.toFixed(0)}<span className="text-xl text-slate-400">%</span>
        </span>
        <span className="text-xs uppercase font-semibold mt-1" style={{ color }}>
          {value < 50 ? 'Nominal' : value < 80 ? 'Elevated' : 'Severe'}
        </span>
      </div>
    </div>
  );
};
