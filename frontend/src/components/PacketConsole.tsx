import { useEffect, useRef, useState } from 'react';
import { CANFrame } from '../types';
import { Search, ShieldAlert, ShieldCheck, Terminal, Trash2, Clock, RefreshCw, X, Activity, Layers, Download } from 'lucide-react';

interface PacketConsoleProps {
  packets: CANFrame[];
  onClearConsole: () => void;
}

export default function PacketConsole({ packets, onClearConsole }: PacketConsoleProps) {
  const [filterType, setFilterType] = useState<'all' | 'safe' | 'anomalous'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedFrame, setSelectedFrame] = useState<CANFrame | null>(null);

  const exportPackets = (format: 'csv' | 'json') => {
    if (packets.length === 0) return;

    let content = '';
    let mimeType = '';
    let fileName = `can_bus_log_${Date.now()}`;

    if (format === 'json') {
      content = JSON.stringify(packets, null, 2);
      mimeType = 'application/json';
      fileName += '.json';
    } else {
      // CSV Headers
      const headers = [
        'Timestamp',
        'Arb_ID',
        'DLC',
        'Payload',
        'Entropy',
        'Is_Anomalous',
        'Anomaly_Type',
        'Source',
        'Destination',
        'IAT_ms',
        'Jitter_ms',
        'Freq_Hz',
        'Hamming_Distance'
      ];
      const rows = packets.map((p) => [
        p.timestamp,
        p.id,
        p.dlc,
        p.data.join(' '),
        p.entropy,
        p.isAnomalous ? 'TRUE' : 'FALSE',
        p.anomalyType,
        p.source,
        p.destination,
        p.iat ?? 0,
        p.jitter ?? 0,
        p.messageFrequency ?? 0,
        p.payloadHammingDist ?? 0
      ]);
      content = [
        headers.join(','),
        ...rows.map((r) =>
          r
            .map((val) => {
              const strVal = String(val);
              if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
                return `"${strVal.replace(/"/g, '""')}"`;
              }
              return strVal;
            })
            .join(',')
        )
      ].join('\n');
      mimeType = 'text/csv';
      fileName += '.csv';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Clear selected frame if logs are wiped
  useEffect(() => {
    if (packets.length === 0) {
      setSelectedFrame(null);
    }
  }, [packets]);

  // Auto Scroll logic
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [packets, autoScroll]);

  // Handle user manual scroll to disable auto-scroll
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    // Check if user has scrolled away from bottom
    const isAtBottom = 
      container.scrollHeight - container.scrollTop - container.clientHeight < 30;
    
    if (isAtBottom) {
      setAutoScroll(true);
    } else {
      // User scrolled up, don't force snap them down
      if (autoScroll) setAutoScroll(false);
    }
  };

  const filteredPackets = packets.filter((p) => {
    // Type filter
    if (filterType === 'safe' && p.isAnomalous) return false;
    if (filterType === 'anomalous' && !p.isAnomalous) return false;

    // Search query filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchId = p.id.toLowerCase().includes(q);
      const matchSource = p.source.toLowerCase().includes(q);
      const matchData = p.data.join(' ').toLowerCase().includes(q);
      return matchId || matchSource || matchData;
    }

    return true;
  });

  return (
    <div className="flex-1 bg-bento-card border border-slate-200 rounded-xl overflow-hidden flex flex-col h-full shadow-sm">
      {/* Console Header */}
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-slate-700 tracking-wide font-mono">
            GATEWAY_IDS_CONSOLE.log
          </h2>
          <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 text-slate-600 font-mono rounded">
            {filteredPackets.length} items
          </span>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search box */}
          <div className="relative">
            <input
              type="text"
              placeholder="Filter by ID/Payload..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-2 py-1 bg-white border border-slate-200 focus:border-slate-400 rounded text-xs font-mono text-slate-700 focus:outline-none w-44"
            />
            <Search className="h-3 w-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          </div>

          {/* Filter selectors */}
          <div className="flex bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-0.5 rounded text-xs font-mono">
            <button
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-0.5 rounded transition-all cursor-pointer ${
                filterType === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm border border-slate-200/50 dark:border-slate-700'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100'
              }`}
            >
              ALL
            </button>
            <button
              onClick={() => setFilterType('safe')}
              className={`px-2.5 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer ${
                filterType === 'safe'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-450 border border-emerald-200 dark:border-emerald-900/50 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100'
              }`}
            >
              <ShieldCheck className="h-3 w-3" />
              SAFE
            </button>
            <button
              onClick={() => setFilterType('anomalous')}
              className={`px-2.5 py-0.5 rounded transition-all flex items-center gap-1 cursor-pointer ${
                filterType === 'anomalous'
                  ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-450 border border-red-200 dark:border-red-900/50 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100'
              }`}
            >
              <ShieldAlert className="h-3 w-3" />
              THREATS
            </button>
          </div>

          {/* Export buttons */}
          <div className="flex gap-1 pr-1 border-r border-slate-200 dark:border-slate-700">
            <button
              onClick={() => exportPackets('csv')}
              title="Export current buffer as CSV"
              disabled={packets.length === 0}
              className="px-2 py-1 text-[10px] font-mono font-bold text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-450 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-3 w-3" />
              CSV
            </button>
            <button
              onClick={() => exportPackets('json')}
              title="Export current buffer as JSON"
              disabled={packets.length === 0}
              className="px-2 py-1 text-[10px] font-mono font-bold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-3 w-3" />
              JSON
            </button>
          </div>

          {/* Clear button */}
          <button
            onClick={onClearConsole}
            title="Clear Log"
            className="p-1 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded transition-all border border-slate-200 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Grid Header */}
      <div className="grid grid-cols-12 gap-2 bg-slate-50 px-4 py-1.5 border-b border-slate-200 text-[10px] font-mono text-slate-400 uppercase select-none tracking-wider">
        <div className="col-span-2">TIMESTAMP</div>
        <div className="col-span-2">ARB_ID</div>
        <div className="col-span-1">DLC</div>
        <div className="col-span-3">PAYLOAD (HEX)</div>
        <div className="col-span-1 text-center">ENTROPY</div>
        <div className="col-span-2">NODES (S → D)</div>
        <div className="col-span-1 text-right">STATUS</div>
      </div>

      {/* Split layout: List on left, details on right if selected */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        {/* Logs Scroll container */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto max-h-[360px] min-h-[160px] font-mono text-xs text-slate-600 custom-scrollbar divide-y divide-slate-100"
        >
          {filteredPackets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-1.5">
              <Terminal className="h-8 w-8 opacity-40 text-slate-400" />
              <span className="text-sm">No packets match filter parameters</span>
              <span className="text-[10px] opacity-75">Waiting for live transmission stream...</span>
            </div>
          ) : (
            filteredPackets.map((p, idx) => {
              const timeStr = new Date(p.timestamp).toLocaleTimeString() + '.' + String(p.timestamp % 1000).padStart(3, '0');

              // Format Entropy colors
              let entropyColor = 'text-slate-400';
              if (p.entropy > 2.0) entropyColor = 'text-purple-600 font-bold';
              else if (p.entropy > 1.0) entropyColor = 'text-slate-500';
              else entropyColor = 'text-emerald-600';

              const isThisSelected = selectedFrame === p;

              return (
                <div
                  key={p.timestamp + '-' + idx}
                  onClick={() => setSelectedFrame(isThisSelected ? null : p)}
                  className={`grid grid-cols-12 gap-2 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all items-center cursor-pointer select-none ${
                    isThisSelected
                      ? 'bg-sky-50/55 dark:bg-sky-950/20 border-l-2 border-l-sky-500'
                      : p.isAnomalous
                      ? p.anomalyType === 'DOS'
                        ? 'bg-red-50/40 dark:bg-red-950/20 border-l-2 border-l-red-500'
                        : p.anomalyType === 'SPOOF'
                        ? 'bg-amber-50/40 dark:bg-amber-950/20 border-l-2 border-l-amber-500'
                        : 'bg-purple-50/40 dark:bg-purple-950/20 border-l-2 border-l-purple-500'
                      : 'border-l-2 border-l-transparent'
                  }`}
                >
                  {/* Timestamp */}
                  <div className="col-span-2 text-slate-400 tabular-nums">
                    {timeStr}
                  </div>

                  {/* ID */}
                  <div className="col-span-2">
                    <span
                      className={`font-semibold px-1.5 py-0.5 rounded ${
                        p.anomalyType === 'DOS'
                          ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-450 border border-red-200 dark:border-red-900/50'
                          : p.anomalyType === 'SPOOF'
                          ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-450 border border-amber-200 dark:border-amber-900/50'
                          : p.anomalyType === 'FUZZ'
                          ? 'bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-450 border border-purple-200 dark:border-purple-900/50'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {p.id}
                    </span>
                  </div>

                  {/* DLC */}
                  <div className="col-span-1 text-slate-500 text-center sm:text-left">{p.dlc}</div>

                  {/* Payload Hex */}
                  <div className="col-span-3 tracking-widest uppercase font-semibold text-slate-700 break-all select-all">
                    {p.data.join(' ')}
                  </div>

                  {/* Entropy */}
                  <div className={`col-span-1 text-center font-semibold ${entropyColor}`}>
                    {p.entropy.toFixed(3)}
                  </div>

                  {/* Source -> Destination */}
                  <div className="col-span-2 text-[10px] text-slate-500 leading-tight">
                    <span className="block truncate font-medium">{p.source}</span>
                    <span className="block text-slate-400 font-mono truncate">➔ {p.destination}</span>
                  </div>

                  {/* Anomaly Badge */}
                  <div className="col-span-1 text-right">
                    {p.anomalyType === 'NORMAL' && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-450 border border-emerald-200 dark:border-emerald-900/50 text-[9px] font-bold">
                        SAFE
                      </span>
                    )}
                    {p.anomalyType === 'DOS' && (
                      <span className="px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-450 border border-red-200 dark:border-red-900/50 text-[9px] font-bold animate-pulse">
                        FLOOD
                      </span>
                    )}
                    {p.anomalyType === 'SPOOF' && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-450 border border-amber-200 dark:border-amber-900/50 text-[9px] font-bold animate-pulse">
                        SPOOF
                      </span>
                    )}
                    {p.anomalyType === 'FUZZ' && (
                      <span className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-450 border border-purple-200 dark:border-purple-900/50 text-[9px] font-bold">
                        FUZZ
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={consoleEndRef} />
        </div>

        {/* Right Details Container: Advanced Telemetry Insights */}
        {selectedFrame && (
          <div className="w-full md:w-[320px] bg-slate-50 border-t md:border-t-0 md:border-l border-slate-200 p-4 overflow-y-auto flex flex-col gap-4 text-xs font-sans">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-200 pb-2.5">
              <div>
                <h3 className="text-xs font-bold font-mono text-emerald-600 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                  ID ANALYTICS INSPECTOR
                </h3>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                  ID: {selectedFrame.id} • {selectedFrame.source.split(' ')[0]}
                </p>
              </div>
              <button
                onClick={() => setSelectedFrame(null)}
                className="p-1 hover:bg-slate-200 rounded transition-colors text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Micro details */}
            <div className="grid grid-cols-2 gap-2 bg-white p-2.5 rounded-xl border border-slate-200 font-mono text-[10px] text-slate-500 leading-relaxed">
              <div>
                <span className="text-slate-400 block text-[9px] uppercase font-bold">Bus Status</span>
                <span className={selectedFrame.isAnomalous ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}>
                  {selectedFrame.isAnomalous ? "COMPROMISED" : "SECURE_OK"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9px] uppercase font-bold">Payload Size</span>
                <span className="text-slate-800 font-semibold">{selectedFrame.dlc} Bytes</span>
              </div>
              <div className="col-span-2 pt-1.5 border-t border-slate-200 mt-1">
                <span className="text-slate-400 block text-[9px] uppercase font-bold">Raw Hex Bytes</span>
                <span className="text-emerald-600 font-semibold tracking-wider text-[11px] select-all block uppercase font-mono mt-0.5">
                  {selectedFrame.data.join(' ')}
                </span>
              </div>
            </div>

            {/* 5 ADVANCED ENGINEERED FEATURES */}
            <div className="space-y-3.5 flex-1">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                🔬 Advanced Feature Analytics
              </span>

              {/* Feature 1: IAT */}
              <div className="space-y-1 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-700 font-mono font-medium flex items-center gap-1.5 text-[11px]">
                    <Clock className="h-3 w-3 text-sky-500" />
                    iat <span className="text-[9px] text-slate-450 font-normal">(Inter-Arrival)</span>
                  </span>
                  <span className="font-mono text-slate-800 font-semibold">{selectedFrame.iat !== undefined ? `${selectedFrame.iat} ms` : '0.00 ms'}</span>
                </div>
                <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden mt-1">
                  <div 
                    className="h-full bg-sky-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, ((selectedFrame.iat || 0) / 100) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 leading-normal font-sans">
                  Time elapsed since the previous message of the same CAN ID on this bus.
                </p>
              </div>

              {/* Feature 2: Jitter */}
              <div className="space-y-1 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-700 font-mono font-medium flex items-center gap-1.5 text-[11px]">
                    <Activity className="h-3 w-3 text-indigo-500" />
                    jitter <span className="text-[9px] text-slate-450 font-normal">(Clock Drift)</span>
                  </span>
                  <span className="font-mono text-slate-800 font-semibold">{selectedFrame.jitter !== undefined ? `${selectedFrame.jitter} ms` : '0.00 ms'}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-1">
                  <div 
                    className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, ((selectedFrame.jitter || 0) / 15) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 leading-normal font-sans">
                  Absolute difference between consecutive IATs. Spikes flag clock drift or malicious injection timing.
                </p>
              </div>

              {/* Feature 3: Global Bus Frequency */}
              <div className="space-y-1 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-700 font-mono font-medium flex items-center gap-1.5 text-[11px]">
                    <RefreshCw className="h-3 w-3 text-emerald-500" />
                    message_frequency
                  </span>
                  <span className="font-mono text-slate-800 font-semibold">{selectedFrame.messageFrequency !== undefined ? `${selectedFrame.messageFrequency} Hz` : '0 Hz'}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-1">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, ((selectedFrame.messageFrequency || 0) / 1200) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 leading-normal font-sans">
                  The global packet rate across the entire bus calculated using a rolling window of 50 packets.
                </p>
              </div>

              {/* Feature 4: Payload Entropy */}
              <div className="space-y-1 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-700 font-mono font-medium flex items-center gap-1.5 text-[11px]">
                    <ShieldCheck className="h-3 w-3 text-purple-500" />
                    payload_entropy
                  </span>
                  <span className="font-mono text-slate-800 font-semibold">{selectedFrame.payloadEntropy !== undefined ? `${selectedFrame.payloadEntropy.toFixed(3)} bits` : '0.000 bits'}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-1">
                  <div 
                    className="h-full bg-purple-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, ((selectedFrame.payloadEntropy || 0) / 3.0) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 leading-normal font-sans">
                  The Shannon Information Entropy of the 8 payload bytes. High values signify randomized fuzzing payloads.
                </p>
              </div>

              {/* Feature 5: Payload Hamming Distance */}
              <div className="space-y-1 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-700 font-mono font-medium flex items-center gap-1.5 text-[11px]">
                    <Layers className="h-3 w-3 text-pink-500" />
                    payload_hamming_dist
                  </span>
                  <span className="font-mono text-slate-800 font-semibold">{selectedFrame.payloadHammingDist !== undefined ? `${selectedFrame.payloadHammingDist} bits` : '0 bits'}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-1">
                  <div 
                    className="h-full bg-pink-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, ((selectedFrame.payloadHammingDist || 0) / 64) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 leading-normal font-sans">
                  Bit flip count between consecutive payloads of the same ID. High drift signals fast transition dynamics.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Auto-scroll toggle bottom indicator bar */}
      <div className="bg-slate-100 px-4 py-1.5 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-500">
        <button
          onClick={() => setAutoScroll((prev) => !prev)}
          className={`flex items-center gap-1.5 hover:text-slate-700 transition-colors cursor-pointer ${
            autoScroll ? 'text-emerald-600 font-semibold' : ''
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${autoScroll ? 'bg-emerald-600 animate-ping' : 'bg-slate-400'}`}
          ></span>
          Auto-Scroll: {autoScroll ? 'ENABLED' : 'PAUSED'}
        </button>
        <div>
          <span>IDS Version: v2.4.1</span>
        </div>
      </div>
    </div>
  );
}
