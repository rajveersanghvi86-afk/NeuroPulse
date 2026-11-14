import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTelemetryStore } from '../store/telemetryStore';
import { CheckCircle } from 'lucide-react';
import { useT } from '../i18n';

export const MicroRestModal: React.FC = () => {
  const show = useTelemetryStore((s) => s.showMicroRestModal);
  const reason = useTelemetryStore((s) => s.microRestReason);
  const closeMicroRest = useTelemetryStore((s) => s.closeMicroRest);
  const t = useT();
  const [timeLeft, setTimeLeft] = useState(20);

  useEffect(() => {
    if (!show) return;
    setTimeLeft(20);
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [show]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-12 fade-in max-w-xl">
        <h2 className="text-4xl font-bold text-white mb-4">{t('r_title')}</h2>
        <p className="text-sm text-slate-400 mb-3">
          {t(reason === 'fatigue' ? 'r_fatigue' : 'r_timer')}
        </p>
        <p className="text-xl text-baseline font-semibold">{t('r_look')}</p>
        <p className="text-sm text-slate-400 mt-2">{t('r_breathe')}</p>
      </div>

      <div className="relative flex items-center justify-center w-64 h-64 mb-12">
        <AnimatePresence>
          {timeLeft > 0 ? (
            <>
              <motion.div
                initial={{ scale: 0.5, opacity: 0.2 }}
                animate={{ scale: [0.5, 1.2, 0.5], opacity: [0.2, 0.8, 0.2] }}
                transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-0 rounded-full bg-baseline/30 blur-xl"
              />
              <motion.div
                initial={{ scale: 0.5 }}
                animate={{ scale: [0.5, 1, 0.5] }}
                transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-4 rounded-full border border-baseline/50"
              />
              <div className="z-10 text-6xl font-bold text-white font-mono drop-shadow-md">{timeLeft}s</div>
            </>
          ) : (
            <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-4 text-baseline">
              <CheckCircle className="w-24 h-24" />
              <p className="text-2xl font-bold text-white">{t('r_done')}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        onClick={closeMicroRest}
        className={`px-8 py-3 rounded-full font-bold transition-all ${
          timeLeft === 0 ? 'bg-baseline text-slate-900 hover:bg-baseline/80' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
        }`}
      >
        {timeLeft === 0 ? t('r_back') : t('skip')}
      </button>
    </div>
  );
};
