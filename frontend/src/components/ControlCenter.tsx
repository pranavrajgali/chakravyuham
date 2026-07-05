import React, { useState, useEffect, useRef } from 'react';
import { AnomalyType, RuleConfig } from '../types';
import { calculateShannonEntropy } from '../utils';
import { CarModel } from '../data/carModels';
import { parseCANFile, ParsedCANFrame } from '../utils/datasetParser';
import { SAMPLE_DATASETS } from '../data/sampleDatasets';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Cpu,
  Flame,
  Info,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sliders,
  Sparkles,
  Zap,
  Shield,
  ShieldCheck,
  Database,
  Lock,
  Unlock,
  Network,
  Server,
  Upload,
  SkipForward,
  Trash2,
  FileText
} from 'lucide-react';

interface ControlCenterProps {
  currentMode: AnomalyType;
  onChangeMode: (mode: AnomalyType) => void;
  isPaused: boolean;
  onTogglePause: () => void;
  packetSpeedMultiplier: number;
  onChangeSpeed: (speed: number) => void;
  rules: RuleConfig[];
  onToggleRule: (id: string) => void;
  onChangeRuleThreshold: (id: string, threshold: number) => void;
  onInjectCustomFrame: (frameData: { id: string; dlc: number; bytes: string[]; source: string; destination: string }) => void;
  selectedCarModel: CarModel;
  
  // Dataset Playback Props
  datasetFrames?: ParsedCANFrame[];
  currentFrameIndex?: number;
  isDatasetPlaying?: boolean;
  datasetPlaybackMode?: 'uniform' | 'realtime';
  uniformDelay?: number;
  realtimeSpeed?: number;
  muteSimulation?: boolean;
  datasetFileName?: string;
  onSetDatasetFrames?: (frames: ParsedCANFrame[]) => void;
  onSetCurrentFrameIndex?: (index: number) => void;
  onSetIsDatasetPlaying?: (playing: boolean) => void;
  onSetDatasetPlaybackMode?: (mode: 'uniform' | 'realtime') => void;
  onSetUniformDelay?: (delay: number) => void;
  onSetRealtimeSpeed?: (speed: number) => void;
  onSetMuteSimulation?: (mute: boolean) => void;
  onSetDatasetFileName?: (name: string) => void;
  onAddAlert?: (alert: any) => void;
  onInjectSingleFrame?: (frame: ParsedCANFrame) => void;
}

