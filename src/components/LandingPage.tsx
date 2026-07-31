import React from 'react';
import { motion } from 'framer-motion';
import { BrainCircuit, Activity, Eye, AudioWaveform, ArrowRight, ShieldCheck } from 'lucide-react';

interface Props {
  onLaunch: () => void;
}

export const LandingPage: React.FC<Props> = ({ onLaunch }) => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
  };

  return (
    <div className="min-h-screen bg-[#060913] text-slate-200 flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      
      {/* Dynamic Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Deep grid background */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHBhdGggZD0iTTAgMGg0MHY0MEgwem0zOSAzOVYwaC0xdjM5SDB2MXozOSAzOXYxaC0xdi0xeiIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjAyKSIvPjwvc3ZnPg==')] opacity-30" />
        
        {/* Animated Orbs */}
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-baseline/15 rounded-full blur-[140px]" 
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute bottom-[-20%] right-[-10%] w-[40vw] h-[40vw] bg-warning/10 rounded-full blur-[120px]" 
        />
      </div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-6xl z-10 flex flex-col items-center py-12"
      >
        
        {/* Hero Section */}
        <motion.div variants={itemVariants} className="text-center mb-20 w-full">
          <div className="flex items-center justify-center gap-4 mb-8">
            <div className="p-4 bg-slate-900/50 rounded-2xl border border-white/5 shadow-glass backdrop-blur-md">
              <BrainCircuit className="w-16 h-16 text-baseline" />
            </div>
            <h1 className="text-7xl font-extrabold tracking-tight text-white drop-shadow-lg">
              Neuro<span className="text-transparent bg-clip-text bg-gradient-to-r from-baseline to-teal-300">Pulse</span>
            </h1>
          </div>
          <p className="text-2xl text-slate-300 max-w-3xl mx-auto mb-12 font-light leading-relaxed">
            A privacy-first diagnostic platform that measures, predicts, and actively mitigates cognitive fatigue and acoustic strain in digital workers.
          </p>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onLaunch}
            className="group relative px-10 py-5 bg-gradient-to-r from-baseline to-teal-400 text-slate-900 rounded-full font-bold text-xl transition-all shadow-[0_0_40px_rgba(20,184,166,0.4)] hover:shadow-[0_0_60px_rgba(20,184,166,0.6)] flex items-center gap-3 mx-auto"
          >
            Launch Diagnostic Engine
            <ArrowRight className="w-6 h-6 group-hover:translate-x-1.5 transition-transform" />
          </motion.button>
        </motion.div>

        {/* Medical Principles */}
        <motion.div variants={itemVariants} className="w-full mb-20">
          <h2 className="text-sm uppercase tracking-[0.2em] text-slate-500 mb-8 text-center font-bold">Biometric Core Principles</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
            <div className="glass-panel p-8 border-t-4 border-t-baseline hover:bg-slate-800/60 transition-colors group">
              <Activity className="w-10 h-10 text-baseline mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="text-2xl font-bold text-white mb-3">Saccadic Latency</h3>
              <p className="text-slate-400 leading-relaxed">
                Tracks the speed of your eye movements. As neurological fatigue increases, brainstem delays cause your eyes to take a split second longer to react.
              </p>
            </div>
            <div className="glass-panel p-8 border-t-4 border-t-warning hover:bg-slate-800/60 transition-colors group">
              <AudioWaveform className="w-10 h-10 text-warning mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="text-2xl font-bold text-white mb-3">Acoustic Strain</h3>
              <p className="text-slate-400 leading-relaxed">
                Monitors the harsh 2kHz-4kHz frequency bands common in compressed VoIP audio (Zoom/Teams), which silently spikes cortisol and nervous system stress.
              </p>
            </div>
            <div className="glass-panel p-8 border-t-4 border-t-severe hover:bg-slate-800/60 transition-colors group">
              <Eye className="w-10 h-10 text-severe mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="text-2xl font-bold text-white mb-3">PERCLOS Risk</h3>
              <p className="text-slate-400 leading-relaxed">
                Measures the percentage of eyelid closure over time to detect early warning signs of micro-sleeps and severe cognitive burnout.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Instructions */}
        <motion.div variants={itemVariants} className="w-full max-w-4xl glass-panel p-10 mb-16 border border-slate-700/50 bg-slate-900/40">
          <h3 className="text-3xl font-bold text-white mb-8 text-center">Standard Operating Procedure</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex items-start gap-5">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-baseline/20 text-baseline font-bold text-lg shrink-0 border border-baseline/30">1</span>
              <div>
                <strong className="text-lg text-white block mb-1">Grant Device Access</strong>
                <p className="text-slate-400 text-sm">All processing happens strictly in your browser's local RAM. Allow camera and microphone access to begin.</p>
              </div>
            </div>
            <div className="flex items-start gap-5">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-baseline/20 text-baseline font-bold text-lg shrink-0 border border-baseline/30">2</span>
              <div>
                <strong className="text-lg text-white block mb-1">Spatial Calibration</strong>
                <p className="text-slate-400 text-sm">Complete the 9-point visual calibration. Maintain your head posture aligned with the Cyan Calibration Anchor.</p>
              </div>
            </div>
            <div className="flex items-start gap-5">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-baseline/20 text-baseline font-bold text-lg shrink-0 border border-baseline/30">3</span>
              <div>
                <strong className="text-lg text-white block mb-1">Call Assistance Mode</strong>
                <p className="text-slate-400 text-sm">When joining a meeting, select your audio source and toggle "Call Assist Mode" to filter out fatigue-inducing frequencies.</p>
              </div>
            </div>
            <div className="flex items-start gap-5">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-baseline/20 text-baseline font-bold text-lg shrink-0 border border-baseline/30">4</span>
              <div>
                <strong className="text-lg text-white block mb-1">Session Diagnostics</strong>
                <p className="text-slate-400 text-sm">Click "Finish Session" when done to export your medical-grade telemetry PDF and gaze heatmap.</p>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="flex items-center gap-3 px-6 py-3 bg-slate-900/80 rounded-full border border-slate-700/50 text-slate-400">
          <ShieldCheck className="w-5 h-5 text-baseline" />
          <span className="font-medium tracking-wide text-sm">100% LOCAL EXECUTION &nbsp;|&nbsp; ZERO CLOUD TELEMETRY</span>
        </motion.div>

      </motion.div>
    </div>
  );
};
