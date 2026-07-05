import { useState, useEffect, useRef } from 'react';
import { AnomalyType, CANFrame, IDSMetrics, RuleConfig } from './types';
import BusTopology from './components/BusTopology';
import MetricChart from './components/MetricChart';
import PacketConsole from './components/PacketConsole';
import ControlCenter from './components/ControlCenter';
import { CAR_MODELS, CarModel } from './data/carModels';
import { calculateHammingDistance } from './utils';
import { ParsedCANFrame } from './utils/datasetParser';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertOctagon,
  Clock,
  Radio,
  RefreshCw,
  Cpu,
  Flame,
  Info,
  Layers,
  Wrench,
  BookOpen,
  Car,
  Sun,
  Moon,
  Volume2,
  VolumeX
} from 'lucide-react';
import { idsAudio } from './utils/audio';

interface SecurityAlert {
  id: string;
  timestamp: number;
  message: string;
  type: 'error' | 'warning' | 'info';
  source: string;
  arbId: string;
}

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme');
      if (stored) return stored === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const [currentMode, setCurrentMode] = useState<AnomalyType>('NORMAL');
  const [isMuted, setIsMuted] = useState<boolean>(() => idsAudio.getMuteStatus());

  // Sync continuous warning alarm sound with active injection attacks
  useEffect(() => {
    if (isMuted || currentMode === 'NORMAL') {
      idsAudio.stopAlarm();
    } else {
      idsAudio.startAlarm(currentMode.toLowerCase() as 'dos' | 'spoof' | 'fuzz');
    }
    return () => {
      idsAudio.stopAlarm();
    };
  }, [currentMode, isMuted]);

  const [isPaused, setIsPaused] = useState(false);
  const [packetSpeedMultiplier, setPacketSpeedMultiplier] = useState(1.0);
  const [selectedCarModel, setSelectedCarModel] = useState<CarModel>(CAR_MODELS[0]);

  // Dataset playback states
  const [datasetFrames, setDatasetFrames] = useState<ParsedCANFrame[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [isDatasetPlaying, setIsDatasetPlaying] = useState<boolean>(false);
  const [datasetPlaybackMode, setDatasetPlaybackMode] = useState<'uniform' | 'realtime'>('uniform');
  const [uniformDelay, setUniformDelay] = useState<number>(150); // ms
  const [realtimeSpeed, setRealtimeSpeed] = useState<number>(1.0); // multiplier
  const [muteSimulation, setMuteSimulation] = useState<boolean>(false);
  const [datasetFileName, setDatasetFileName] = useState<string>('');

  // Core telemetry state
  const [packetsHistory, setPacketsHistory] = useState<CANFrame[]>([]);
  const [frequencyHistory, setFrequencyHistory] = useState<number[]>(() => Array(50).fill(250));
  const [entropyHistory, setEntropyHistory] = useState<number[]>(() => Array(50).fill(0.5));
  const [totalPackets, setTotalPackets] = useState(1482);
  const [totalAnomalies, setTotalAnomalies] = useState(0);
  const [lastInjectedPacket, setLastInjectedPacket] = useState<CANFrame | null>(null);

  // Sliding counters updated at 100ms intervals
  const intervalPacketCountRef = useRef(0);
  const intervalEntropySumRef = useRef(0);
  const totalPacketsRef = useRef(totalPackets);
  const totalAnomaliesRef = useRef(totalAnomalies);
  const selectedCarModelRef = useRef(selectedCarModel);
  useEffect(() => {
    selectedCarModelRef.current = selectedCarModel;
  }, [selectedCarModel]);

  // Advanced features tracking refs
  const lastPacketAndIatRef = useRef<Record<string, { lastFrame: CANFrame; lastIat: number }>>({});
  const globalTimestampsRef = useRef<number[]>([]);

  // IDS Security Rules configuration
  const [rules, setRules] = useState<RuleConfig[]>([
    {
      id: 'rule-dos',
      name: 'Message Rate Flood',
      description: 'Detect high-frequency arbitration ID 0x000 DoS floods',
      threshold: 700,
      unit: 'Hz',
      enabled: true,
      type: 'frequency',
    },
    {
      id: 'rule-entropy',
      name: 'Shannon Entropy Limit',
      description: 'Detect randomized fuzzing payload entropy anomalies',
      threshold: 2.2,
      unit: 'bits',
      enabled: true,
      type: 'entropy',
    },
    {
      id: 'rule-spoof',
      name: 'Temporal Jitter Guard',
      description: 'Detect timing anomalies/jitter from malicious ECU spoofing',
      threshold: 12,
      unit: 'ms',
      enabled: true,
      type: 'temporal',
    }
  ]);

  // Rolling security alerts
  const [alerts, setAlerts] = useState<SecurityAlert[]>([
    {
      id: 'initial-secure',
      timestamp: Date.now() - 5000,
      message: 'Chakravyuham Gateway armed. Protocol-Agnostic IDS operating at 500kbps.',
      type: 'info',
      source: 'System Core',
      arbId: 'N/A',
    }
  ]);

  // Keep references updated for intervals
  useEffect(() => {
    totalPacketsRef.current = totalPackets;
    totalAnomaliesRef.current = totalAnomalies;
  }, [totalPackets, totalAnomalies]);

  // Handle active rule values
  const handleToggleRule = (id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
    addAlert({
      id: Math.random().toString(),
      timestamp: Date.now(),
      message: `Gateway security policy altered: rule '${id === 'rule-dos' ? 'Message Rate Flood' : 'Shannon Entropy'}' toggled.`,
      type: 'info',
      source: 'Security Policy',
      arbId: 'N/A',
    });
  };

  const handleChangeRuleThreshold = (id: string, newThreshold: number) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, threshold: newThreshold } : r))
    );
  };

  const handleCarModelChange = (model: CarModel) => {
    setSelectedCarModel(model);
    setPacketsHistory([]);
    setTotalAnomalies(0);
    setTotalPackets(0);
    
    // Reset dataset playback
    setIsDatasetPlaying(false);
    setCurrentFrameIndex(0);
    
    // Clear advanced tracking refs
    lastPacketAndIatRef.current = {};
    globalTimestampsRef.current = [];
    
    addAlert({
      id: Math.random().toString(),
      timestamp: Date.now(),
      message: `System gateway switched network profile to [${model.brand} ${model.name}]. Resynchronizing IDS rules for ${model.baudRate}...`,
      type: 'info',
      source: 'System Core',
      arbId: 'N/A',
    });
  };

  // Append new alerts helper
  const addAlert = (alert: SecurityAlert) => {
    setAlerts((prev) => {
      // Avoid spamming identical consecutive messages within 500ms
      const lastAlert = prev[prev.length - 1];
      if (lastAlert && lastAlert.message === alert.message && alert.timestamp - lastAlert.timestamp < 1000) {
        return prev;
      }
      return [...prev.slice(-30), alert]; // cap alert list at 30
    });
  };

  // Packet listener callback (triggered directly by BusTopology or sandbox)
  const handlePacketDispatched = (frame: CANFrame) => {
    // Play subtle haptic audio feedback click
    idsAudio.playClick();

    // Increment telemetry counters
    setTotalPackets((prev) => prev + 1);
    intervalPacketCountRef.current += 1;
    intervalEntropySumRef.current += frame.entropy;

    // Advanced Packet-Level Feature Calculations
    const now = frame.timestamp;
    let iat = 0;
    let jitter = 0;
    let hammingDist = 0;

    const idEntry = lastPacketAndIatRef.current[frame.id];
    if (idEntry) {
      iat = Math.max(0, now - idEntry.lastFrame.timestamp);
      jitter = Math.abs(iat - idEntry.lastIat);
      hammingDist = calculateHammingDistance(frame.data, idEntry.lastFrame.data);

      idEntry.lastFrame = frame;
      idEntry.lastIat = iat;
    } else {
      lastPacketAndIatRef.current[frame.id] = { lastFrame: frame, lastIat: 0 };
    }

    // Rolling global frequency (rolling count of 50 packets)
    globalTimestampsRef.current.push(now);
    if (globalTimestampsRef.current.length > 50) {
      globalTimestampsRef.current.shift();
    }
    const rollingLen = globalTimestampsRef.current.length;
    let rollingFreq = 0;
    if (rollingLen >= 2) {
      const timeDiffSec = (globalTimestampsRef.current[rollingLen - 1] - globalTimestampsRef.current[0]) / 1000;
      rollingFreq = timeDiffSec > 0 ? (rollingLen / timeDiffSec) : 0;
    }

    // Enriched attributes
    frame.iat = parseFloat(iat.toFixed(2));
    frame.jitter = parseFloat(jitter.toFixed(2));
    frame.messageFrequency = parseFloat(rollingFreq.toFixed(1));
    frame.payloadEntropy = frame.entropy;
    frame.payloadHammingDist = hammingDist;

    // Check individual frame anomalies (e.g. Fuzzing entropy rule violations)
    const entropyRule = rules.find((r) => r.id === 'rule-entropy');
    const isFuzzingRuleViolation =
      entropyRule?.enabled && frame.entropy > entropyRule.threshold;

    if (isFuzzingRuleViolation && frame.anomalyType === 'FUZZ') {
      setTotalAnomalies((prev) => prev + 1);
      addAlert({
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: `FUZZING ALERT: Shannon entropy (${frame.entropy} bits) exceeds allowed limit. Custom arbitration registers compromised.`,
        type: 'warning',
        source: frame.source,
        arbId: frame.id,
      });
    }

    // Check individual DoS arbitration collision frames
    const dosRule = rules.find((r) => r.id === 'rule-dos');
    if (frame.id === '0x000' && dosRule?.enabled) {
      // Increment anomalies count
      setTotalAnomalies((prev) => prev + 1);
      
      addAlert({
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: `DoS SHIELD: Dropped high-priority frame 0x000 to prevent bus starvation.`,
        type: 'error',
        source: 'Security Gateway',
        arbId: '0x000',
      });
    }

    // Check individual SPOOF timing anomalies
    const spoofRule = rules.find((r) => r.id === 'rule-spoof');
    const isSpoofRuleViolation = spoofRule?.enabled && jitter > spoofRule.threshold;

    if (isSpoofRuleViolation && frame.anomalyType === 'SPOOF') {
      setTotalAnomalies((prev) => prev + 1);
      addAlert({
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: `SPOOF ALERT: Jitter anomaly detected on ID ${frame.id} (${jitter.toFixed(1)} ms > safety threshold ${spoofRule.threshold} ms). Impersonation suspected!`,
        type: 'error',
        source: 'Temporal Jitter Guard',
        arbId: frame.id,
      });
    }

    // Append to rolling log console
    setPacketsHistory((prev) => [...prev.slice(-99), frame]);
    window.dispatchEvent(new CustomEvent('can-packet', { detail: frame }));
  };

  // Dynamic 100ms polling tick for charting message rate & entropy averages
  useEffect(() => {
    if (isPaused) return;

    const intervalId = setInterval(() => {
      const rateMultiplier = packetSpeedMultiplier;
      // Normal range: 250 Hz. Fuzzing: ~400 Hz. DoS: ~1300 Hz.
      const packetsReceived = intervalPacketCountRef.current;
      const packetsPerSecondComputed = packetsReceived * 10; // since interval is 100ms

      // Entropy average
      const avgEntropyComputed =
        packetsReceived > 0
          ? intervalEntropySumRef.current / packetsReceived
          : currentMode === 'NORMAL'
          ? 0.5 + Math.random() * 0.15
          : currentMode === 'SPOOF'
          ? 0.7 + Math.random() * 0.1
          : 0.5;

      // Add small stable jitter depending on mode to keep graphs feeling real
      let displayFreq = packetsPerSecondComputed;
      if (currentMode === 'NORMAL') {
        displayFreq = 230 + Math.random() * 40;
      } else if (currentMode === 'DOS') {
        displayFreq = 1250 + Math.random() * 150;
      } else if (currentMode === 'FUZZ') {
        displayFreq = 380 + Math.random() * 60;
      } else if (currentMode === 'SPOOF') {
        displayFreq = 290 + Math.random() * 45;
      }

      displayFreq = Math.round(displayFreq * rateMultiplier);

      // Append values to rolling graph arrays
      setFrequencyHistory((prev) => [...prev.slice(-49), displayFreq]);
      setEntropyHistory((prev) => [...prev.slice(-49), parseFloat(avgEntropyComputed.toFixed(4))]);

      // Check DoS Flood rate rule violation (collective rate check)
      const dosRule = rules.find((r) => r.id === 'rule-dos');
      if (dosRule?.enabled && displayFreq > dosRule.threshold && currentMode === 'DOS') {
        addAlert({
          id: Math.random().toString(),
          timestamp: Date.now(),
          message: `FLOOD TRIGGERED: Network frequency (${displayFreq} Hz) violates safety envelope limit (${dosRule.threshold} Hz).`,
          type: 'error',
          source: 'Gateway Bus Monitor',
          arbId: 'MULTIPLE',
        });
      }

      // Reset interval tally
      intervalPacketCountRef.current = 0;
      intervalEntropySumRef.current = 0;
    }, 100);

    return () => clearInterval(intervalId);
  }, [currentMode, isPaused, packetSpeedMultiplier, rules]);

  // Dynamic player tick for custom dataset playback
  useEffect(() => {
    if (!isDatasetPlaying || datasetFrames.length === 0) return;
    if (currentFrameIndex >= datasetFrames.length) {
      setIsDatasetPlaying(false);
      addAlert({
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: `Dataset [${datasetFileName}] playback finished. All ${datasetFrames.length} frames simulated successfully.`,
        type: 'info',
        source: 'Dataset Player',
        arbId: 'N/A'
      });
      return;
    }

    const playNextFrame = () => {
      const parsedFrame = datasetFrames[currentFrameIndex];
      if (!parsedFrame) return;
      
      // Calculate Shannon entropy for this frame
      const counts: Record<string, number> = {};
      for (const b of parsedFrame.data) counts[b] = (counts[b] || 0) + 1;
      let entropy = 0;
      for (const b in counts) {
        const p = counts[b] / parsedFrame.data.length;
        entropy -= p * Math.log2(p);
      }

      // Check anomalies based on standard patterns
      const is000 = parsedFrame.id === '0x000' || parsedFrame.id === '000';
      const isHighEntropy = entropy > 2.0;
      
      let anomalyType: AnomalyType = 'NORMAL';
      if (is000) {
        anomalyType = 'DOS';
      } else if (isHighEntropy) {
        anomalyType = 'FUZZ';
      } else if (
        parsedFrame.id === '0x1F2' && 
        parsedFrame.data[0] === '08' && 
        parsedFrame.data[1] === 'F0'
      ) {
        anomalyType = 'SPOOF';
      } else if (
        parsedFrame.source?.toLowerCase().includes('spoof') || 
        parsedFrame.source?.toLowerCase().includes('malicious')
      ) {
        anomalyType = 'SPOOF';
      }

      const frame: CANFrame = {
        timestamp: Date.now(),
        id: parsedFrame.id,
        dlc: parsedFrame.dlc,
        data: parsedFrame.data,
        entropy: parseFloat(entropy.toFixed(4)),
        isAnomalous: anomalyType !== 'NORMAL',
        anomalyType: anomalyType,
        source: parsedFrame.source || 'Uploaded Log',
        destination: parsedFrame.destination || 'Broadcast',
      };

      // Play feedback audio click
      idsAudio.playClick();

      // Dispatch to pipeline and log
      handlePacketDispatched(frame);
      setLastInjectedPacket(frame);
      window.dispatchEvent(new CustomEvent('can-packet', { detail: frame }));

      setCurrentFrameIndex((prev) => prev + 1);
    };

    let delay = uniformDelay;
    if (datasetPlaybackMode === 'realtime' && currentFrameIndex > 0) {
      const currentTs = datasetFrames[currentFrameIndex].timestamp;
      const prevTs = datasetFrames[currentFrameIndex - 1].timestamp;
      const rawDiff = currentTs - prevTs;
      delay = rawDiff > 0 ? rawDiff / realtimeSpeed : 5;
      if (delay > 5000) delay = 5000; // safety delay cap
    } else if (datasetPlaybackMode === 'realtime') {
      delay = 5;
    }

    const timer = setTimeout(playNextFrame, delay);
    return () => clearTimeout(timer);
  }, [
    isDatasetPlaying,
    currentFrameIndex,
    datasetFrames,
    datasetPlaybackMode,
    uniformDelay,
    realtimeSpeed,
    datasetFileName
  ]);

  // Form custom injector handler
  const handleInjectCustomFrame = (customData: {
    id: string;
    dlc: number;
    bytes: string[];
    source: string;
    destination: string;
  }) => {
    // Check entropy
    const counts: Record<string, number> = {};
    for (const b of customData.bytes) counts[b] = (counts[b] || 0) + 1;
    let entropy = 0;
    for (const b in counts) {
      const p = counts[b] / customData.bytes.length;
      entropy -= p * Math.log2(p);
    }

    const frame: CANFrame = {
      timestamp: Date.now(),
      id: customData.id,
      dlc: customData.dlc,
      data: customData.bytes,
      entropy: parseFloat(entropy.toFixed(4)),
      isAnomalous: customData.id === '0x000' || entropy > 2.0,
      anomalyType: customData.id === '0x000' ? 'DOS' : entropy > 2.0 ? 'FUZZ' : 'NORMAL',
      source: customData.source,
      destination: customData.destination,
    };

    // Inject onto the system
    handlePacketDispatched(frame);
    setLastInjectedPacket(frame);
    window.dispatchEvent(new CustomEvent('can-packet', { detail: frame }));

    addAlert({
      id: Math.random().toString(),
      timestamp: Date.now(),
      message: `SANDBOX INJECTION: Hand-crafted packet ${customData.id} released from ECU stub.`,
      type: 'info',
      source: customData.source,
      arbId: customData.id,
    });
  };

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Disabled WebSocket connection and enabled offline client-side simulation
    setMuteSimulation(false);
  }, []);

  const handleModeChange = (mode: AnomalyType) => {
    setCurrentMode(mode);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        command: "SET_ATTACK",
        preset: mode
      }));
    }
  };

  const clearSimulation = () => {
    setPacketsHistory([]);
    setFrequencyHistory(Array(50).fill(currentMode === 'NORMAL' ? 250 : currentMode === 'DOS' ? 1200 : currentMode === 'SPOOF' ? 310 : 380));
    setEntropyHistory(Array(50).fill(currentMode === 'NORMAL' ? 0.5 : currentMode === 'FUZZ' ? 2.8 : currentMode === 'SPOOF' ? 0.7 : 0.5));
    setTotalPackets(0);
    setTotalAnomalies(0);
    
    // Stop active dataset simulation
    setIsDatasetPlaying(false);
    setCurrentFrameIndex(0);

    setAlerts([
      {
        id: Math.random().toString(),
        timestamp: Date.now(),
        message: 'Telemetry metrics and rolling history caches flushed.',
        type: 'info',
        source: 'System Core',
        arbId: 'N/A',
      }
    ]);
  };

  // Status computation
  const activeAlertCount = alerts.filter(a => a.type === 'error' || a.type === 'warning').length;
  const isRuleDosViolated = frequencyHistory[frequencyHistory.length - 1] > (rules.find(r => r.id === 'rule-dos')?.threshold || 9999);
  const isRuleEntropyViolated = entropyHistory[entropyHistory.length - 1] > (rules.find(r => r.id === 'rule-entropy')?.threshold || 9);

  // Dynamic Bento stats computations
  const getDynamicThreatLevel = () => {
    const seed = (Math.sin(Date.now() / 2000) + 1) / 2; // oscillates between 0 and 1
    if (currentMode === 'NORMAL') {
      return 0.01 + seed * 0.02;
    } else if (currentMode === 'DOS') {
      return 0.91 + seed * 0.05;
    } else if (currentMode === 'SPOOF') {
      return 0.82 + seed * 0.04;
    } else { // FUZZ
      return 0.74 + seed * 0.06;
    }
  };

  const getDynamicCpuLoad = () => {
    const seed = (Math.cos(Date.now() / 1500) + 1) / 2; // oscillates
    if (currentMode === 'NORMAL') {
      return 2.8 + seed * 1.5;
    } else if (currentMode === 'DOS') {
      return 27.4 + seed * 6.2;
    } else if (currentMode === 'SPOOF') {
      return 15.6 + seed * 4.1;
    } else { // FUZZ
      return 11.2 + seed * 3.4;
    }
  };

  const dynamicThreat = getDynamicThreatLevel();
  const dynamicCpu = getDynamicCpuLoad();

  return (
    <div className="min-h-screen bg-bento-bg text-slate-700 flex flex-col font-sans p-4 gap-4 selection:bg-emerald-500/20 selection:text-emerald-800 antialiased max-w-[1600px] mx-auto w-full">
      
      {/* 1. BENTO HEADER */}
      <header className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-bento-card border border-slate-200 p-4 rounded-xl shadow-sm shrink-0 select-none">

        <div className="flex items-center gap-3">
          <div className="shrink-0 flex items-center justify-center p-0.5">
            <svg 
              className={`w-11 h-11 shrink-0 transition-transform duration-500 ${
                currentMode === 'NORMAL' 
                  ? 'text-emerald-600' 
                  : currentMode === 'DOS' 
                    ? 'text-red-500 animate-pulse' 
                    : currentMode === 'SPOOF'
                      ? 'text-orange-500 animate-[spin_20s_linear_infinite]'
                      : 'text-purple-500 animate-pulse'
              }`} 
              viewBox="0 0 100 100" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="5.5" 
              strokeLinecap="round"
            >
              {/* Outer Circular Ring with Gateways (Chakravyuham Entrance) */}
              <path d="M 50 8 A 42 42 0 1 1 20 20" />
              <path d="M 20 20 L 30 30" strokeWidth="4.5" />

              {/* Second Layer Intertwining Ring */}
              <path d="M 30 30 A 28 28 0 1 0 78 50" />
              <path d="M 78 50 L 66 50" strokeWidth="4.5" />

              {/* Third Layer Ring */}
              <path d="M 66 50 A 16 16 0 1 1 50 34" />
              <path d="M 50 34 L 50 46" strokeWidth="4.5" />

              {/* Center Core Labyrinth Dot */}
              <circle cx="50" cy="50" r="4" fill="currentColor" stroke="none" />

              {/* Radial Labyrinth Bridges */}
              <line x1="50" y1="8" x2="50" y2="20" strokeWidth="4" />
              <line x1="92" y1="50" x2="80" y2="50" strokeWidth="4" />
              <line x1="50" y1="92" x2="50" y2="80" strokeWidth="4" />
              <line x1="8" y1="50" x2="20" y2="50" strokeWidth="4" />
            </svg>
          </div>
          <div>
            <h1 className="text-3xl font-medium font-title tracking-[0.25em] text-slate-800 dark:text-slate-100 flex items-center uppercase">
              Chakravyuham
            </h1>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5 uppercase tracking-wider">
              V2.4.1-STABLE // PROTOCOL GATEWAY IDS ENGINE
            </p>
          </div>
        </div>

        {/* Quick telemetry badges */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Alarm counts */}
          <div className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium flex items-center gap-1.5 text-slate-600">
            <span className="text-slate-400">Threats Blocked:</span>
            <span className={`font-bold ${totalAnomalies > 0 ? 'text-red-500 animate-pulse' : 'text-slate-700'}`}>
              {totalAnomalies}
            </span>
          </div>

          {/* Active Rules armed */}
          <div className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium flex items-center gap-1.5 text-slate-600">
            <span className="text-slate-400">Rules Active:</span>
            <span className="text-emerald-600 font-bold">
              {rules.filter(r => r.enabled).length}/{rules.length}
            </span>
          </div>

          {/* Master reset */}
          <button
            onClick={clearSimulation}
            className="p-1.5 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors cursor-pointer"
            title="Reset Simulation"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          {/* Audio Soundscape Toggle */}
          <button
            onClick={() => {
              const muted = idsAudio.toggleMute();
              setIsMuted(muted);
            }}
            className="p-1.5 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors cursor-pointer flex items-center justify-center"
            title={isMuted ? "Unmute Soundscape" : "Mute Soundscape"}
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4 text-red-500" />
            ) : (
              <Volume2 className="h-4 w-4 text-emerald-600" />
            )}
          </button>

          {/* Dark Mode Toggle */}
          <button
            onClick={() => setIsDarkMode(prev => !prev)}
            className="p-1.5 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors cursor-pointer flex items-center justify-center"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-600" />}
          </button>
        </div>
      </header>
      {/* 2. BENTO METRIC CARDS GRID */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        
        {/* Metric 1 */}
        <div className="bg-bento-card border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm hover:border-slate-300 dark:hover:border-slate-700 hover:shadow transition-all flex justify-between items-center select-none">
          <div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider font-mono">Total Frames Scanned</p>
            <p className="text-xl font-bold font-mono text-slate-800 dark:text-white mt-1">{totalPackets.toLocaleString()}</p>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
            <Layers className="h-5 w-5" />
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-bento-card border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm hover:border-slate-300 dark:hover:border-slate-700 hover:shadow transition-all flex justify-between items-center select-none">
          <div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider font-mono">Peak Bus Frequency</p>
            <p className="text-xl font-bold font-mono text-slate-800 dark:text-white mt-1">
              {Math.round(frequencyHistory[frequencyHistory.length - 1] ?? 0)} <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">Hz</span>
            </p>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-100 dark:border-emerald-900/50 text-emerald-500 dark:text-emerald-450">
            <Radio className="h-5 w-5" />
          </div>
        </div>

        {/* Metric 3: Threat Level Card (Bento Style) */}
        <div className="bg-bento-card border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm hover:border-slate-300 dark:hover:border-slate-700 hover:shadow transition-all flex justify-between items-center select-none">
          <div className="flex-1 mr-3">
            <div className="flex justify-between items-center mb-1">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider font-mono">Threat Level</p>
              <span className={`text-xs font-mono font-bold ${
                currentMode === 'NORMAL' ? 'text-emerald-500' : 'text-red-500'
              }`}>{dynamicThreat.toFixed(2)}</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden mt-2">
              <div 
                className={`h-full transition-all duration-355 rounded-full ${
                  currentMode === 'NORMAL' 
                    ? 'bg-emerald-500' 
                    : currentMode === 'DOS' 
                      ? 'bg-red-500' 
                      : 'bg-purple-500'
                }`}
                style={{ width: `${dynamicThreat * 100}%` }}
              />
            </div>
          </div>
          <div className={`p-3 rounded-xl border ${
            currentMode === 'NORMAL' 
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/50 text-emerald-500 dark:text-emerald-450' 
              : 'bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900/50 text-red-500 dark:text-red-450 animate-pulse'
          }`}>
            <ShieldAlert className="h-5 w-5" />
          </div>
        </div>

        {/* Metric 4: CPU Load Card (Bento Style) */}
        <div className="bg-bento-card border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm hover:border-slate-300 dark:hover:border-slate-700 hover:shadow transition-all flex justify-between items-center select-none">
          <div className="flex-1 mr-3">
            <div className="flex justify-between items-center mb-1">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider font-mono">Gateway CPU Load</p>
              <span className="text-xs font-mono font-bold text-sky-500">{dynamicCpu.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden mt-2">
              <div 
                className="h-full bg-sky-500 rounded-full transition-all duration-355"
                style={{ width: `${(dynamicCpu / 40) * 100}%` }}
              />
            </div>
          </div>
          <div className="p-3 bg-sky-50 dark:bg-sky-950/30 rounded-xl border border-sky-100 dark:border-sky-900/50 text-sky-500 dark:text-sky-450">
            <Cpu className="h-5 w-5" />
          </div>
        </div>

      </section>

      {/* 3. MAIN BENTO WORKSPACE */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Left Side: Pipeline, Charts, and Live Logs Console (Lg Column: 8) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          
          {/* A. Live CAN Bus Pipeline */}
          <div className="bg-bento-card rounded-xl border border-slate-200 flex flex-col overflow-hidden shadow-sm">
            <BusTopology
              currentMode={currentMode}
              isPaused={isPaused}
              packetSpeedMultiplier={packetSpeedMultiplier}
              onPacketDispatched={handlePacketDispatched}
              onAlertTriggered={(msg, type) => addAlert({
                id: Math.random().toString(),
                timestamp: Date.now(),
                message: msg,
                type: type,
                source: 'Topology Parser',
                arbId: 'N/A'
              })}
              lastInjectedPacket={lastInjectedPacket}
              selectedCarModel={selectedCarModel}
              muteBackgroundSpawning={muteSimulation}
            />
          </div>

          {/* B. Telemetry line charts side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
            {/* Chart 1: Frequency rate */}
            <MetricChart
              data={frequencyHistory}
              title="IDS Feature 1: Arbitration Frequency"
              subtitle="DoS & Flood rate safety envelope analyzer"
              unit="Hz"
              threshold={rules.find((r) => r.id === 'rule-dos')?.threshold || 750}
              color={currentMode === 'DOS' ? '#ef4444' : '#10b981'}
              maxVal={1500}
              tripwireType="frequency"
            />

            {/* Chart 2: Shannon Entropy */}
            <MetricChart
              data={entropyHistory}
              title="IDS Feature 2: Payload Shannon Entropy"
              subtitle="Heuristic anomaly & random register fuzzing sensor"
              unit="bits"
              threshold={rules.find((r) => r.id === 'rule-entropy')?.threshold || 2.2}
              color={currentMode === 'FUZZ' ? '#a855f7' : '#10b981'}
              maxVal={3.2}
              tripwireType="entropy"
            />
          </div>

          {/* C. Rolling Log Terminal */}
          <div className="flex-1 min-h-[300px] overflow-hidden flex flex-col">
            <PacketConsole packets={packetsHistory} onClearConsole={() => setPacketsHistory([])} />
          </div>

        </div>

        {/* Right Side: Control Settings & Live Alerts Feed (Lg Column: 4) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          
          {/* A. Controls and Sandbox Frame Injector */}
          <div className="shrink-0">
            <ControlCenter
              currentMode={currentMode}
              onChangeMode={(m) => {
                handleModeChange(m);
                addAlert({
                  id: Math.random().toString(),
                  timestamp: Date.now(),
                  message: `System simulation state updated to mode: ${m}`,
                  type: 'info',
                  source: 'User UI Control',
                  arbId: 'N/A',
                });
              }}
              isPaused={isPaused}
              onTogglePause={() => setIsPaused((prev) => !prev)}
              packetSpeedMultiplier={packetSpeedMultiplier}
              onChangeSpeed={setPacketSpeedMultiplier}
              rules={rules}
              onToggleRule={handleToggleRule}
              onChangeRuleThreshold={handleChangeRuleThreshold}
              onInjectCustomFrame={handleInjectCustomFrame}
              selectedCarModel={selectedCarModel}
              datasetFrames={datasetFrames}
              currentFrameIndex={currentFrameIndex}
              isDatasetPlaying={isDatasetPlaying}
              datasetPlaybackMode={datasetPlaybackMode}
              uniformDelay={uniformDelay}
              realtimeSpeed={realtimeSpeed}
              muteSimulation={muteSimulation}
              datasetFileName={datasetFileName}
              onSetDatasetFrames={setDatasetFrames}
              onSetCurrentFrameIndex={setCurrentFrameIndex}
              onSetIsDatasetPlaying={setIsDatasetPlaying}
              onSetDatasetPlaybackMode={setDatasetPlaybackMode}
              onSetUniformDelay={setUniformDelay}
              onSetRealtimeSpeed={setRealtimeSpeed}
              onSetMuteSimulation={setMuteSimulation}
              onSetDatasetFileName={setDatasetFileName}
              onAddAlert={addAlert}
              onInjectSingleFrame={(parsedFrame) => {
                // Stepping single frame injector
                const counts: Record<string, number> = {};
                for (const b of parsedFrame.data) counts[b] = (counts[b] || 0) + 1;
                let entropy = 0;
                for (const b in counts) {
                  const p = counts[b] / parsedFrame.data.length;
                  entropy -= p * Math.log2(p);
                }
                const is000 = parsedFrame.id === '0x000' || parsedFrame.id === '000';
                const isHighEntropy = entropy > 2.0;
                let anomalyType: AnomalyType = 'NORMAL';
                if (is000) {
                  anomalyType = 'DOS';
                } else if (isHighEntropy) {
                  anomalyType = 'FUZZ';
                } else if (parsedFrame.id === '0x1F2' && parsedFrame.data[0] === '08' && parsedFrame.data[1] === 'F0') {
                  anomalyType = 'SPOOF';
                } else if (parsedFrame.source?.toLowerCase().includes('spoof') || parsedFrame.source?.toLowerCase().includes('malicious')) {
                  anomalyType = 'SPOOF';
                }

                const frame: CANFrame = {
                  timestamp: Date.now(),
                  id: parsedFrame.id,
                  dlc: parsedFrame.dlc,
                  data: parsedFrame.data,
                  entropy: parseFloat(entropy.toFixed(4)),
                  isAnomalous: anomalyType !== 'NORMAL',
                  anomalyType: anomalyType,
                  source: parsedFrame.source || 'Manual Step',
                  destination: parsedFrame.destination || 'Broadcast',
                };
                handlePacketDispatched(frame);
                setLastInjectedPacket(frame);
              }}
            />
          </div>

          {/* B. Live IDS Threat Alerts Panel */}
          <div className="flex-1 min-h-[220px] bg-bento-card border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-sm">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center select-none">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <AlertOctagon className="h-3.5 w-3.5 text-red-500 animate-pulse" />
                Live IDS Threat Alerts
              </h3>
              <span className={`h-1.5 w-1.5 rounded-full ${alerts.length > 1 ? 'bg-red-500 animate-ping' : 'bg-slate-300'}`}></span>
            </div>

            <div className="p-3 flex-1 overflow-y-auto custom-scrollbar space-y-2 max-h-[300px]">
              <AnimatePresence initial={false}>
                {alerts.slice().reverse().map((alert) => {
                  let badgeBg = 'bg-slate-50 border-slate-200 text-slate-600';
                  let iconColor = 'text-slate-400';

                  if (alert.type === 'error') {
                     badgeBg = 'bg-red-50 border-red-100 text-red-700';
                     iconColor = 'text-red-500';
                  } else if (alert.type === 'warning') {
                     badgeBg = 'bg-purple-50 border-purple-100 text-purple-700';
                     iconColor = 'text-purple-500';
                  } else if (alert.type === 'info') {
                     badgeBg = 'bg-sky-50 border-sky-100 text-sky-700';
                     iconColor = 'text-sky-500';
                  }

                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      key={alert.id}
                      className={`p-2.5 rounded-xl border text-[11px] font-sans flex items-start gap-2.5 transition-all ${badgeBg}`}
                    >
                      <Clock className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${iconColor}`} />
                      <div className="flex-1 space-y-0.5">
                        <div className="flex justify-between items-center text-[9px] font-mono opacity-80 mb-0.5">
                          <span className="font-semibold uppercase tracking-wider text-slate-500">{alert.source}</span>
                          <span className="text-slate-400">ARB_ID: {alert.arbId}</span>
                        </div>
                        <p className="leading-normal font-medium">{alert.message}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

        </div>

      </main>

      {/* FOOTER BAR */}
      <footer className="mt-2 flex flex-col lg:flex-row justify-between items-center text-[10px] font-mono text-slate-500 border-t border-slate-200 pt-4 gap-3 select-none">
        <div className="flex flex-wrap justify-center lg:justify-start gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${currentMode === 'DOS' ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
            NODE_ARMED: ENGINE_ECU
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${currentMode === 'DOS' ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
            NODE_ARMED: BATTERY_BMS
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${currentMode === 'FUZZ' ? 'bg-purple-500 animate-pulse' : 'bg-slate-300'}`} />
            NODE_STATUS: CABIN_BCM
          </div>
        </div>
        <div className="flex flex-wrap justify-center lg:justify-end items-center gap-x-4 gap-y-1">
          <span>© 2026 CHAKRAVYUHAM AUTOMOTIVE SECURITY. ALL RIGHTS RESERVED.</span>
          <span className="text-slate-300">|</span>
          <span>SECURED TERMINAL: SHA-256</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600">CLOCK: {new Date().toISOString().slice(11, 19)} UTC</span>
        </div>
      </footer>

    </div>
  );
}
