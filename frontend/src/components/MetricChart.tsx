import React, { useEffect, useRef, useState } from 'react';

const CHART_DIMENSIONS = { width: 350, height: 140 };

interface MetricChartProps {
  data: number[];
  title: string;
  subtitle?: string;
  unit: string;
  threshold: number;
  color: string;
  maxVal: number;
  tripwireType: 'frequency' | 'entropy';
}

export default function MetricChart({
  data,
  title,
  subtitle,
  unit,
  threshold,
  color,
  maxVal,
  tripwireType,
}: MetricChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  // Drawing Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = CHART_DIMENSIONS;
    ctx.clearRect(0, 0, width, height);

    // Padding parameters
    const padLeft = 45;
    const padRight = 15;
    const padTop = 15;
    const padBottom = 25;

    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    const isDark = document.documentElement.classList.contains('dark');

    // Draw background grid
    ctx.strokeStyle = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.6)'; // Clean grid
    ctx.lineWidth = 1;
    
    // Horizontal grid lines
    const gridRows = 4;
    for (let i = 0; i <= gridRows; i++) {
      const y = padTop + (chartH / gridRows) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();

      // Grid Y labels
      ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const val = maxVal - (maxVal / gridRows) * i;
      ctx.fillText(val.toFixed(tripwireType === 'entropy' ? 1 : 0), padLeft - 6, y);
    }

    // Vertical grid lines (simulated sliding columns)
    const gridCols = 6;
    for (let i = 0; i <= gridCols; i++) {
      const x = padLeft + (chartW / gridCols) * i;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, height - padBottom);
      ctx.stroke();
    }

    // Label bottom X axis
    ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('PAST 5 SECONDS', padLeft, height - padBottom + 12);
    ctx.textAlign = 'right';
    ctx.fillText('LIVE NETWORK STREAM', width - padRight, height - padBottom + 12);

    if (data.length < 2) return;

    // Map points to canvas coordinates
    const points = data.map((val, idx) => {
      const x = padLeft + (chartW / (data.length - 1)) * idx;
      const normalizedY = Math.min(1, Math.max(0, val / maxVal));
      const y = height - padBottom - chartH * normalizedY;
      return { x, y, value: val };
    });

    // Draw tripwire threshold line (dashed line)
    const thresholdNorm = Math.min(1, Math.max(0, threshold / maxVal));
    const thresholdY = height - padBottom - chartH * thresholdNorm;
    
    ctx.save();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; // bright red
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padLeft, thresholdY);
    ctx.lineTo(width - padRight, thresholdY);
    ctx.stroke();
    ctx.restore();

    // Draw tripwire indicator tag
    ctx.save();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(width - padRight - 65, thresholdY - 14, 65, 12, 3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 7px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`TRIPWIRE: ${threshold} ${unit}`, width - padRight - 32, thresholdY - 8);
    ctx.restore();

    // Draw Fill Area under the curve
    ctx.save();
    const fillGrad = ctx.createLinearGradient(0, padTop, 0, height - padBottom);
    fillGrad.addColorStop(0, `${color}15`); // semi-transparent
    fillGrad.addColorStop(1, `${color}00`); // transparent
    ctx.fillStyle = fillGrad;
    
    ctx.beginPath();
    ctx.moveTo(points[0].x, height - padBottom);
    
    // Draw Bezier or segment paths
    for (let i = 0; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.lineTo(points[points.length - 1].x, height - padBottom);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Draw main sparkline
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0; // Disable heavy glow for Clean SaaS professional look
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.restore();

    // If hovering, draw crosshairs and tooltip
    if (hoverIndex !== null && hoverIndex < points.length) {
      const pt = points[hoverIndex];
      
      ctx.save();
      // Draw vertical alignment line
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(pt.x, padTop);
      ctx.lineTo(pt.x, height - padBottom);
      ctx.stroke();

      // Draw point dot
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 4;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

  }, [data, maxVal, threshold, color, tripwireType, unit, hoverIndex]);

  // Handle Mouse Hover Interactions
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const rect = canvas.getBoundingClientRect();
    const mouseXOnScreen = e.clientX - rect.left;
    const mouseYOnScreen = e.clientY - rect.top;

    const padLeft = 45;
    const padRight = 15;
    const chartW = CHART_DIMENSIONS.width - padLeft - padRight;

    // Scale on-screen coordinates to canvas internal coordinates
    const mouseX = (mouseXOnScreen / (rect.width || 1)) * CHART_DIMENSIONS.width;

    if (mouseX >= padLeft && mouseX <= CHART_DIMENSIONS.width - padRight) {
      const indexFraction = (mouseX - padLeft) / chartW;
      const index = Math.min(
        data.length - 1,
        Math.max(0, Math.round(indexFraction * (data.length - 1)))
      );
      
      setHoverIndex(index);
      setHoverPos({ x: mouseXOnScreen, y: mouseYOnScreen });
    } else {
      setHoverIndex(null);
    }
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const currentValue = data[data.length - 1] ?? 0;
  const isViolated = currentValue > threshold;

  return (
    <div
      className={`flex-1 min-h-[160px] bg-bento-card rounded-xl border p-4 flex flex-col relative transition-all duration-300 ${
        isViolated 
          ? 'border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20' 
          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-950 shadow-sm'
      }`}
    >
      <div className="flex justify-between items-start mb-2 select-none">
        <div>
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200 font-display tracking-wider flex items-center gap-1.5 uppercase">
            {title}
            {isViolated && (
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"></span>
            )}
          </h3>
          {subtitle && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-sans tracking-wide leading-none mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="text-right">
          <span className={`text-base font-bold font-mono ${isViolated ? 'text-red-500' : 'text-slate-800 dark:text-slate-100'}`}>
            {currentValue.toFixed(tripwireType === 'entropy' ? 3 : 0)}
          </span>
          <span className="text-[9px] text-slate-400 font-mono ml-1 uppercase">{unit}</span>
        </div>
      </div>
 
      <div className="relative w-full aspect-[350/140] mt-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={350}
          height={140}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="absolute inset-0 w-full h-full cursor-crosshair"
        />
 
        {/* Floating Tooltip inside container */}
        {hoverIndex !== null && hoverIndex < data.length && (
          <div
            className="absolute z-10 pointer-events-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded-lg shadow-md text-[9px] font-mono flex flex-col gap-0.5"
            style={{
              left: `${Math.min((canvasRef.current?.getBoundingClientRect().width || 350) - 105, Math.max(50, hoverPos.x - 50))}px`,
              top: `${Math.max(5, hoverPos.y - 45)}px`,
            }}
          >
            <span className="text-slate-400 dark:text-slate-500 uppercase tracking-widest text-[8px]">Readout</span>
            <span className="text-slate-800 dark:text-slate-200 font-bold">
              {data[hoverIndex].toFixed(tripwireType === 'entropy' ? 4 : 1)} {unit}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
