export interface ParsedCANFrame {
  timestamp: number; // relative milliseconds from start
  id: string;        // Hex ID, e.g. "0x1F2"
  dlc: number;       // Data Length Code
  data: string[];    // Array of hex bytes
  source?: string;
  destination?: string;
}

function isPotentialHexId(str: string): boolean {
  if (!str) return false;
  const s = str.trim();
  if (s.toUpperCase().startsWith('0X')) {
    return /^[0-9A-Fa-f]{1,8}$/.test(s.substring(2));
  }
  return /^[0-9A-Fa-f]{3,4}$/.test(s);
}

function getSourceForId(id: string): string {
  if (id === '0x1F2') return 'Engine ECU';
  if (id === '0x2C4') return 'Steering ECU';
  if (id === '0x3B6') return 'Battery BMS';
  return 'Diagnostic Tool';
}

function getDestForId(id: string): string {
  if (id === '0x1F2') return 'Brake ECU';
  if (id === '0x2C4') return 'Dashboard ECU';
  if (id === '0x3B6') return 'Dashboard ECU';
  return 'Broadcast';
}

function createFrameWithDefaultMetadata(timestamp: number, id: string, data: string[]): ParsedCANFrame {
  return {
    timestamp,
    id,
    dlc: data.length,
    data,
    source: getSourceForId(id),
    destination: getDestForId(id),
  };
}

/**
 * Parses CSV, TXT, or SocketCAN .log file content containing CAN bus dumps.
 * Supports:
 * 1. Standard SocketCAN candump format: (1623451234.001000) can0 1F2#085A001122330000
 * 2. Comma, semicolon, or tab-separated CSV logs with dynamic headers
 * 3. Space-separated format, with or without interface name (e.g. can0 1F2 [8] 11 22 33 44 55 66 77 88)
 * 4. General fallback scanning
 */
