export type AnomalyType = 'NORMAL' | 'DOS' | 'FUZZ' | 'SPOOF';

export interface CANFrame {
  timestamp: number; // relative milliseconds
  id: string;        // Hex string, e.g. "0x1A4"
  dlc: number;       // Data Length Code (0-8)
  data: string[];    // Array of 2-char hex strings, e.g. ["05", "00", "00", "00", "00", "00", "00", "00"]
  entropy: number;   // Shannon entropy value
  isAnomalous: boolean;
  anomalyType: AnomalyType;
  source: string;    // ECU Name
  destination: string;
  // Advanced Feature Module (capturing temporal & payload dynamics per CAN ID)
  iat?: number;              // Inter-Arrival Time (ms) since previous message of same ID
  jitter?: number;           // Absolute difference between consecutive IATs for this ID (ms)
  messageFrequency?: number; // Global packet rate across the entire bus (Hz) based on rolling 50 packets
  payloadEntropy?: number;   // Shannon Information Entropy of the 8 payload bytes (alias/explicit)
  payloadHammingDist?: number; // Number of flipped bits between consecutive payloads of same ID
}

export interface IDSMetrics {
  currentMode: AnomalyType;
  packetRate: number;      // Packets per second
  avgEntropy: number;      // Rolling average entropy
  totalPackets: number;
  totalAnomalies: number;
}

export interface RuleConfig {
  id: string;
  name: string;
  description: string;
  threshold: number;
  unit: string;
  enabled: boolean;
  type: 'frequency' | 'entropy' | 'temporal';
}