export default function ControlCenter({
  currentMode,
  onChangeMode,
  isPaused,
  onTogglePause,
  packetSpeedMultiplier,
  onChangeSpeed,
  rules,
  onToggleRule,
  onChangeRuleThreshold,
  onInjectCustomFrame,
  selectedCarModel,
  
  // Dataset playback props
  datasetFrames = [],
  currentFrameIndex = 0,
  isDatasetPlaying = false,
  datasetPlaybackMode = 'uniform',
  uniformDelay = 150,
  realtimeSpeed = 1.0,
  muteSimulation = false,
  datasetFileName = '',
  onSetDatasetFrames,
  onSetCurrentFrameIndex,
  onSetIsDatasetPlaying,
  onSetDatasetPlaybackMode,
  onSetUniformDelay,
  onSetRealtimeSpeed,
  onSetMuteSimulation,
  onSetDatasetFileName,
  onAddAlert,
  onInjectSingleFrame,
}: ControlCenterProps) {
  // Sandbox states
  const [injId, setInjId] = useState('0x1F2');
  const [injDlc, setInjDlc] = useState(8);
  const [injBytesInput, setInjBytesInput] = useState('FF AA 00 11 22 33 44 55');
  const [injSource, setInjSource] = useState('Diagnostic Tool');
  const [injDest, setInjDest] = useState('Brake ECU');
  const [sandboxTab, setSandboxTab] = useState<'triggers' | 'injector' | 'rules' | 'dataset'>('triggers');
  const [showTheory, setShowTheory] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const parsed = parseCANFile(text, file.name);
        if (parsed.length > 0) {
          onSetDatasetFrames?.(parsed);
          onSetDatasetFileName?.(file.name);
          onSetCurrentFrameIndex?.(0);
          onAddAlert?.({
            id: Math.random().toString(),
            timestamp: Date.now(),
            message: `Dataset [${file.name}] loaded successfully. Parsed ${parsed.length} CAN frames.`,
            type: 'success',
            source: 'Uploader Core',
            arbId: 'N/A'
          });
        } else {
          alert('Could not parse any valid CAN frames from this file. Ensure it contains timestamp, ID, DLC, or hexadecimal payloads.');
        }
      };
      reader.readAsText(file);
    }
  };

  // Synchronize Source/Dest select dropdowns when the vehicle model changes
  useEffect(() => {
    if (selectedCarModel && selectedCarModel.nodes && selectedCarModel.nodes.length >= 2) {
      setInjSource(selectedCarModel.nodes[0].label);
      setInjDest(selectedCarModel.nodes[1].label);
    }
  }, [selectedCarModel]);

  // Computed custom payload entropy
  const getBytesArray = () => {
    return injBytesInput
      .toUpperCase()
      .trim()
      .split(/\s+/)
      .filter((b) => b.match(/^[0-9A-F]{2}$/));
  };
  const computedEntropy = calculateShannonEntropy(getBytesArray());

  const handleInjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Format ID to start with 0x
    let finalId = injId.trim();
    if (!finalId.startsWith('0x') && !finalId.startsWith('0X')) {
      finalId = '0x' + finalId;
    }

    // Pad or slice bytes to match DLC
    const rawBytes = getBytesArray();
    const finalBytes: string[] = [];
    for (let i = 0; i < injDlc; i++) {
      finalBytes.push(rawBytes[i] || '00');
    }

    onInjectCustomFrame({
      id: finalId,
      dlc: injDlc,
      bytes: finalBytes,
      source: injSource || 'Injector Sandbox',
      destination: injDest || 'Broadcast',
    });
  };

  const fillRandomBytes = () => {
    const list: string[] = [];
    for (let i = 0; i < injDlc; i++) {
      list.push(Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase());
    }
    setInjBytesInput(list.join(' '));
  };

  const fillLowEntropyBytes = () => {
    const list: string[] = Array(injDlc).fill('00');
    if (injDlc > 0) list[0] = '05';
    setInjBytesInput(list.join(' '));
  };

  return (
    <div className="bg-bento-card border border-slate-200 rounded-xl flex flex-col overflow-hidden h-full shadow-sm">
      {/* Control Tabs Header */}
      <div className="flex border-b border-slate-200 bg-slate-50 p-1 text-xs select-none overflow-x-auto scrollbar-none flex-nowrap w-full">
        <button
          onClick={() => setSandboxTab('triggers')}
          className={`flex-1 py-3 sm:py-2 text-center rounded-lg transition-all duration-200 font-medium flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 focus:outline-none focus:ring-1 focus:ring-slate-300/50 cursor-pointer ${
            sandboxTab === 'triggers'
              ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-sm border border-slate-200/55 dark:border-slate-700'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50'
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          TRIGGERS
        </button>
        <button
          onClick={() => setSandboxTab('injector')}
          className={`flex-1 py-3 sm:py-2 text-center rounded-lg transition-all duration-200 font-medium flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 focus:outline-none focus:ring-1 focus:ring-slate-300/50 cursor-pointer ${
            sandboxTab === 'injector'
              ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-sm border border-slate-200/55 dark:border-slate-700'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50'
          }`}
        >
          <Cpu className="h-3.5 w-3.5" />
          SANDBOX
        </button>
        <button
          onClick={() => setSandboxTab('rules')}
          className={`flex-1 py-3 sm:py-2 text-center rounded-lg transition-all duration-200 font-medium flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 focus:outline-none focus:ring-1 focus:ring-slate-300/50 cursor-pointer ${
            sandboxTab === 'rules'
              ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-sm border border-slate-200/55 dark:border-slate-700'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50'
          }`}
        >
          <Sliders className="h-3.5 w-3.5" />
          RULES
        </button>
        <button
          onClick={() => setSandboxTab('dataset')}
          className={`flex-1 py-3 sm:py-2 text-center rounded-lg transition-all duration-200 font-medium flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 focus:outline-none focus:ring-1 focus:ring-slate-300/50 cursor-pointer ${
            sandboxTab === 'dataset'
              ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-sm border border-slate-200/55 dark:border-slate-700'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50'
          }`}
        >
          <Database className="h-3.5 w-3.5" />
          DATASET
        </button>
      </div>

      <div className="p-4 flex-1 flex flex-col overflow-y-auto custom-scrollbar">
        {/* TAB 1: ATTACK TRIGGERS */}
        {sandboxTab === 'triggers' && (
          <div className="space-y-4 flex-1 flex flex-col">
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Sliders className="h-3 w-3 text-emerald-600" /> State Controller
              </h3>
              <p className="text-xs text-slate-450 mb-3 leading-relaxed">
                Toggle network state presets to observe how the Protocol-Agnostic IDS handles safe stasis versus live attacks.
              </p>

              {/* Mode Triggers list */}
              <div className="space-y-2 select-none">
                {/* Normal button */}
                <button
                  onClick={() => onChangeMode('NORMAL')}
                  className={`w-full p-3.5 text-left rounded-xl border transition-all duration-200 flex justify-between items-center min-h-[50px] focus:outline-none focus:ring-2 focus:ring-emerald-500/15 cursor-pointer ${
                    currentMode === 'NORMAL'
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-400 font-semibold'
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold font-display tracking-wide flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      1. NORMAL TRAFFIC (STASIS)
                    </p>
                    <p className="text-[10px] opacity-75 mt-0.5 font-normal font-sans">
                      Regular ECU stubs emitting telemetry (low entropy, ~250 Hz)
                    </p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded">SECURE</span>
                </button>

                {/* DoS button */}
                <button
                  onClick={() => onChangeMode('DOS')}
                  className={`w-full p-3.5 text-left rounded-xl border transition-all duration-200 flex justify-between items-center min-h-[50px] focus:outline-none focus:ring-2 focus:ring-red-500/15 cursor-pointer ${
                    currentMode === 'DOS'
                      ? 'bg-red-50/70 dark:bg-red-950/25 border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-400 font-semibold animate-pulse'
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold font-display tracking-wide flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"></span>
                      2. TRIGGER DoS FLOOD
                    </p>
                    <p className="text-[10px] opacity-75 mt-0.5 font-normal font-sans">
                      Spawns rapid high-priority frame 0x000 (~1,300 Hz)
                    </p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-red-100 dark:bg-red-950/35 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 rounded">ATTACK</span>
                </button>

                {/* Fuzzing button */}
                <button
                  onClick={() => onChangeMode('FUZZ')}
                  className={`w-full p-3.5 text-left rounded-xl border transition-all duration-200 flex justify-between items-center min-h-[50px] focus:outline-none focus:ring-2 focus:ring-purple-500/15 cursor-pointer ${
                    currentMode === 'FUZZ'
                      ? 'bg-purple-50/70 dark:bg-purple-950/25 border-purple-200 dark:border-purple-900/60 text-purple-800 dark:text-purple-400 font-semibold'
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold font-display tracking-wide flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse"></span>
                      3. TRIGGER FUZZING ATTACK
                    </p>
                    <p className="text-[10px] opacity-75 mt-0.5 font-normal font-sans">
                      High entropy payloads over randomized arbitration IDs
                    </p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-purple-100 dark:bg-purple-950/35 border border-purple-200 dark:border-purple-900/50 text-purple-700 dark:text-purple-400 rounded">ATTACK</span>
                </button>

                {/* Spoofing button */}
                <button
                  onClick={() => onChangeMode('SPOOF')}
                  className={`w-full p-3.5 text-left rounded-xl border transition-all duration-200 flex justify-between items-center min-h-[50px] focus:outline-none focus:ring-2 focus:ring-orange-500/15 cursor-pointer ${
                    currentMode === 'SPOOF'
                      ? 'bg-amber-50/70 dark:bg-amber-950/25 border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-400 font-semibold animate-pulse'
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold font-display tracking-wide flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                      4. TRIGGER SPOOFING ATTACK
                    </p>
                    <p className="text-[10px] opacity-75 mt-0.5 font-normal font-sans">
                      Impersonates genuine ECUs with timing anomalies and critical spoof values
                    </p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-amber-100 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-400 rounded">ATTACK</span>
                </button>
              </div>
            </div>

            {/* Sim Speed & Playback */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 mt-auto">
              <h4 className="text-[11px] font-mono font-bold text-slate-500 mb-2.5 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-sky-600" /> TRANSMISSION ENGINE
              </h4>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={onTogglePause}
                  className={`flex-1 py-2 rounded text-xs font-semibold font-mono flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    isPaused
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse'
                      : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                  {isPaused ? 'RESUME STREAM' : 'PAUSE BUS'}
                </button>
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-mono text-slate-450 mb-1">
                  <span>PACKET SPARK SPEED</span>
                  <span className="text-slate-700 dark:text-slate-300 font-bold">{packetSpeedMultiplier.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="3.0"
                  step="0.1"
                  value={packetSpeedMultiplier}
                  onChange={(e) => onChangeSpeed(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 bg-slate-100 h-1 rounded cursor-pointer"
                />
              </div>
            </div>

            {/* Collapsible Theory/Cheat Sheet */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900/40 shadow-sm shrink-0">
              <button
                type="button"
                onClick={() => setShowTheory(!showTheory)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider">
                  <BookOpen className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  CAN & IDS Theory
                </span>
                <span className="text-slate-400 font-mono text-[10px]">
                  {showTheory ? 'HIDE ▴' : 'SHOW ▾'}
                </span>
              </button>
              
              {showTheory && (
                <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-slate-950/20 max-h-[180px] overflow-y-auto custom-scrollbar font-sans text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                  <div>
                    <h5 className="font-bold text-slate-800 dark:text-slate-200 font-mono flex items-center gap-1">
                      <span className="text-emerald-600">#</span> CAN Bus Protocol
                    </h5>
                    <p className="text-slate-500 dark:text-slate-455 mt-0.5">
                      CAN (Controller Area Network) is a shared broadcast medium with <strong>no built-in source addresses or authentication</strong>. Any compromised ECU on the physical twisted pair can impersonate any other node.
                    </p>
                  </div>

                  <div>
                    <h5 className="font-bold text-slate-800 dark:text-slate-200 font-mono flex items-center gap-1">
                      <span className="text-red-600">#</span> DoS & Dominant Bits
                    </h5>
                    <p className="text-slate-500 dark:text-slate-455 mt-0.5">
                      CAN uses bitwise priority arbitration: <span className="font-mono text-red-500">0</span> is dominant and <span className="font-mono text-slate-400">1</span> is recessive. Sending <span className="font-mono">0x000</span> instantly dominates the bus, shutting down brake/steering packets. This is detected by monitoring the <strong>Message Frequency</strong> rate.
                    </p>
                  </div>

                  <div>
                    <h5 className="font-bold text-slate-800 dark:text-slate-200 font-mono flex items-center gap-1">
                      <span className="text-purple-600">#</span> Shannon Payload Entropy
                    </h5>
                    <p className="text-slate-500 dark:text-slate-455 mt-0.5">
                      Fuzzing sprays random bit combinations across CAN IDs. Normal CAN data has fixed cyclic structures (low entropy, &lt; 1.0 bits), whereas fuzzing bursts display highly randomized state variables.
                    </p>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 p-2 mt-1.5 rounded font-mono text-[9px] text-purple-600 dark:text-purple-400 font-semibold leading-normal shadow-sm">
                      H = - Σ P(xᵢ) · log₂(P(xᵢ))
                      <br />
                      <span className="text-slate-400 font-normal">Max Entropy: 3.0 bits (all 8 bytes unique)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: CUSTOM FRAME INJECTOR */}
        {sandboxTab === 'injector' && (
          <form onSubmit={handleInjectSubmit} className="space-y-4 flex-1 flex flex-col">
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Cpu className="h-3 w-3 text-sky-600" /> CAN Sandbox Injector
              </h3>
              <p className="text-xs text-slate-450 mb-3 leading-relaxed">
                Forge and inject a custom CAN packet directly onto the active stubs. Watch it animate and test if it triggers IDS alert tripwires!
              </p>
            </div>

            {/* QUICK PROFILE SIGNALS */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                ⚡ PRE-FILL FROM {selectedCarModel.brand.toUpperCase()} DATABASE
              </span>
              <div className="flex flex-wrap gap-1.5">
                {selectedCarModel.signals.map((sig) => (
                  <button
                    key={sig.id}
                    type="button"
                    onClick={() => {
                      setInjId(sig.id);
                      setInjDlc(8);
                      setInjBytesInput(sig.generatePayload(Date.now()).join(' '));
                      setInjSource(sig.source);
                      setInjDest(sig.destination);
                    }}
                    className="text-[9px] font-mono px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-950 rounded-lg transition-all flex items-center gap-1 cursor-pointer focus:outline-none shadow-sm"
                    title={`Signal: ${sig.name} (${sig.source} -> ${sig.destination})`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: selectedCarModel.brandColor }} />
                    <span className="text-slate-800 font-medium">{sig.id}</span>
                    <span className="opacity-60">{sig.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3.5 bg-slate-50 p-4 rounded-xl border border-slate-200">
              {/* ID & DLC */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono text-slate-450 mb-1">ARB ID (Hex)</label>
                  <input
                    type="text"
                    value={injId}
                    onChange={(e) => setInjId(e.target.value)}
                    placeholder="e.g. 0x1A4"
                    maxLength={5}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 focus:border-slate-400 hover:border-slate-300 focus:ring-1 focus:ring-slate-300/50 rounded-lg text-xs font-mono text-slate-700 focus:outline-none transition-all duration-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-450 mb-1">DLC (Length)</label>
                  <select
                    value={injDlc}
                    onChange={(e) => setInjDlc(parseInt(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 focus:border-slate-400 hover:border-slate-300 focus:ring-1 focus:ring-slate-300/50 rounded-lg text-xs font-mono text-slate-700 focus:outline-none transition-all duration-200 cursor-pointer"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((d) => (
                      <option key={d} value={d}>
                        {d} Bytes
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Payload input */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-mono text-slate-450">Payload Bytes (Hex)</label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={fillRandomBytes}
                      className="text-[8px] font-bold text-purple-600 hover:text-purple-700 font-mono transition-colors border border-purple-200 bg-purple-50 px-1.5 py-0.5 rounded focus:outline-none cursor-pointer"
                    >
                      HIGH ENTROPY
                    </button>
                    <button
                      type="button"
                      onClick={fillLowEntropyBytes}
                      className="text-[8px] font-bold text-emerald-600 hover:text-emerald-700 font-mono transition-colors border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 rounded focus:outline-none cursor-pointer"
                    >
                      LOW ENTROPY
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={injBytesInput}
                  onChange={(e) => setInjBytesInput(e.target.value)}
                  placeholder="e.g. FF AA 00 11"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 focus:border-slate-400 hover:border-slate-300 focus:ring-1 focus:ring-slate-300/50 rounded-lg text-xs font-mono text-slate-700 focus:outline-none transition-all duration-200"
                  required
                />
                <div className="flex justify-between items-center mt-1.5 text-[9px] font-mono text-slate-400">
                  <span>Computed Entropy:</span>
                  <span className={computedEntropy > 2.0 ? 'text-purple-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                    {computedEntropy.toFixed(4)} bits
                  </span>
                </div>
              </div>

              {/* Sender & Receiver nodes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono text-slate-450 mb-1">Source ECU</label>
                  <select
                    value={injSource}
                    onChange={(e) => setInjSource(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 focus:border-slate-400 hover:border-slate-300 focus:ring-1 focus:ring-slate-300/50 rounded-lg text-xs font-mono text-slate-700 focus:outline-none transition-all duration-200 cursor-pointer"
                  >
                    <option value="Malicious Injection Tool">Malicious Injection Tool</option>
                    {selectedCarModel.nodes.map(n => (
                      <option key={n.id} value={n.label}>{n.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-450 mb-1">Dest ECU</label>
                  <select
                    value={injDest}
                    onChange={(e) => setInjDest(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 focus:border-slate-400 hover:border-slate-300 focus:ring-1 focus:ring-slate-300/50 rounded-lg text-xs font-mono text-slate-700 focus:outline-none transition-all duration-200 cursor-pointer"
                  >
                    {selectedCarModel.nodes.map(n => (
                      <option key={n.id} value={n.label}>{n.label}</option>
                    ))}
                    <option value="Broadcast">Broadcast</option>
                  </select>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-auto py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[44px] sm:min-h-0 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              INJECT CUSTOM FRAME
            </button>
          </form>
        )}

        {/* TAB 3: IDS SECURITY RULES CONFIGURATION */}
        {sandboxTab === 'rules' && (
          <div className="space-y-4 flex-1 flex flex-col">
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Sliders className="h-3 w-3 text-red-600" /> IDS Gateway Rules
              </h3>
              <p className="text-xs text-slate-450 mb-3 leading-relaxed">
                Tune the anomaly-detection algorithms. You can bypass specific tripwires completely to simulate a disabled or compromised security policy!
              </p>
            </div>

            <div className="space-y-4">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`p-3.5 rounded-lg border transition-all ${
                    rule.enabled 
                      ? 'bg-white border-slate-200 shadow-sm' 
                      : 'bg-slate-100 border-slate-200 opacity-60'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1">
                        {rule.type === 'frequency' ? (
                          <Zap className="h-3.5 w-3.5 text-red-500" />
                        ) : (
                          <Flame className="h-3.5 w-3.5 text-purple-500" />
                        )}
                        {rule.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">{rule.description}</p>
                    </div>
                    
                    {/* Toggle button */}
                    <button
                      type="button"
                      onClick={() => onToggleRule(rule.id)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:ring-offset-1 focus:ring-offset-white ${
                        rule.enabled ? 'bg-emerald-500' : 'bg-slate-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-all duration-200 ${
                          rule.enabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {rule.enabled && (
                    <div className="mt-3">
                      <div className="flex justify-between text-[10px] font-mono text-slate-450 mb-1">
                        <span>CRITICAL THRESHOLD LIMIT</span>
                        <span className="font-bold text-slate-800">
                          {rule.threshold} {rule.unit}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={rule.type === 'frequency' ? 200 : rule.type === 'temporal' ? 2 : 1.0}
                        max={rule.type === 'frequency' ? 1500 : rule.type === 'temporal' ? 45 : 3.0}
                        step={rule.type === 'frequency' ? 50 : rule.type === 'temporal' ? 1 : 0.1}
                        value={rule.threshold}
                        onChange={(e) => onChangeRuleThreshold && onChangeRuleThreshold(rule.id, parseFloat(e.target.value))}
                        className="w-full h-1 rounded accent-emerald-600 bg-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-300/50 cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: DATASET UPLOADER & REPLAY PLAYER */}
        {sandboxTab === 'dataset' && (
          <div className="space-y-4 text-xs flex-1 flex flex-col min-h-0 select-none">
            {/* A. Load file zone */}
            {datasetFrames.length === 0 ? (
              <div className="space-y-3">
                {/* Hidden real file input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".csv,.txt,.log"
                  className="hidden"
                />

                {/* File Dropzone */}
                <div 
                  className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-450 rounded-xl p-4 text-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-all flex flex-col items-center justify-center gap-2"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const text = event.target?.result as string;
                        const parsed = parseCANFile(text, file.name);
                        if (parsed.length > 0) {
                          onSetDatasetFrames?.(parsed);
                          onSetDatasetFileName?.(file.name);
                          onSetCurrentFrameIndex?.(0);
                          onAddAlert?.({
                            id: Math.random().toString(),
                            timestamp: Date.now(),
                            message: `Dataset [${file.name}] loaded successfully. Parsed ${parsed.length} CAN frames.`,
                            type: 'success',
                            source: 'Uploader Core',
                            arbId: 'N/A'
                          });
                        } else {
                          alert('Could not find any valid CAN frames in the dropped file.');
                        }
                      };
                      reader.readAsText(file);
                    }
                  }}
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                >
                  <Upload className="h-6 w-6 text-slate-400" />
                  <div>
                    <span className="font-semibold text-slate-700">Click to upload</span> or drag & drop
                  </div>
                  <div className="text-[10px] text-slate-450">
                    Supports SocketCAN candump log, CSV, and TXT files
                  </div>
                </div>

                {/* Built-in Samples */}
                <div>
                  <h4 className="text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-2 font-mono flex items-center gap-1.5">
                    <Database className="h-3 w-3" /> Or Load Preconfigured Templates
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {SAMPLE_DATASETS.map((sample) => (
                      <button
                        key={sample.id}
                        type="button"
                        onClick={() => {
                          const parsed = parseCANFile(sample.dataText, sample.fileName);
                          if (parsed.length > 0) {
                            onSetDatasetFrames?.(parsed);
                            onSetDatasetFileName?.(sample.fileName);
                            onSetCurrentFrameIndex?.(0);
                            onAddAlert?.({
                              id: Math.random().toString(),
                              timestamp: Date.now(),
                              message: `Loaded dataset template: ${sample.name}. ${parsed.length} frames ready.`,
                              type: 'success',
                              source: 'Sample Loader',
                              arbId: 'N/A'
                            });
                          }
                        }}
                        className="text-left p-2.5 rounded-lg border border-slate-200 hover:border-slate-350 bg-white hover:bg-slate-50 transition-all flex justify-between items-center group cursor-pointer"
                      >
                        <div className="pr-2 min-w-0">
                          <div className="font-semibold text-slate-700 text-[11px] group-hover:text-slate-900 flex items-center gap-1.5 truncate">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                              sample.type === 'normal' ? 'bg-emerald-500' :
                              sample.type === 'dos' ? 'bg-red-500' :
                              sample.type === 'fuzz' ? 'bg-purple-500' : 'bg-amber-500'
                            }`} />
                            {sample.name}
                          </div>
                          <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{sample.description}</p>
                        </div>
                        <FileText className="h-4 w-4 text-slate-300 shrink-0 group-hover:text-slate-400" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 flex-1 flex flex-col min-h-0">
                {/* Active File Header */}
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-emerald-500 text-white rounded-lg">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-emerald-800 text-[11px] truncate">{datasetFileName}</h4>
                      <p className="text-[10px] text-emerald-600/80 font-mono font-medium">{datasetFrames.length} Frames Loaded</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onSetIsDatasetPlaying?.(false);
                      onSetDatasetFrames?.([]);
                      onSetDatasetFileName?.('');
                      onSetCurrentFrameIndex?.(0);
                    }}
                    className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-600 hover:text-emerald-800 rounded-lg transition-colors cursor-pointer"
                    title="Eject dataset"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Progress bar */}
                <div className="space-y-1 bg-slate-50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-200">
                  <div className="flex justify-between font-mono text-[10px] text-slate-500">
                    <span>PLAYBACK PROGRESS</span>
                    <span className="font-bold text-slate-700">
                      {currentFrameIndex} / {datasetFrames.length} ({Math.round((currentFrameIndex / datasetFrames.length) * 100)}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 rounded-full transition-all duration-150"
                      style={{ width: `${(currentFrameIndex / datasetFrames.length) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Control Panel Actions */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => onSetIsDatasetPlaying?.(!isDatasetPlaying)}
                    className={`p-2.5 rounded-xl border font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      isDatasetPlaying 
                        ? 'bg-amber-500 border-amber-500 hover:bg-amber-600 text-white shadow-sm'
                        : 'bg-emerald-600 border-emerald-500 hover:bg-emerald-700 text-white shadow-sm'
                    }`}
                  >
                    {isDatasetPlaying ? (
                      <>
                        <Pause className="h-3.5 w-3.5 fill-current" />
                        PAUSE
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 fill-current" />
                        PLAY
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (currentFrameIndex < datasetFrames.length) {
                        const frame = datasetFrames[currentFrameIndex];
                        onInjectSingleFrame?.(frame);
                        onSetCurrentFrameIndex?.(currentFrameIndex + 1);
                      }
                    }}
                    disabled={isDatasetPlaying || currentFrameIndex >= datasetFrames.length}
                    className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                    STEP
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onSetIsDatasetPlaying?.(false);
                      onSetCurrentFrameIndex?.(0);
                    }}
                    className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    RESET
                  </button>
                </div>

                {/* Controls options */}
                <div className="space-y-3 bg-slate-50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-600">Mute ambient background simulation</span>
                    <button
                      type="button"
                      onClick={() => onSetMuteSimulation?.(!muteSimulation)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 focus:outline-none ${
                        muteSimulation ? 'bg-emerald-500' : 'bg-slate-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-all duration-200 ${
                          muteSimulation ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="border-t border-slate-200 my-1"></div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-600">Timing Strategy</span>
                      <div className="flex bg-slate-200 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => onSetDatasetPlaybackMode?.('uniform')}
                          className={`px-2 py-1 rounded-md text-[10px] font-bold cursor-pointer transition-all ${
                            datasetPlaybackMode === 'uniform' ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50' : 'text-slate-500'
                          }`}
                        >
                          Uniform
                        </button>
                        <button
                          type="button"
                          onClick={() => onSetDatasetPlaybackMode?.('realtime')}
                          className={`px-2 py-1 rounded-md text-[10px] font-bold cursor-pointer transition-all ${
                            datasetPlaybackMode === 'realtime' ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50' : 'text-slate-500'
                          }`}
                        >
                          Real-time
                        </button>
                      </div>
                    </div>

                    {datasetPlaybackMode === 'uniform' ? (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-mono text-slate-500">
                          <span>STEP DELAY</span>
                          <span className="font-bold text-slate-700">{uniformDelay} ms</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="1000"
                          step="10"
                          value={uniformDelay}
                          onChange={(e) => onSetUniformDelay?.(parseInt(e.target.value))}
                          className="w-full h-1 rounded accent-emerald-600 bg-slate-200 cursor-pointer"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-mono text-slate-500">
                          <span>TIME RATE SPEEDUP</span>
                          <span className="font-bold text-slate-700">{realtimeSpeed}x</span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="10.0"
                          step="0.5"
                          value={realtimeSpeed}
                          onChange={(e) => onSetRealtimeSpeed?.(parseFloat(e.target.value))}
                          className="w-full h-1 rounded accent-emerald-600 bg-slate-200 cursor-pointer"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Queue Inspection Ledger */}
                <div className="flex-1 min-h-0 flex flex-col space-y-1.5">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5 shrink-0">
                    <Activity className="h-3 w-3" /> Up next in playback buffer
                  </h4>
                  <div className="flex-1 overflow-y-auto bg-slate-900 text-slate-350 font-mono text-[9px] p-2.5 rounded-xl border border-slate-800 space-y-1.5 custom-scrollbar min-h-[100px]">
                    {datasetFrames.slice(currentFrameIndex, currentFrameIndex + 4).length === 0 ? (
                      <div className="text-slate-500 text-center py-4 italic">No more frames pending.</div>
                    ) : (
                      datasetFrames.slice(currentFrameIndex, currentFrameIndex + 4).map((frame, idx) => (
                        <div 
                          key={idx} 
                          className={`flex items-center justify-between pb-1.5 ${idx < 3 ? 'border-b border-slate-850' : ''} ${idx === 0 ? 'text-emerald-450 font-bold' : 'text-slate-400'}`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[8px] text-slate-400 bg-slate-800 px-1 py-0.2 rounded font-sans shrink-0">
                              {idx === 0 ? 'NEXT' : `+${idx}`}
                            </span>
                            <span className="w-10 text-slate-100 shrink-0">{frame.id}</span>
                            <span className="text-slate-500 bg-slate-800/80 px-1 rounded shrink-0">DLC {frame.dlc}</span>
                            <span className="truncate">{frame.data.join(' ')}</span>
                          </div>
                          {frame.source && (
                            <span className="text-[8px] bg-slate-800 text-slate-450 px-1 rounded truncate max-w-[70px] shrink-0">
                              {frame.source}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
