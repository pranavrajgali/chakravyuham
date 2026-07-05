/**
 * Shannon Entropy calculation for a collection of byte values.
 * H = -Sum(P(x) * log2(P(x)))
 * For an 8-byte payload, max entropy is 3.0 bits (all 8 bytes are unique).
 */
export function calculateShannonEntropy(bytes: string[]): number {
  if (bytes.length === 0) return 0;
  const counts: Record<string, number> = {};
  for (const byte of bytes) {
    counts[byte] = (counts[byte] || 0) + 1;
  }
  let entropy = 0;
  const n = bytes.length;
  for (const byte in counts) {
    const p = counts[byte] / n;
    entropy -= p * Math.log2(p);
  }
  return parseFloat(entropy.toFixed(4));
}

export function formatBytesHex(bytes: string[]): string {
  return bytes.join(' ');
}

// Generate realistic low-entropy steady-state engine ECU data
export function generateNormalPayload(id: string, time: number): string[] {
  // Simulating a rolling state like RPM, temperature or speedometer
  const list = ['00', '00', '00', '00', '00', '00', '00', '00'];
  if (id === '0x1A4') { // Engine Speed / Throttle
    const rpm = Math.floor(2000 + Math.sin(time / 2000) * 400 + Math.random() * 20);
    const rpmHex = rpm.toString(16).padStart(4, '0').toUpperCase();
    list[0] = rpmHex.substring(0, 2);
    list[1] = rpmHex.substring(2, 4);
    list[2] = '03'; // status OK
  } else if (id === '0x2B0') { // Steering Angle / Yaw Rate
    const angle = Math.floor(32768 + Math.sin(time / 1000) * 1000); // offset binary
    const angleHex = angle.toString(16).padStart(4, '0').toUpperCase();
    list[0] = angleHex.substring(0, 2);
    list[1] = angleHex.substring(2, 4);
  } else if (id === '0x1F8') { // Brake ECU Pressure
    const pressure = Math.sin(time / 5000) > 0.5 ? 'FF' : '00';
    list[0] = pressure;
    list[1] = '00';
  } else { // Generic body controller
    list[0] = '05';
    list[7] = 'AC';
  }
  return list;
}

// Generate highly anomalous/extreme values impersonating genuine arbitration IDs
export function generateSpoofedPayload(id: string, time: number): string[] {
  const list = ['00', '00', '00', '00', '00', '00', '00', '00'];
  if (id === '0x1A4') { // Engine Speed / Throttle Redline Spoofing
    list[0] = '7F'; // extremely high RPM
    list[1] = 'FF';
    list[2] = 'FF'; // Error/Override state flag
    list[3] = '01';
  } else if (id === '0x2B0') { // Steering Angle / Sudden Yaw Jolt Spoofing
    list[0] = 'FF'; // Max steering angle right
    list[1] = 'FF';
    list[2] = '0F';
  } else if (id === '0x1F8') { // Brake ECU Overpressure / Lock-up Spoofing
    list[0] = 'FF'; // Max brake lock
    list[1] = 'FF';
    list[2] = 'FF';
    list[3] = 'A1';
  } else { // Body control door lock/unlock spoofing
    list[0] = 'DE';
    list[1] = 'AD';
    list[2] = 'BE';
    list[3] = 'EF';
  }
  return list;
}

// Generate highly chaotic random payload for fuzzing attacks
export function generateFuzzedPayload(dlc: number = 8): string[] {
  const list: string[] = [];
  for (let i = 0; i < dlc; i++) {
    const byteVal = Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
    list.push(byteVal);
  }
  return list;
}

export function generateArbitrationID(type: 'NORMAL' | 'DOS' | 'FUZZ'): string {
  if (type === 'DOS') {
    // 0x000 is the highest priority CAN arbitration ID, representing critical emergency or flooding
    return '0x000';
  }
  if (type === 'FUZZ') {
    // Fuzzing utilizes a random spread of IDs to hit all registers
    const randomHex = Math.floor(Math.random() * 2047).toString(16).toUpperCase().padStart(3, '0');
    return `0x${randomHex}`;
  }
  // Normal predefined ECUs
  const ids = ['0x1A4', '0x2B0', '0x1F8', '0x300'];
  return ids[Math.floor(Math.random() * ids.length)];
}

/**
 * Calculates the payload Hamming distance (number of flipped bits)
 * between two payloads (arrays of 2-character hex string bytes).
 */
export function calculateHammingDistance(p1: string[], p2: string[]): number {
  let distance = 0;
  const length = Math.max(p1.length, p2.length);
  for (let i = 0; i < length; i++) {
    const b1 = p1[i] ? parseInt(p1[i], 16) : 0;
    const b2 = p2[i] ? parseInt(p2[i], 16) : 0;
    let xor = b1 ^ b2;
    // Count set bits (Hamming weight)
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}
