export interface SampleDataset {
  id: string;
  name: string;
  description: string;
  type: 'normal' | 'dos' | 'fuzz' | 'spoof';
  fileName: string;
  dataText: string;
}

export const SAMPLE_DATASETS: SampleDataset[] = [
  {
    id: 'normal-drive',
    name: 'Normal Vehicle Drive Cycle',
    description: 'Typical stasis telemetry representing clean ECU-to-ECU state exchanges, low entropy payloads, and stable 20ms periodic intervals.',
    type: 'normal',
    fileName: 'normal_drive_telemetry.csv',
    dataText: `Timestamp,ID,DLC,Payload,Source,Destination
0.000,0x1F2,8,085A001122330000,Engine ECU,Brake ECU
0.020,0x1F2,8,085B001122330000,Engine ECU,Brake ECU
0.040,0x1F2,8,085C001122330000,Engine ECU,Brake ECU
0.050,0x2C4,8,00001A2F00000000,Steering ECU,Dashboard ECU
0.060,0x1F2,8,085D001122330000,Engine ECU,Brake ECU
0.080,0x1F2,8,085E001122330000,Engine ECU,Brake ECU
0.100,0x1F2,8,085F001122330000,Engine ECU,Brake ECU
0.110,0x2C4,8,00001A3500000000,Steering ECU,Dashboard ECU
0.120,0x1F2,8,0860001122330000,Engine ECU,Brake ECU
0.140,0x1F2,8,0861001122330000,Engine ECU,Brake ECU
0.150,0x3B6,4,1A205500,Battery BMS,Dashboard ECU
0.160,0x1F2,8,0862001122330000,Engine ECU,Brake ECU
0.180,0x1F2,8,0863001122330000,Engine ECU,Brake ECU
0.200,0x1F2,8,0864001122330000,Engine ECU,Brake ECU
0.210,0x2C4,8,00001A4000000000,Steering ECU,Dashboard ECU`
  },
  {
    id: 'dos-flood',
    name: 'High-Priority DoS Flood Attack (SocketCAN candump)',
    description: 'A malicious OBD-II diagnostic connection flooding high-priority arbitration ID 0x000, causing bus starvation on safety-critical ECUs.',
    type: 'dos',
    fileName: 'candump_dos_attack.log',
    dataText: `(1623451234.000000) can0 1F2#085A001122330000
(1623451234.010000) can0 000#0000000000000000
(1623451234.010500) can0 000#0000000000000000
(1623451234.011000) can0 000#0000000000000000
(1623451234.011500) can0 000#0000000000000000
(1623451234.012000) can0 000#0000000000000000
(1623451234.012500) can0 000#0000000000000000
(1623451234.013000) can0 000#0000000000000000
(1623451234.013500) can0 000#0000000000000000
(1623451234.014000) can0 000#0000000000000000
(1623451234.014500) can0 000#0000000000000000
(1623451234.015000) can0 000#0000000000000000
(1623451234.020000) can0 2C4#00001A2F00000000
(1623451234.025000) can0 000#0000000000000000
(1623451234.025500) can0 000#0000000000000000
(1623451234.026000) can0 000#0000000000000000
(1623451234.026500) can0 000#0000000000000000`
  },
  {
    id: 'diagnostic-fuzzing',
    name: 'Diagnostic Register Fuzzing Spray',
    description: 'Spraying highly randomized bytes across randomized arbitration registers to search for backdoor diagnostics, triggering high payload Shannon entropy.',
    type: 'fuzz',
    fileName: 'obd2_fuzzing_payloads.csv',
    dataText: `Timestamp,ID,DLC,Payload,Source,Destination
0.000,0x1F2,8,085A001122330000,Engine ECU,Brake ECU
0.015,0x3A2,8,C9F10A4B62D718E0,Diagnostic Tool,Broadcast
0.030,0x4B5,8,7A2B0E1D5FF3C0A4,Diagnostic Tool,Broadcast
0.045,0x12E,8,43B9D0125AEBC703,Diagnostic Tool,Broadcast
0.060,0x2F1,8,E83021DA95FC17B0,Diagnostic Tool,Broadcast
0.075,0x1F2,8,085B001122330000,Engine ECU,Brake ECU
0.090,0x7F4,8,004FA8CD25E1B840,Diagnostic Tool,Broadcast
0.105,0x6C3,8,9E8D124AFB7305C2,Diagnostic Tool,Broadcast
0.120,0x53A,8,2B93D4A0E12F56C7,Diagnostic Tool,Broadcast
0.135,0x2C4,8,00001A2F00000000,Steering ECU,Dashboard ECU`
  },
  {
    id: 'ecu-spoofing',
    name: 'Engine ECU Spoofing (Temporal Jitter)',
    description: 'A secondary malicious device injecting duplicate spoofed speed values, resulting in extremely tight packet spacing (1ms jitter) and payload conflicts.',
    type: 'spoof',
    fileName: 'spoofing_timing_attack.txt',
    dataText: `Timestamp,ID,DLC,Payload,Source,Destination
0.000,0x1F2,8,085A001122330000,Engine ECU,Brake ECU
0.020,0x1F2,8,085B001122330000,Engine ECU,Brake ECU
0.021,0x1F2,8,08F0001122330000,Malicious Spoof ECU,Brake ECU
0.040,0x1F2,8,085C001122330000,Engine ECU,Brake ECU
0.041,0x1F2,8,08F1001122330000,Malicious Spoof ECU,Brake ECU
0.060,0x1F2,8,085D001122330000,Engine ECU,Brake ECU
0.080,0x1F2,8,085E001122330000,Engine ECU,Brake ECU
0.081,0x1F2,8,08F2001122330000,Malicious Spoof ECU,Brake ECU
0.100,0x1F2,8,085F001122330000,Engine ECU,Brake ECU
0.101,0x1F2,8,08F3001122330000,Malicious Spoof ECU,Brake ECU
0.120,0x1F2,8,0860001122330000,Engine ECU,Brake ECU`
  }
];
