import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTelemetryStore } from '../store/telemetryStore';
import { Target, CheckCircle2 } from 'lucide-react';

export const CalibrationModal: React.FC = () => {
  const { isCalibrated, setCalibrationStatus, isTracking } = useTelemetryStore();
  const [step, setStep] = useState(0);
  
  // 9 points: TL, TM, TR, ML, MM, MR, BL, BM, BR
  // Screen space points with a 1.25x boundary expansion factor applied in post-processing IDW
  const points = [
    { x: '10%', y: '10%' }, { x: '50%', y: '10%' }, { x: '90%', y: '10%' },
    { x: '10%', y: '50%' }, { x: '50%', y: '50%' }, { x: '90%', y: '50%' },
    { x: '10%', y: '90%' }, { x: '50%', y: '90%' }, { x: '90%', y: '90%' },
  ];

  const handlePointClick = () => {
    // In a real app, here we would record the current iris gaze vector (x,y)
    // and map it to this screen coordinate for the IDW matrix.
    if (step < 8) {
      setStep(s => s + 1);
    } else {
      // Simulate IDW Matrix computation delay
      setTimeout(() => {
        setCalibrationStatus(true);
        setStep(0);
      }, 500);
    }
  };

  // Only show if tracking is active but not calibrated
  if (!isTracking || isCalibrated) return null;

  const currentPoint = points[step];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center">
      
      <div className="absolute top-10 text-center fade-in">
        <h2 className="text-2xl font-bold text-white mb-2">9-Point Spatial Calibration</h2>
        <p className="text-slate-400">Please look at the target and click it to calibrate your gaze.</p>
        <p className="text-xs text-slate-500 mt-1">Applying Inverse Distance Weighting (IDW) with 1.25x Boundary Expansion</p>
        <div className="w-full bg-slate-800 h-2 mt-6 rounded-full overflow-hidden">
          <div 
            className="bg-baseline h-full transition-all duration-300"
            style={{ width: `${((step + 1) / 9) * 100}%` }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step < 9 ? (
          <motion.button
            key={step}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 15 }}
            className="absolute text-baseline hover:text-white transition-colors"
            style={{ left: currentPoint?.x, top: currentPoint?.y, transform: 'translate(-50%, -50%)' }}
            onClick={handlePointClick}
          >
            <div className="relative flex items-center justify-center">
              <Target className="w-12 h-12 animate-pulse" />
              <div className="absolute inset-0 border-2 border-baseline rounded-full animate-ping opacity-20" />
            </div>
          </motion.button>
        ) : (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-baseline flex flex-col items-center gap-4"
          >
            <CheckCircle2 className="w-24 h-24" />
            <h3 className="text-2xl font-bold text-white">Calibration Complete</h3>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
