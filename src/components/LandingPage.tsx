import React from 'react';
import { motion } from 'framer-motion';
import { BrainCircuit, Activity, Eye, AudioWaveform, ArrowRight, ShieldCheck } from 'lucide-react';

import { useT } from '../i18n';
import { LanguageSelect } from './LanguageSelect';

interface Props {
  onLaunch: () => void;
}

export const LandingPage: React.FC<Props> = ({ onLaunch }) => {
  const t = useT();
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

      <div className="absolute top-5 right-5 z-20">
        <LanguageSelect />
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
            {t('l_sub')}
          </p>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onLaunch}
            className="group relative px-10 py-5 bg-gradient-to-r from-baseline to-teal-400 text-slate-900 rounded-full font-bold text-xl transition-all shadow-[0_0_40px_rgba(20,184,166,0.4)] hover:shadow-[0_0_60px_rgba(20,184,166,0.6)] flex items-center gap-3 mx-auto"
          >
            {t('l_open')}
            <ArrowRight className="w-6 h-6 group-hover:translate-x-1.5 transition-transform" />
          </motion.button>
        </motion.div>

        {/* Medical Principles */}
        <motion.div variants={itemVariants} className="w-full mb-20">
          <h2 className="text-xl text-slate-400 mb-8 text-center font-semibold">{t('l_how')}</h2>
          <div className="flex flex-col md:flex-row gap-12 justify-center w-full max-w-5xl mx-auto items-start">
            <div className="flex-1 flex flex-col items-center text-center group">
               <motion.div whileHover={{ y: -5 }} className="mb-6 text-slate-400 group-hover:text-baseline transition-colors duration-500">
                  <Activity className="w-12 h-12 stroke-[1.5]" />
               </motion.div>
               <h3 className="text-xl font-medium text-white mb-4 tracking-wide">{t('l_f1t')}</h3>
               <p className="text-slate-400 font-light leading-relaxed text-sm max-w-xs">
                 {t('l_f1d')}
               </p>
            </div>

            <div className="hidden md:block w-px h-32 bg-gradient-to-b from-transparent via-slate-700 to-transparent opacity-50 mt-4" />

            <div className="flex-1 flex flex-col items-center text-center group">
               <motion.div whileHover={{ y: -5 }} className="mb-6 text-slate-400 group-hover:text-warning transition-colors duration-500">
                  <AudioWaveform className="w-12 h-12 stroke-[1.5]" />
               </motion.div>
               <h3 className="text-xl font-medium text-white mb-4 tracking-wide">{t('l_f2t')}</h3>
               <p className="text-slate-400 font-light leading-relaxed text-sm max-w-xs">
                 {t('l_f2d')}
               </p>
            </div>

            <div className="hidden md:block w-px h-32 bg-gradient-to-b from-transparent via-slate-700 to-transparent opacity-50 mt-4" />

            <div className="flex-1 flex flex-col items-center text-center group">
               <motion.div whileHover={{ y: -5 }} className="mb-6 text-slate-400 group-hover:text-severe transition-colors duration-500">
                  <Eye className="w-12 h-12 stroke-[1.5]" />
               </motion.div>
               <h3 className="text-xl font-medium text-white mb-4 tracking-wide">{t('l_f3t')}</h3>
               <p className="text-slate-400 font-light leading-relaxed text-sm max-w-xs">
                 {t('l_f3d')}
               </p>
            </div>
          </div>
        </motion.div>

        {/* Instructions */}
        <motion.div variants={itemVariants} className="w-full max-w-4xl glass-panel p-10 mb-16 border border-slate-700/50 bg-slate-900/40">
          <h3 className="text-3xl font-bold text-white mb-8 text-center">{t('l_start')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex items-start gap-5">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-baseline/20 text-baseline font-bold text-lg shrink-0 border border-baseline/30">1</span>
              <div>
                <strong className="text-lg text-white block mb-1">{t('l_s1t')}</strong>
                <p className="text-slate-400 text-sm">{t('l_s1d')}</p>
              </div>
            </div>
            <div className="flex items-start gap-5">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-baseline/20 text-baseline font-bold text-lg shrink-0 border border-baseline/30">2</span>
              <div>
                <strong className="text-lg text-white block mb-1">{t('l_s2t')}</strong>
                <p className="text-slate-400 text-sm">{t('l_s2d')}</p>
              </div>
            </div>
            <div className="flex items-start gap-5">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-baseline/20 text-baseline font-bold text-lg shrink-0 border border-baseline/30">3</span>
              <div>
                <strong className="text-lg text-white block mb-1">{t('l_s3t')}</strong>
                <p className="text-slate-400 text-sm">{t('l_s3d')}</p>
              </div>
            </div>
            <div className="flex items-start gap-5">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-baseline/20 text-baseline font-bold text-lg shrink-0 border border-baseline/30">4</span>
              <div>
                <strong className="text-lg text-white block mb-1">{t('l_s4t')}</strong>
                <p className="text-slate-400 text-sm">{t('l_s4d')}</p>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="flex items-center gap-3 px-6 py-3 bg-slate-900/80 rounded-full border border-slate-700/50 text-slate-400">
          <ShieldCheck className="w-5 h-5 text-baseline" />
          <span className="font-medium tracking-wide text-sm">{t('l_badge')}</span>
        </motion.div>

        <motion.div variants={itemVariants} className="mt-16 text-center text-slate-500 text-sm pb-8">
          <p>{t('l_made')}</p>
          <p>&copy; 2026</p>
        </motion.div>

      </motion.div>
    </div>
  );
};
