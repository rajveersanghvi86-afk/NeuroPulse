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
              Neuro<span className="text-baseline">Pulse</span>
            </h1>
          </div>
          <p className="text-2xl text-slate-300 max-w-3xl mx-auto mb-12 font-light leading-relaxed">
            A privacy-first app that helps you measure and reduce fatigue during long hours of video calls and digital work.
          </p>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onLaunch}
            className="group relative px-10 py-5 bg-gradient-to-r from-baseline to-teal-400 text-slate-900 rounded-full font-bold text-xl transition-all shadow-[0_0_40px_rgba(20,184,166,0.4)] hover:shadow-[0_0_60px_rgba(20,184,166,0.6)] flex items-center gap-3 mx-auto"
          >
            Open Dashboard
            <ArrowRight className="w-6 h-6 group-hover:translate-x-1.5 transition-transform" />
          </motion.button>
        </motion.div>

        {/* Medical Principles */}
        <motion.div variants={itemVariants} className="w-full mb-20">
          <h2 className="text-xl text-slate-400 mb-8 text-center font-semibold">How it works</h2>
          <div className="flex flex-col md:flex-row gap-12 justify-center w-full max-w-5xl mx-auto items-start">
            <div className="flex-1 flex flex-col items-center text-center group">
               <motion.div whileHover={{ y: -5 }} className="mb-6 text-slate-400 group-hover:text-baseline transition-colors duration-500">
                  <Activity className="w-12 h-12 stroke-[1.5]" />
               </motion.div>
               <h3 className="text-xl font-medium text-white mb-4 tracking-wide">Reaction Speed</h3>
               <p className="text-slate-400 font-light leading-relaxed text-sm max-w-xs">
                 A one-minute reaction test compares you with your own rested baseline. Reaction time measurably slows as you get tired.
               </p>
            </div>

            <div className="hidden md:block w-px h-32 bg-gradient-to-b from-transparent via-slate-700 to-transparent opacity-50 mt-4" />

            <div className="flex-1 flex flex-col items-center text-center group">
               <motion.div whileHover={{ y: -5 }} className="mb-6 text-slate-400 group-hover:text-warning transition-colors duration-500">
                  <AudioWaveform className="w-12 h-12 stroke-[1.5]" />
               </motion.div>
               <h3 className="text-xl font-medium text-white mb-4 tracking-wide">Audio Stress Monitor</h3>
               <p className="text-slate-400 font-light leading-relaxed text-sm max-w-xs">
                 Measures how much loud, treble-heavy (2-4 kHz) sound you're exposed to, and can soften it for calls you join in the browser.
               </p>
            </div>

            <div className="hidden md:block w-px h-32 bg-gradient-to-b from-transparent via-slate-700 to-transparent opacity-50 mt-4" />

            <div className="flex-1 flex flex-col items-center text-center group">
               <motion.div whileHover={{ y: -5 }} className="mb-6 text-slate-400 group-hover:text-severe transition-colors duration-500">
                  <Eye className="w-12 h-12 stroke-[1.5]" />
               </motion.div>
               <h3 className="text-xl font-medium text-white mb-4 tracking-wide">Blink & Alertness</h3>
               <p className="text-slate-400 font-light leading-relaxed text-sm max-w-xs">
                 Tracks eye closure (PERCLOS), blink length and eyelid droop. These are among the best-studied early signs of drowsiness.
               </p>
            </div>
          </div>
        </motion.div>

        {/* Instructions */}
        <motion.div variants={itemVariants} className="w-full max-w-4xl glass-panel p-10 mb-16 border border-slate-700/50 bg-slate-900/40">
          <h3 className="text-3xl font-bold text-white mb-8 text-center">Getting Started</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex items-start gap-5">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-baseline/20 text-baseline font-bold text-lg shrink-0 border border-baseline/30">1</span>
              <div>
                <strong className="text-lg text-white block mb-1">Grant Permissions</strong>
                <p className="text-slate-400 text-sm">Everything stays on your device. Allow camera and microphone access to begin (or just microphone if you prefer audio-only).</p>
              </div>
            </div>
            <div className="flex items-start gap-5">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-baseline/20 text-baseline font-bold text-lg shrink-0 border border-baseline/30">2</span>
              <div>
                <strong className="text-lg text-white block mb-1">Quick Calibration</strong>
                <p className="text-slate-400 text-sm">Look at and click 9 dots. This learns your normal eye openness, your posture and how your eyes map to the screen.</p>
              </div>
            </div>
            <div className="flex items-start gap-5">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-baseline/20 text-baseline font-bold text-lg shrink-0 border border-baseline/30">3</span>
              <div>
                <strong className="text-lg text-white block mb-1">Join Your Call</strong>
                <p className="text-slate-400 text-sm">Use your microphone, or share a web call's tab (with tab audio) so NeuroPulse can measure and soften harsh audio.</p>
              </div>
            </div>
            <div className="flex items-start gap-5">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-baseline/20 text-baseline font-bold text-lg shrink-0 border border-baseline/30">4</span>
              <div>
                <strong className="text-lg text-white block mb-1">Review & Relax</strong>
                <p className="text-slate-400 text-sm">Take the eye breaks it suggests, run a reaction test now and then, and click "Finish Session" for a summary.</p>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="flex items-center gap-3 px-6 py-3 bg-slate-900/80 rounded-full border border-slate-700/50 text-slate-400">
          <ShieldCheck className="w-5 h-5 text-baseline" />
          <span className="font-medium tracking-wide text-sm">RUNS IN YOUR BROWSER &nbsp;|&nbsp; NOTHING IS UPLOADED</span>
        </motion.div>

        <motion.div variants={itemVariants} className="mt-16 text-center text-slate-500 text-sm pb-8">
          <p>Made by Rajveer Sanghvi.</p>
          <p>&copy; 2026</p>
        </motion.div>

      </motion.div>
    </div>
  );
};
