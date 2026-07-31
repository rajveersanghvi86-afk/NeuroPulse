import React, { useRef, useEffect } from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, FileJson, Table, X, Info } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export const SessionReportModal: React.FC = () => {
  const { isSessionReportOpen, setSessionReportOpen, sessionData, sessionGazePoints, resetSessionData } = useTelemetryStore();
  const reportRef = useRef<HTMLDivElement>(null);
  const heatmapRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (isSessionReportOpen && heatmapRef.current) {
      const ctx = heatmapRef.current.getContext('2d');
      if (ctx) {
        const w = ctx.canvas.width;
        const h = ctx.canvas.height;
        
        ctx.clearRect(0, 0, w, h);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i < w; i += 40) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
        }
        for (let j = 0; j < h; j += 40) {
          ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke();
        }

        if (sessionGazePoints.length === 0) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.font = '14px monospace';
          ctx.textAlign = 'center';
          ctx.fillText("Insufficient gaze data collected during session.", w / 2, h / 2);
        } else {
          // Plot Real Gaze Data Density
          for (let i = 0; i < sessionGazePoints.length; i++) {
            const point = sessionGazePoints[i];
            const x = point.x * w;
            const y = point.y * h;
            
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, 15);
            gradient.addColorStop(0, 'rgba(20, 184, 166, 0.15)'); // baseline color
            gradient.addColorStop(1, 'rgba(20, 184, 166, 0)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, 15, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      }
    }
  }, [isSessionReportOpen, sessionGazePoints]);

  if (!isSessionReportOpen) return null;

  const handleClose = () => {
    resetSessionData();
    setSessionReportOpen(false);
  };

  const exportPDF = async () => {
    if (reportRef.current) {
      const canvas = await html2canvas(reportRef.current, { backgroundColor: '#0B0F19', scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('NeuroPulse_Session_Report.pdf');
    }
  };

  const exportJSON = () => {
    const combinedData = {
      telemetry: sessionData,
      gaze: sessionGazePoints
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(combinedData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "NeuroPulse_Telemetry.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const exportCSV = () => {
    const headers = "Time,MFI,EAR,Latency,AcousticEnergy\n";
    const csvContent = sessionData.map(d => `${d.time},${d.mfi},${d.ear},${d.latency},${d.harshEnergy}`).join("\n");
    const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(headers + csvContent);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "NeuroPulse_Telemetry.csv");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const avgMFI = sessionData.length > 0 ? (sessionData.reduce((acc, d) => acc + d.mfi, 0) / sessionData.length) : 0;
  
  let statusColor = 'bg-baseline/20 border-baseline text-baseline';
  let statusText = 'SAFETY: PASS';
  let laymansRecommendation = "🟢 Your brain is alert! Perfect time for focused work.";
  
  if (avgMFI > 65) {
    statusColor = 'bg-severe/20 border-severe text-severe';
    statusText = 'SAFETY: FAIL (High Strain)';
    laymansRecommendation = "🔴 High brain fog & acoustic stress. Step away from the computer immediately to avoid burnout.";
  } else if (avgMFI > 30) {
    statusColor = 'bg-warning/20 border-warning text-warning';
    statusText = 'SAFETY: WARNING (Mild Strain)';
    laymansRecommendation = "🟡 Mild fatigue starting. Take a 5-minute screen break or rest your eyes.";
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md overflow-y-auto py-10 flex flex-col items-center">
      
      <div className="w-full max-w-4xl flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-white">Session Analytics</h2>
        <button onClick={handleClose} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 text-slate-300">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-3 gap-4 mb-8">
        <button onClick={exportPDF} className="flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl shadow-glass border border-white/10 transition-colors">
          <Download className="w-5 h-5" /> Export PDF Report
        </button>
        <button onClick={exportJSON} className="flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl shadow-glass border border-white/10 transition-colors">
          <FileJson className="w-5 h-5" /> Export JSON Time-Series
        </button>
        <button onClick={exportCSV} className="flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl shadow-glass border border-white/10 transition-colors">
          <Table className="w-5 h-5" /> Export CSV Table
        </button>
      </div>

      {/* PDF Export Target Area */}
      <div ref={reportRef} className="w-full max-w-4xl glass-panel p-8 flex flex-col gap-8 bg-[#0B0F19]">
        
        <div className="flex justify-between items-start border-b border-white/10 pb-6">
          <div>
            <h3 className="text-2xl font-bold text-white mb-1">NeuroPulse Health & Safety Certificate</h3>
            <p className="text-slate-400 text-sm">Session Duration: {sessionData.length} telemetry points, {sessionGazePoints.length} gaze points.</p>
          </div>
          <div className={`px-4 py-2 rounded-lg font-bold border ${statusColor}`}>
            {statusText}
          </div>
        </div>

        <div className={`p-4 rounded-xl border ${statusColor.replace('text-', '').split(' ')[0]} bg-opacity-10 flex items-start gap-4`}>
          <Info className={`w-6 h-6 mt-1 ${statusColor.split(' ')[2]}`} />
          <div>
            <h4 className="font-bold text-white mb-1">Actionable Health Recommendation</h4>
            <p className="text-slate-300">{laymansRecommendation}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8">
          <div>
            <h4 className="text-sm uppercase tracking-wider text-slate-400 mb-4">Mean MFI Profile</h4>
            <div className="text-6xl font-bold text-white mb-2">{avgMFI.toFixed(1)}%</div>
            <p className="text-slate-500 text-sm">Average Multimodal Fatigue Index over the entire session.</p>
          </div>
          <div>
            <h4 className="text-sm uppercase tracking-wider text-slate-400 mb-4">Gaze Heatmap (Live Tracking Data)</h4>
            <div className="w-full aspect-video bg-slate-900 rounded-lg overflow-hidden border border-white/5 relative">
              <canvas ref={heatmapRef} width={400} height={225} className="w-full h-full" />
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-sm uppercase tracking-wider text-slate-400 mb-4">Telemetry Timeline</h4>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sessionData} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                <XAxis dataKey="time" hide />
                <YAxis hide domain={[0, 100]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px' }}
                  labelStyle={{ display: 'none' }}
                />
                <Line type="monotone" dataKey="mfi" stroke="#14B8A6" strokeWidth={3} dot={false} name="MFI %" />
                <Line type="monotone" dataKey="harshEnergy" stroke="#F59E0B" strokeWidth={1} dot={false} opacity={0.5} name="Acoustic Energy" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6">
          <h4 className="text-sm uppercase tracking-wider text-slate-400 mb-4">Plain English Health Breakdown</h4>
          <div className="grid grid-cols-2 gap-6 text-sm text-slate-300">
            <div>
              <strong className="text-white block mb-1">Multimodal Fatigue Index (MFI)</strong>
              Think of this as your brain's battery meter. 0% means fully recharged, while 100% means extreme mental exhaustion.
            </div>
            <div>
              <strong className="text-white block mb-1">Saccadic Latency</strong>
              This measures how fast your brain reacts. When you are tired, your eyes take a split second longer to move, showing brain fog.
            </div>
            <div>
              <strong className="text-white block mb-1">Micro-Rest Interventions</strong>
              Triggered: <strong>{useTelemetryStore.getState().restBreakEvents.length} times</strong>.
              {avgMFI > 50 && useTelemetryStore.getState().restBreakEvents.length === 0 ? (
                <span className="text-warning block mt-1">⚠️ High fatigue sustained without taking recommended rest breaks.</span>
              ) : (
                <span className="block mt-1">Automatic 20-20-20 breaks help reset the visual and cognitive strain.</span>
              )}
            </div>
            <div>
              <strong className="text-white block mb-1">Acoustic Strain</strong>
              This measures harsh, grating audio from online calls that silently stresses your nervous system without you noticing.
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
