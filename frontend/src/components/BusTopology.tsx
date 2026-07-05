import { useEffect, useRef, useState } from 'react';
import { AnomalyType, CANFrame } from '../types';
import { calculateShannonEntropy, generateArbitrationID, generateFuzzedPayload, generateSpoofedPayload } from '../utils';
import { ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react';
import { CarModel } from '../data/carModels';

const TOPO_DIMENSIONS = { width: 800, height: 260 };

interface BusTopologyProps {
  currentMode: AnomalyType;
  isPaused: boolean;
  packetSpeedMultiplier: number;
  onPacketDispatched: (frame: CANFrame) => void;
  onAlertTriggered: (message: string, type: 'error' | 'warning' | 'info') => void;
  lastInjectedPacket?: CANFrame | null;
  selectedCarModel: CarModel;
  muteBackgroundSpawning?: boolean;
}

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  life: number;

  constructor(x: number, y: number, color: string) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 4;
    this.vy = (Math.random() - 0.5) * 4;
    this.color = color;
    this.alpha = 1.0;
    this.life = 30 + Math.random() * 20;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.alpha = Math.max(0, this.alpha - 1 / this.life);
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class VisualPacket {
  id: string;
  type: AnomalyType;
  x: number;
  y: number;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  progress: number; // 0.0 to 1.0
  speed: number;
  payload: string[];
  entropy: number;
  width: number;
  height: number;
  jitterY: number;
  sourceNode: string;
  destNode: string;

  constructor(
    id: string,
    type: AnomalyType,
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
    speed: number,
    payload: string[],
    entropy: number,
    sourceNode: string,
    destNode: string
  ) {
    this.id = id;
    this.type = type;
    this.sourceX = sourceX;
    this.sourceY = sourceY;
    this.targetX = targetX;
    this.targetY = targetY;
    this.x = sourceX;
    this.y = sourceY;
    this.speed = speed;
    this.progress = 0;
    this.payload = payload;
    this.entropy = entropy;
    this.width = type === 'DOS' ? 55 : 85;
    this.height = 28;
    this.jitterY = 0;
    this.sourceNode = sourceNode;
    this.destNode = destNode;
  }

  update(multiplier: number, centerY: number) {
    // Distance along 3 segments:
    // 1. Vertical stub from sourceY to centerY
    // 2. Horizontal bus from sourceX to targetX
    // 3. Vertical stub from centerY to targetY
    const d1 = Math.abs(centerY - this.sourceY);
    const d2 = Math.abs(this.targetX - this.sourceX);
    const d3 = Math.abs(this.targetY - centerY);
    const totalDistance = d1 + d2 + d3 || 1;

    // Step size matches speed multiplier
    const step = (this.speed * multiplier * 2) / (totalDistance || 1);
    this.progress = Math.min(1.0, this.progress + step);

    const p1 = d1 / totalDistance;
    const p2 = (d1 + d2) / totalDistance;

    if (this.progress <= p1) {
      // Stub descent/ascent
      const segProgress = this.progress / (p1 || 1);
      this.x = this.sourceX;
      this.y = this.sourceY + (centerY - this.sourceY) * segProgress;
    } else if (this.progress <= p2) {
      // Main Bus traversal
      const segProgress = (this.progress - p1) / ((p2 - p1) || 1);
      this.x = this.sourceX + (this.targetX - this.sourceX) * segProgress;
      this.y = centerY;
    } else {
      // Stub ascent/descent to target
      const segProgress = (this.progress - p2) / ((1.0 - p2) || 1);
      this.x = this.targetX;
      this.y = centerY + (this.targetY - centerY) * segProgress;
    }

    if (this.type === 'FUZZ') {
      this.jitterY = (Math.random() - 0.5) * 5;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    
    // Set colors & glow based on type
    let strokeColor = 'rgba(16, 185, 129, 0.8)'; // Emerald
    let fillColor = 'rgba(16, 185, 129, 0.12)';
    let textColor = '#059669';
    let labelColor = 'rgba(16, 185, 129, 0.8)';

    if (this.type === 'DOS') {
      strokeColor = 'rgba(239, 68, 68, 0.9)'; // Red
      fillColor = 'rgba(220, 38, 38, 0.15)';
      textColor = '#dc2626';
      labelColor = 'rgba(220, 38, 38, 0.8)';
    } else if (this.type === 'SPOOF') {
      strokeColor = 'rgba(249, 115, 22, 0.9)'; // Orange
      fillColor = 'rgba(234, 88, 12, 0.15)';
      textColor = '#ea580c';
      labelColor = 'rgba(234, 88, 12, 0.8)';
    } else if (this.type === 'FUZZ') {
      strokeColor = 'rgba(168, 85, 247, 0.9)'; // Purple
      fillColor = 'rgba(147, 51, 234, 0.15)';
      textColor = '#9333ea';
      labelColor = 'rgba(147, 51, 234, 0.8)';
    }

    // Shadow glow
    ctx.shadowBlur = this.type === 'NORMAL' ? 4 : 10;
    ctx.shadowColor = strokeColor;

    // Card frame
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    
    const drawY = this.y + this.jitterY - this.height / 2;
    ctx.roundRect(this.x - this.width / 2, drawY, this.width, this.height, 4);
    ctx.fill();
    ctx.stroke();

    // Disable shadow for text to keep it crisp
    ctx.shadowBlur = 0;

    const isDark = document.documentElement.classList.contains('dark');
    const isMovingRight = this.targetX >= this.sourceX;
    const directionArrow = isMovingRight ? ' →' : ' ←';

    // Render ID
    ctx.fillStyle = isDark ? '#F1F5F9' : '#1e293b';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.id + directionArrow, this.x, drawY + 8);

    // Render payload hex bytes
    if (this.type !== 'DOS') {
      ctx.fillStyle = labelColor;
      ctx.font = '7.5px "JetBrains Mono", monospace';
      const hexStr = this.payload.slice(0, 4).join(' '); // first 4 bytes for brevity
      ctx.fillText(hexStr, this.x, drawY + 19);
    } else {
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 7px "JetBrains Mono", monospace';
      ctx.fillText('HIGH PRIO', this.x, drawY + 19);
    }

    ctx.restore();
  }

  isFinished(): boolean {
    return this.progress >= 1.0;
  }
}

export default function BusTopology({
  currentMode,
  isPaused,
  packetSpeedMultiplier,
  onPacketDispatched,
  onAlertTriggered,
  lastInjectedPacket,
  selectedCarModel,
  muteBackgroundSpawning = false,
}: BusTopologyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Real layout dimensions via ResizeObserver to fix pixelation
  const [dimensions, setDimensions] = useState({ width: 800, height: 260 });
  const dimensionsRef = useRef(dimensions);
  useEffect(() => {
    dimensionsRef.current = dimensions;
  }, [dimensions]);

  // Refs to avoid closing over stale state in requestAnimationFrame loop
  const currentModeRef = useRef(currentMode);
  const isPausedRef = useRef(isPaused);
  const speedRef = useRef(packetSpeedMultiplier);
  const onPacketDispatchedRef = useRef(onPacketDispatched);
  const selectedCarModelRef = useRef(selectedCarModel);
  const muteRef = useRef(muteBackgroundSpawning);

  // Active items
  const packetsRef = useRef<VisualPacket[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const frameCountRef = useRef(0);

  // Sync state variables to refs
  useEffect(() => { currentModeRef.current = currentMode; }, [currentMode]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { speedRef.current = packetSpeedMultiplier; }, [packetSpeedMultiplier]);
  useEffect(() => { onPacketDispatchedRef.current = onPacketDispatched; }, [onPacketDispatched]);
  useEffect(() => { selectedCarModelRef.current = selectedCarModel; }, [selectedCarModel]);
  useEffect(() => { muteRef.current = muteBackgroundSpawning; }, [muteBackgroundSpawning]);

  // Helper to resolve physical nodes' actual canvas coordinate points
  const getECUNodeCoords = (labelOrId: string) => {
    const clean = labelOrId.toLowerCase();
    const model = selectedCarModelRef.current;
    
    // Find matching active node
    const node = model.nodes.find(
      n => n.id.toLowerCase() === clean || 
           n.label.toLowerCase() === clean || 
           clean.includes(n.id.toLowerCase()) || 
           clean.includes(n.label.toLowerCase())
    );

    const startX = 140;
    const endX = dimensionsRef.current.width - 140;
    const centerY = dimensionsRef.current.height / 2;

    if (node) {
      return {
        x: startX + (endX - startX) * node.xFactor,
        y: centerY + node.y
      };
    }

    // Special handles for attackers or external injection nodes
    if (clean.includes('malicious') || clean.includes('0x00') || clean.includes('tool')) {
      return { x: startX - 50, y: centerY };
    }

    // Fallback: use Gateway node location
    const gatewayNode = model.nodes.find(n => n.highlight);
    if (gatewayNode) {
      return {
        x: startX + (endX - startX) * gatewayNode.xFactor,
        y: centerY + gatewayNode.y
      };
    }

    return { x: startX, y: centerY };
  };

  // Monitor resize to draw highly crisp canvases on different screen sizes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (width && height) {
        setDimensions({ width, height });
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Listen for dynamic CAN packet events (custom DOM event to bypass React batching)
  useEffect(() => {
    const handlePacketEvent = (e: Event) => {
      const customEvent = e as CustomEvent<CANFrame>;
      const packet = customEvent.detail;
      if (!packet) return;

      const srcCoords = getECUNodeCoords(packet.source);
      const destCoords = getECUNodeCoords(packet.destination);

      let pSpeed = 2.5;
      if (packet.anomalyType === 'DOS') pSpeed = 6.0;
      if (packet.anomalyType === 'FUZZ') pSpeed = 3.8;
      if (packet.anomalyType === 'SPOOF') pSpeed = 4.5;

      const newVisualPacket = new VisualPacket(
        packet.id,
        packet.anomalyType,
        srcCoords.x,
        srcCoords.y,
        destCoords.x,
        destCoords.y,
        pSpeed,
        packet.data,
        packet.entropy,
        packet.source,
        packet.destination
      );

      packetsRef.current.push(newVisualPacket);
    };

    window.addEventListener('can-packet', handlePacketEvent);
    return () => {
      window.removeEventListener('can-packet', handlePacketEvent);
    };
  }, []);

  // Main animation ticker loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const tick = () => {
      // Handle High-DPI physical scaling dynamically
      const dpr = window.devicePixelRatio || 1;
      const logicalWidth = dimensions.width;
      const logicalHeight = dimensions.height;

      // Adjust canvas physical buffer size if needed
      if (canvas.width !== dimensions.width * dpr || canvas.height !== dimensions.height * dpr) {
        canvas.width = dimensions.width * dpr;
        canvas.height = dimensions.height * dpr;
      }

      ctx.save();
      // Scale coordinates: map to DPR only to prevent stretching / aspect ratio issues
      ctx.scale(dpr, dpr);

      const isDark = document.documentElement.classList.contains('dark');

      // Clear layout
      ctx.fillStyle = isDark ? '#0F172A' : '#FFFFFF';
      ctx.fillRect(0, 0, logicalWidth, logicalHeight);

      // Draw modern dot grid backdrop
      ctx.fillStyle = isDark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.12)';
      const dotSpacing = 20;
      for (let gx = 0; gx < logicalWidth; gx += dotSpacing) {
        for (let gy = 0; gy < logicalHeight; gy += dotSpacing) {
          ctx.beginPath();
          ctx.arc(gx, gy, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const startX = 140;
      const endX = logicalWidth - 140;
      const centerY = logicalHeight / 2;

      // Draw unshielded twisted pair CAN High and CAN Low physical rails
      ctx.save();
      
      // CAN High (Green-ish line representing dynamic signal differential)
      ctx.strokeStyle = isDark ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.22)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(startX, centerY - 6);
      ctx.lineTo(endX, centerY - 6);
      ctx.stroke();

      // CAN Low (Blue-ish line)
      ctx.strokeStyle = isDark ? 'rgba(59, 130, 246, 0.35)' : 'rgba(59, 130, 246, 0.22)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(startX, centerY + 6);
      ctx.lineTo(endX, centerY + 6);
      ctx.stroke();
      
      ctx.restore();

      // Draw 120-Ohm end-to-end Termination Resistors
      const drawResistor = (rx: number, label: string) => {
        ctx.save();
        ctx.fillStyle = isDark ? '#1E293B' : '#F8FAFC';
        ctx.strokeStyle = isDark ? '#334155' : '#E2E8F0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(rx - 15, centerY - 15, 30, 30, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isDark ? '#F1F5F9' : '#475569';
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('120 Ω', rx, centerY - 2);
        ctx.fillStyle = isDark ? '#64748B' : '#94a3b8';
        ctx.font = '7px sans-serif';
        ctx.fillText(label, rx, centerY + 8);
        ctx.restore();
      };

      drawResistor(startX - 25, 'TERM_L');
      drawResistor(endX + 25, 'TERM_R');

      // Draw all ECUs dynamically configured for this specific vehicle profile
      const nodes = selectedCarModelRef.current.nodes.map((node) => ({
        id: node.id,
        label: node.label,
        x: startX + (endX - startX) * node.xFactor,
        y: centerY + node.y,
        color: node.color,
        active: node.active,
        highlight: node.highlight
      }));

      nodes.forEach((node) => {
        // Connection stub
        ctx.save();
        ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.4)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(node.x, centerY);
        ctx.stroke();
        ctx.restore();

        // Node container
        ctx.save();
        ctx.font = 'bold 8.5px "Inter", sans-serif';
        const labelWidth = ctx.measureText(node.label).width;
        const boxWidth = Math.max(115, Math.ceil(labelWidth) + 20);
        const boxHeight = 38;
        
        ctx.fillStyle = isDark ? '#1E293B' : '#FFFFFF';
        
        if (node.highlight) {
          ctx.strokeStyle = currentModeRef.current === 'NORMAL' 
            ? '#10b981' // Green
            : currentModeRef.current === 'DOS' 
              ? '#ef4444' // Red
              : currentModeRef.current === 'SPOOF'
                ? '#f97316' // Orange
                : '#a855f7'; // Purple
          ctx.lineWidth = 2;
          ctx.shadowBlur = 8;
          ctx.shadowColor = ctx.strokeStyle;
        } else {
          ctx.strokeStyle = isDark ? '#334155' : '#CBD5E1';
          ctx.lineWidth = 1;
        }

        ctx.beginPath();
        ctx.roundRect(node.x - boxWidth / 2, node.y - boxHeight / 2, boxWidth, boxHeight, 6);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;
        
        // Brand/Node Indicator Dot
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(node.x - boxWidth / 2 + 10, node.y - boxHeight / 2 + 10, 3, 0, Math.PI * 2);
        ctx.fill();

        // Node ID label
        ctx.fillStyle = isDark ? '#64748B' : '#94a3b8';
        ctx.font = 'bold 6.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(node.id.toUpperCase(), node.x - boxWidth / 2 + 16, node.y - boxHeight / 2 + 12);

        // Node Label Description
        ctx.fillStyle = isDark ? '#F1F5F9' : '#1e293b';
        ctx.font = 'bold 8.5px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.label, node.x, node.y + 1);

        // Subtext / Action State indicator
        ctx.font = '7.5px "JetBrains Mono", monospace';
        if (node.highlight) {
          if (currentModeRef.current === 'NORMAL') {
            ctx.fillStyle = '#059669';
            ctx.fillText('IDS: ARMED', node.x, node.y + 11);
          } else if (currentModeRef.current === 'DOS') {
            ctx.fillStyle = '#dc2626';
            ctx.fillText('ALERT: FLOOD', node.x, node.y + 11);
          } else if (currentModeRef.current === 'SPOOF') {
            ctx.fillStyle = '#ea580c';
            ctx.fillText('ALERT: SPOOF', node.x, node.y + 11);
          } else {
            ctx.fillStyle = '#7c3aed';
            ctx.fillText('ALERT: FUZZ', node.x, node.y + 11);
          }
        } else {
          ctx.fillStyle = isDark ? '#94A3B8' : '#64748b';
          ctx.fillText('ACTIVE', node.x, node.y + 11);
        }
        ctx.restore();
      });

      // Update and draw floating impact sparks
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        p.draw(ctx);
        if (p.alpha <= 0) {
          particles.splice(i, 1);
        }
      }

      // Spawn packets if not paused
      if (!isPausedRef.current) {
        frameCountRef.current++;
        
        let spawnRate = 35;
        if (currentModeRef.current === 'DOS') spawnRate = 10;
        if (currentModeRef.current === 'FUZZ') spawnRate = 15;
        if (currentModeRef.current === 'SPOOF') spawnRate = 18;

        if (frameCountRef.current >= spawnRate) {
          frameCountRef.current = 0;

          if (!muteRef.current) {
            let spawnType: AnomalyType = 'NORMAL';
            if (currentModeRef.current === 'DOS') {
              spawnType = Math.random() > 0.08 ? 'DOS' : 'NORMAL';
            } else if (currentModeRef.current === 'FUZZ') {
              spawnType = Math.random() > 0.18 ? 'FUZZ' : 'NORMAL';
            } else if (currentModeRef.current === 'SPOOF') {
              spawnType = Math.random() > 0.35 ? 'SPOOF' : 'NORMAL';
            }

            let srcNode = '';
            let destNode = '';
            let pId = '';
            let pPayload: string[] = [];

            const model = selectedCarModelRef.current;

            if (spawnType === 'FUZZ') {
              const ecuLabels = model.nodes.map(n => n.label);
              srcNode = ecuLabels[Math.floor(Math.random() * ecuLabels.length)];
              const otherEcus = ecuLabels.filter(n => n !== srcNode);
              destNode = otherEcus[Math.floor(Math.random() * otherEcus.length)] || 'Broadcast';
              pId = generateArbitrationID('FUZZ');
              pPayload = generateFuzzedPayload(8);
            } else if (spawnType === 'DOS') {
              srcNode = 'Malicious Injection Tool';
              const targets = model.nodes.filter(n => !n.highlight).map(n => n.label);
              destNode = targets[Math.floor(Math.random() * targets.length)] || 'Broadcast';
              pId = '0x000';
              pPayload = ['00', '00', '00', '00', '00', '00', '00', '00'];
            } else if (spawnType === 'SPOOF') {
              const signalsList = model.signals;
              const signal = signalsList[Math.floor(Math.random() * signalsList.length)];
              pId = signal.id;
              srcNode = signal.source + ' (Spoofed)';
              destNode = signal.destination;
              pPayload = generateSpoofedPayload(signal.id, Date.now());
            } else {
              const signalsList = model.signals;
              const signal = signalsList[Math.floor(Math.random() * signalsList.length)];
              pId = signal.id;
              srcNode = signal.source;
              destNode = signal.destination;
              pPayload = signal.generatePayload(Date.now());
            }

            const entropy = calculateShannonEntropy(pPayload);

            const srcCoords = getECUNodeCoords(srcNode);
            const destCoords = getECUNodeCoords(destNode);

            let pSpeed = 2.5;
            if (spawnType === 'DOS') pSpeed = 4.0;
            if (spawnType === 'FUZZ') pSpeed = 3.0;
            if (spawnType === 'SPOOF') pSpeed = 3.5;

            const newVisualPacket = new VisualPacket(
              pId,
              spawnType,
              srcCoords.x,
              srcCoords.y,
              destCoords.x,
              destCoords.y,
              pSpeed,
              pPayload,
              entropy,
              srcNode,
              destNode
            );

            packetsRef.current.push(newVisualPacket);

            // Dispatch packet to dashboard
            const frame: CANFrame = {
              timestamp: Date.now(),
              id: pId,
              dlc: pPayload.length,
              data: pPayload,
              entropy: entropy,
              isAnomalous: spawnType !== 'NORMAL',
              anomalyType: spawnType,
              source: srcNode,
              destination: destNode,
            };
            onPacketDispatchedRef.current(frame);
          }
        }
      }

      // Draw and progress packets
      const packets = packetsRef.current;
      const speedMultiplier = speedRef.current;

      for (let i = packets.length - 1; i >= 0; i--) {
        const p = packets[i];
        
        if (!isPausedRef.current) {
          p.update(speedMultiplier, centerY);
        }
        
        p.draw(ctx);

        if (p.isFinished()) {
          // Explode particles inside the target node box
          let pColor = '#10b981';
          if (p.type === 'DOS') pColor = '#ef4444';
          if (p.type === 'FUZZ') pColor = '#a855f7';
          if (p.type === 'SPOOF') pColor = '#f97316';

          for (let k = 0; k < 12; k++) {
            particlesRef.current.push(new Particle(p.targetX, p.targetY, pColor));
          }

          packets.splice(i, 1);
        }
      }

      ctx.restore();
      animationId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [dimensions]);

  return (
    <div className="flex-1 flex flex-col relative" id="live-can-bus-pipeline-card">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 pt-4 border-b border-slate-200 pb-2 select-none">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-700 font-display tracking-wider flex items-center gap-1.5 uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
            Live CAN Bus Pipeline
          </h2>
          <div className="text-[10px] text-slate-450 font-mono flex gap-3">
            <span>Speed: {packetSpeedMultiplier.toFixed(1)}x</span>
            <span>Baudrate: {selectedCarModel.baudRate}</span>
          </div>
        </div>

        <div className="flex gap-2 items-center select-none shrink-0">
          {isPaused && (
            <span className="px-2 py-0.5 bg-yellow-50 text-yellow-700 border border-yellow-200 text-[10px] font-mono rounded uppercase">
              TRANSMISSION PAUSED
            </span>
          )}
          <span
            className={`px-3 py-1 font-mono text-xs font-semibold rounded border transition-all duration-300 flex items-center gap-1.5 ${
              currentMode === 'NORMAL'
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200 shadow-sm'
                : currentMode === 'DOS'
                ? 'bg-red-50 text-red-600 border-red-200 animate-pulse shadow-sm'
                : currentMode === 'SPOOF'
                ? 'bg-orange-50 text-orange-600 border-orange-200 animate-pulse shadow-sm'
                : 'bg-purple-50 text-purple-600 border-purple-200 shadow-sm'
            }`}
          >
            {currentMode === 'NORMAL' && (
              <>
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> SYSTEM SECURE
              </>
            )}
            {currentMode === 'DOS' && (
              <>
                <ShieldAlert className="h-3.5 w-3.5 text-red-500" /> CRITICAL: DOS FLOOD DETECTED
              </>
            )}
            {currentMode === 'SPOOF' && (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-orange-500" /> WARNING: SPOOFING DETECTED
              </>
            )}
            {currentMode === 'FUZZ' && (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-purple-500" /> WARNING: FUZZING ENTROPY ALERT
              </>
            )}
          </span>
        </div>
      </div>

      {/* Resize container element */}
      <div ref={containerRef} className="relative bg-white rounded-b-xl overflow-hidden w-full h-[260px]">
        {/* Dynamic Canvas element */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-crosshair"
        />

        {/* Labels on corners */}
        <div className="absolute left-4 top-4 pointer-events-none select-none">
          <p className="text-[9px] font-mono text-slate-400 uppercase">Input Terminal</p>
          <p className="text-xs font-semibold text-slate-500 font-display">ECU Sender Bus</p>
        </div>
        <div className="absolute right-4 top-4 pointer-events-none select-none text-right">
          <p className="text-[9px] font-mono text-slate-400 uppercase">Receiving Bus</p>
          <p className="text-xs font-semibold text-slate-500 font-display">IDS Security Gateway</p>
        </div>
      </div>
    </div>
  );
}