export function parseCANFile(text: string, filename: string): ParsedCANFrame[] {
  const lines = text.split(/\r?\n/);
  const frames: ParsedCANFrame[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    // Skip comment lines
    if (line.startsWith('#') || line.startsWith('//') || line.startsWith('/*')) {
      continue;
    }

    // --- Format A: (1623451234.567890) can0 1A4#FF00AABBCCEE
    const candumpRegex = /\((\d+(?:\.\d+)?)\)\s+([\w\d]+)\s+([0-9A-Fa-f]+)#([0-9A-Fa-f]*)/;
    const matchCandump = line.match(candumpRegex);
    if (matchCandump) {
      const ts = parseFloat(matchCandump[1]) * 1000; // convert seconds to ms
      const id = '0x' + matchCandump[3].toUpperCase();
      const rawData = matchCandump[4];
      const data: string[] = [];
      for (let j = 0; j < rawData.length; j += 2) {
        data.push(rawData.substr(j, 2).toUpperCase());
      }
      
      frames.push(createFrameWithDefaultMetadata(ts, id, data));
      continue;
    }

    // --- Format B: (1623451234.567890) can0 1F2 [8] 08 5A 00 11 22 33 00 00 or without timestamps
    const bracketRegex = /^(?:\((\d+(?:\.\d+)?)\)\s+)?(?:([\w\d]+)\s+)?([0-9A-Fa-fXx]+)\s+\[(\d+)\]\s*(.*)$/;
    const matchBracket = line.match(bracketRegex);
    if (matchBracket) {
      const ts = matchBracket[1] ? parseFloat(matchBracket[1]) * 1000 : frames.length * 10;
      let rawId = matchBracket[3];
      if (rawId.toUpperCase().startsWith('0X')) {
        rawId = rawId.substring(2);
      }
      const id = '0x' + rawId.toUpperCase();
      const dlc = parseInt(matchBracket[4]) || 0;
      const rawData = matchBracket[5].trim();
      
      let data: string[] = [];
      if (rawData.includes(' ') || rawData.includes('-') || rawData.includes(':')) {
        data = rawData.split(/[\s-:]+/).filter(b => /^[0-9A-Fa-f]{1,2}$/.test(b)).map(b => b.padStart(2, '0').toUpperCase());
      } else if (/^[0-9A-Fa-f]+$/.test(rawData)) {
        for (let j = 0; j < rawData.length; j += 2) {
          data.push(rawData.substr(j, 2).toUpperCase());
        }
      }

      while (data.length < dlc) data.push('00');
      data = data.slice(0, dlc);

      frames.push(createFrameWithDefaultMetadata(ts, id, data));
      continue;
    }

    // --- Format C: CSV structure with separator (comma, semicolon, tab)
    const delimiterMatch = line.includes(',') ? ',' : line.includes(';') ? ';' : line.includes('\t') ? '\t' : null;
    if (delimiterMatch) {
      const parts = line.split(delimiterMatch).map(p => p.replace(/["']/g, '').trim());
      
      // Skip header lines
      if (parts.some(p => {
        const lp = p.toLowerCase();
        return lp.includes('time') || lp.includes('id') || lp.includes('dlc') || lp.includes('payload') || lp.includes('bytes');
      })) {
        continue;
      }

      // Parse timestamp
      let ts = parseFloat(parts[0]);
      if (isNaN(ts)) ts = frames.length * 10;
      else ts = ts * 1000; // convert to ms

      let rawId = parts[1] || '0x000';
      if (rawId.toUpperCase().startsWith('0X')) {
        rawId = '0x' + rawId.substring(2).toUpperCase();
      } else if (/^[0-9A-Fa-f]+$/.test(rawId)) {
        rawId = '0x' + rawId.toUpperCase();
      } else {
        rawId = '0x000';
      }

      let dlc = parseInt(parts[2]);
      if (isNaN(dlc) || dlc < 0 || dlc > 8) dlc = 8;

      let rawData = parts[3] || '';
      let data: string[] = [];
      if (rawData.includes(' ') || rawData.includes('-') || rawData.includes(':')) {
        data = rawData.split(/[\s-:]+/).filter(b => /^[0-9A-Fa-f]{1,2}$/.test(b)).map(b => b.padStart(2, '0').toUpperCase());
      } else if (/^[0-9A-Fa-f]+$/.test(rawData)) {
        for (let j = 0; j < rawData.length; j += 2) {
          data.push(rawData.substr(j, 2).toUpperCase());
        }
      }

      while (data.length < dlc) data.push('00');
      data = data.slice(0, dlc);

      frames.push({
        timestamp: ts,
        id: rawId,
        dlc,
        data,
        source: parts[4] || getSourceForId(rawId),
        destination: parts[5] || getDestForId(rawId),
      });
      continue;
    }

    // --- Format D: Generic space separated values: <ID> <DLC> <BYTE0> <BYTE1> ...
    const spaceParts = line.split(/\s+/).map(p => p.trim());
    if (spaceParts.length >= 3) {
      let idIndex = 0;
      let rawId = spaceParts[idIndex];
      
      if (!isPotentialHexId(rawId) && isPotentialHexId(spaceParts[1])) {
        idIndex = 1;
        rawId = spaceParts[idIndex];
      }

      if (isPotentialHexId(rawId)) {
        if (rawId.toUpperCase().startsWith('0X')) {
          rawId = rawId.substring(2);
        }
        const id = '0x' + rawId.toUpperCase();
        
        let dlc = parseInt(spaceParts[idIndex + 1]);
        let dataStart = idIndex + 2;
        if (isNaN(dlc) || dlc < 0 || dlc > 8) {
          dlc = spaceParts.slice(idIndex + 1).length;
          dataStart = idIndex + 1;
        }
        if (dlc > 8) dlc = 8;

        const bytes = spaceParts.slice(dataStart).filter(b => /^[0-9A-Fa-f]{1,2}$/.test(b)).map(b => b.padStart(2, '0').toUpperCase());
        let data = bytes.slice(0, dlc);
        while (data.length < dlc) {
          data.push('00');
        }

        const ts = frames.length * 10;
        frames.push(createFrameWithDefaultMetadata(ts, id, data));
        continue;
      }
    }
  }

  // Heuristic Fallback Scan (if no standard format succeeded)
  if (frames.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const idMatch = line.match(/(?:0x)?([0-9A-Fa-f]{3,4})\b/i);
      if (idMatch) {
        const id = '0x' + idMatch[1].toUpperCase();
        const hexWords = line.match(/\b([0-9A-Fa-f]{2})\b/g) || [];
        const data = hexWords.slice(0, 8).map(b => b.toUpperCase());
        if (data.length > 0) {
          frames.push(createFrameWithDefaultMetadata(frames.length * 10, id, data));
        }
      }
    }
  }

  if (frames.length > 0) {
    const firstTs = frames[0].timestamp;
    for (const f of frames) {
      f.timestamp = Math.max(0, f.timestamp - firstTs);
    }
  }

  return frames;
}
