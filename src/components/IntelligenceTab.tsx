import React, { useState, useEffect } from 'react';
import { Brain, FileText, Cpu, Zap, Search, RefreshCw, Database, ShieldCheck } from 'lucide-react';
import { Card, Button } from './UI';
import { motion } from 'framer-motion';

interface IntelItem {
  name: string;
  size: number;
  updatedAt: string;
  type: string;
  content: string;
}

export const IntelligenceTab: React.FC = () => {
  const [intel, setIntel] = useState<IntelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModel, setActiveModel] = useState('Gemini 3.1 Pro');

  const fetchIntel = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/intel');
      if (res.ok) {
        const data = await res.json();
        setIntel(data.items);
      }
    } catch (error) {
      console.error('Failed to fetch intelligence data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntel();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-cyan-400" />
            Neural Knowledge Base
          </h2>
          <p className="text-slate-400 text-sm">Manage uploaded skills and augmented intelligence models.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="secondary" 
            onClick={fetchIntel}
            className="flex items-center gap-2 px-4 py-2 text-xs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Sync Knowledge
          </Button>
          <Button variant="primary" className="flex items-center gap-2 px-4 py-2 text-xs">
            <Zap className="w-4 h-4" />
            Deploy Skills
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Model Status */}
        <Card className="lg:col-span-1 p-6 border-cyan-500/30 bg-cyan-950/10">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Cpu className="w-5 h-5 text-cyan-400" />
              Active Core
            </h3>
            <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 text-[10px] rounded border border-cyan-500/30 animate-pulse">
              ONLINE
            </span>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-slate-900/50 rounded border border-slate-800">
              <label className="text-[10px] text-slate-500 uppercase tracking-widest">Primary Model</label>
              <div className="text-xl font-mono text-cyan-100">{activeModel}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-slate-900/50 rounded border border-slate-800">
                <label className="text-[10px] text-slate-500 uppercase tracking-widest">Diversity Index</label>
                <div className="text-lg font-mono text-emerald-400">0.98</div>
              </div>
              <div className="p-3 bg-slate-900/50 rounded border border-slate-800">
                <label className="text-[10px] text-slate-500 uppercase tracking-widest">Latency</label>
                <div className="text-lg font-mono text-cyan-400">12ms</div>
              </div>
            </div>

            <div className="pt-4">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-slate-400">Context Window Utilization</span>
                <span className="text-cyan-400">12%</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500 w-[12%]" />
              </div>
            </div>
          </div>
        </Card>

        {/* Knowledge Base Items */}
        <Card className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Database className="w-5 h-5 text-cyan-400" />
              Knowledge Repository
            </h3>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search skills..." 
                className="pl-9 pr-4 py-1.5 bg-slate-900 border border-slate-800 rounded text-sm focus:border-cyan-500/50 outline-none transition-all w-48"
              />
            </div>
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <RefreshCw className="w-8 h-8 animate-spin mb-2" />
                <p>Scanning neural pathways...</p>
              </div>
            ) : intel.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500 border-2 border-dashed border-slate-800 rounded-lg">
                <FileText className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-sm">No knowledge files detected.</p>
                <p className="text-xs mt-1">Upload files to the /knowledge directory to begin.</p>
              </div>
            ) : (
              intel.map((item, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  key={item.name}
                  className="group p-4 bg-slate-900/30 hover:bg-slate-900/60 border border-slate-800 hover:border-cyan-500/30 rounded-lg transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-slate-800 rounded group-hover:bg-cyan-500/10 transition-colors">
                        <FileText className="w-5 h-5 text-slate-400 group-hover:text-cyan-400" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-200">{item.name}</div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2">
                          <span>{(item.size / 1024).toFixed(1)} KB</span>
                          <span>•</span>
                          <span>{item.type.toUpperCase()}</span>
                          <span>•</span>
                          <span>{new Date(item.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="secondary" className="h-8 px-2 py-1">
                        <Zap className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Integration Status */}
      <Card className="p-4 bg-emerald-500/5 border-emerald-500/20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 rounded-full">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-emerald-400">System Integrated</h4>
            <p className="text-xs text-slate-400">The knowledge base is automatically injected into the terminal's reasoning engine.</p>
          </div>
        </div>
      </Card>
    </div>
  );
};
