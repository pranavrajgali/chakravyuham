import { AnomalyType } from '../types';

export interface CANSignal {
  id: string;
  name: string;
  source: string;
  destination: string;
  description: string;
  generatePayload: (time: number) => string[];
}

export interface ECUNode {
  id: string;
  label: string;
  xFactor: number; // multiplier for startX + (endX - startX) * xFactor
  y: number;       // offset relative to centerY
  color: string;   // hex string for rendering
  active: boolean;
  highlight?: boolean;
}

export interface CarModel {
  id: string;
  name: string;
  brand: string;
  type: string;
  baudRate: string;
  description: string;
  brandColor: string; // Hex color
  accentClass: string; // Tailwind text color class, e.g. 'text-sky-400'
  bgAccentClass: string; // Tailwind bg color class, e.g. 'bg-sky-500'
  borderColorClass: string; // Tailwind border color class, e.g. 'border-sky-500/30'
  nodes: ECUNode[];
  signals: CANSignal[];
}

export const CAR_MODELS: CarModel[] = [
  {
    id: 'nexon-ev',
    name: 'Nexon.ev MAX',
    brand: 'Tata Motors',
    type: 'Next-Gen Ziptron SUV',
    baudRate: '500 kbps (Propulsion & VCU CAN)',
    description: 'Tata Motors\' flagship high-voltage EV powertrain featuring the Gen3 Ziptron battery management system, regenerative braking controls, and active thermal loop.',
    brandColor: '#0ea5e9',
    accentClass: 'text-sky-500',
    bgAccentClass: 'bg-sky-500',
    borderColorClass: 'border-sky-500/30',
    nodes: [
      { id: 'vcu', label: 'Vehicle Controller (ECU)', xFactor: 0.18, y: -70, color: '#0ea5e9', active: true },
      { id: 'bms', label: 'Battery Monitor (ECU)', xFactor: 0.45, y: 70, color: '#14b8a6', active: true },
      { id: 'mcu', label: 'Motor Controller (ECU)', xFactor: 0.8, y: -70, color: '#6366f1', active: true },
      { id: 'gateway', label: 'Security Gateway (Gateway)', xFactor: 0.5, y: -70, color: '#f43f5e', active: false, highlight: true }
    ],
    signals: [
      {
        id: '0x120',
        name: 'Ziptron Power Demand',
        source: 'Vehicle Controller (ECU)',
        destination: 'Motor Controller (ECU)',
        description: 'Simulates driver accelerator pedal angle, dynamic torque request (Nm), and sport/eco mode status.',
        generatePayload: (time: number) => {
          const torque = Math.floor(180 + Math.sin(time / 2000) * 80 + Math.random() * 5);
          const torqueHex = torque.toString(16).padStart(4, '0').toUpperCase();
          const pedal = Math.floor(25 + Math.sin(time / 2000) * 15);
          const pedalHex = pedal.toString(16).padStart(2, '0').toUpperCase();
          return [torqueHex.substring(0, 2), torqueHex.substring(2, 4), pedalHex, '02', '00', '00', '00', '1A'];
        }
      },
      {
        id: '0x135',
        name: 'High-Voltage Battery SoC',
        source: 'Battery Monitor (ECU)',
        destination: 'Security Gateway (Gateway)',
        description: 'Battery pack State of Charge (%), voltage levels, and thermal chiller coolant temperatures.',
        generatePayload: (time: number) => {
          const soc = Math.max(0, Math.floor(82 - (time / 180000) % 10));
          const socHex = soc.toString(16).padStart(2, '0').toUpperCase();
          const temp = Math.floor(34 + Math.sin(time / 15000) * 2);
          const tempHex = temp.toString(16).padStart(2, '0').toUpperCase();
          return ['22', socHex, '0F', 'FC', tempHex, 'EE', '03', '5C'];
        }
      },
      {
        id: '0x242',
        name: 'VCU Drive Selector',
        source: 'Vehicle Controller (ECU)',
        destination: 'Battery Monitor (ECU)',
        description: 'Active drive gear mode (D/R/P/N), handbrake switch indicators, and passive keyless verification hashes.',
        generatePayload: (time: number) => {
          const mode = Math.sin(time / 8000) > 0.5 ? '44' : '01'; // D (44) or P (01)
          return [mode, 'AA', '00', '00', 'BC', '00', '00', '01'];
        }
      },
      {
        id: '0x32A',
        name: 'MCU Thermal Chiller Loop',
        source: 'Motor Controller (ECU)',
        destination: 'Battery Monitor (ECU)',
        description: 'Coolant valve positions, water pump RPMs, and active inverter heat dissipation ratios.',
        generatePayload: () => ['03', 'F2', 'A2', '12', '00', '00', '00', 'B6']
      }
    ]
  },
  {
    id: 'curvv-ev',
    name: 'Curvv.ev',
    brand: 'Tata Motors',
    type: 'Activ.ev Coupe SUV',
    baudRate: '500 kbps (High-Safety ADAS CAN)',
    description: 'Tata Motors\' Coupe-SUV utilizing the modular Activ.ev architecture. Features active lane tracking, Level 2 ADAS radar fusion, and custom smart torque vectoring.',
    brandColor: '#10b981',
    accentClass: 'text-emerald-500',
    bgAccentClass: 'bg-emerald-500',
    borderColorClass: 'border-emerald-500/30',
    nodes: [
      { id: 'adas', label: 'Radar Sensor (ECU)', xFactor: 0.18, y: -70, color: '#a855f7', active: true },
      { id: 'eps', label: 'Steering Controller (ECU)', xFactor: 0.45, y: 70, color: '#3b82f6', active: true },
      { id: 'bms', label: 'Battery Monitor (ECU)', xFactor: 0.8, y: -70, color: '#10b981', active: true },
      { id: 'gateway', label: 'Security Gateway (Gateway)', xFactor: 0.5, y: -70, color: '#f43f5e', active: false, highlight: true }
    ],
    signals: [
      {
        id: '0x09F',
        name: 'ADAS Target Trajectory',
        source: 'Radar Sensor (ECU)',
        destination: 'Steering Controller (ECU)',
        description: 'Calculates distance vectors to forward Indian road hazards (two-wheelers, potholes) and steering correction yaw targets.',
        generatePayload: (time: number) => {
          const dist = Math.floor(120 - Math.abs(Math.sin(time / 1500)) * 90);
          const distHex = dist.toString(16).padStart(4, '0').toUpperCase();
          return ['0C', distHex.substring(0, 2), distHex.substring(2, 4), 'A8', 'FF', '00', '00', '33'];
        }
      },
      {
        id: '0x1B8',
        name: 'EPS Torque Assistance',
        source: 'Steering Controller (ECU)',
        destination: 'Security Gateway (Gateway)',
        description: 'Monitors steering wheel rotation angle, torque multiplier levels, and lane keep assistance overrides.',
        generatePayload: (time: number) => {
          const angle = Math.floor(32768 + Math.sin(time / 2500) * 1200);
          const angleHex = angle.toString(16).padStart(4, '0').toUpperCase();
          return [angleHex.substring(0, 2), angleHex.substring(2, 4), '14', '00', '8B', 'F2', '00', '55'];
        }
      },
      {
        id: '0x2A1',
        name: 'Regenerative Brake Pressure',
        source: 'Steering Controller (ECU)',
        destination: 'Battery Monitor (ECU)',
        description: 'Simulates active pedal pressure and battery regeneration torque capture indicators.',
        generatePayload: (time: number) => {
          const regen = Math.sin(time / 4000) > 0.4 ? 'C4' : '00';
          return [regen, '01', '7F', '02', '00', '00', '00', '00'];
        }
      },
      {
        id: '0x3C4',
        name: 'Liquid Pack Cooling Valves',
        source: 'Battery Monitor (ECU)',
        destination: 'Security Gateway (Gateway)',
        description: 'Simulates secondary chillers, battery radiator fans, and battery cell manifold coolant pressure.',
        generatePayload: () => ['12', 'FF', 'AA', '00', '0A', '00', '00', 'E8']
      }
    ]
  },
  {
    id: 'jlr-defender',
    name: 'Defender V8',
    brand: 'Land Rover',
    type: 'JLR Premium Powertrain',
    baudRate: '1 Mbps (High-Speed CAN-FD)',
    description: 'Premium luxury chassis architecture powered by JLR engineering. Connects dual-channel air suspension loops, Terrain Response 2 stability, and dynamic traction ECUs.',
    brandColor: '#ec4899',
    accentClass: 'text-pink-500',
    bgAccentClass: 'bg-pink-500',
    borderColorClass: 'border-pink-500/30',
    nodes: [
      { id: 'aj133', label: 'Engine Controller (ECU)', xFactor: 0.18, y: -70, color: '#f43f5e', active: true },
      { id: 'susp', label: 'Suspension Controller (ECU)', xFactor: 0.45, y: 70, color: '#a855f7', active: true },
      { id: 'tr2', label: 'Terrain Controller (ECU)', xFactor: 0.8, y: -70, color: '#ec4899', active: true },
      { id: 'gateway', label: 'Security Gateway (Gateway)', xFactor: 0.5, y: -70, color: '#10b981', active: false, highlight: true }
    ],
    signals: [
      {
        id: '0x100',
        name: 'Engine RPM & Ignition',
        source: 'Engine Controller (ECU)',
        destination: 'Terrain Controller (ECU)',
        description: 'Throttle position indexes, cylinder detonation counts, and high-performance torque output curves.',
        generatePayload: (time: number) => {
          const rpm = Math.floor(3200 + Math.sin(time / 1000) * 1800 + Math.random() * 40);
          const rpmHex = rpm.toString(16).padStart(4, '0').toUpperCase();
          return [rpmHex.substring(0, 2), rpmHex.substring(2, 4), 'A4', '20', '00', '00', '00', 'E4'];
        }
      },
      {
        id: '0x102',
        name: 'Chassis Air Strut Damper',
        source: 'Suspension Controller (ECU)',
        destination: 'Security Gateway (Gateway)',
        description: 'Pneumatic valve pressure values, active vehicle ride height coefficients, and heavy loading compensation rates.',
        generatePayload: (time: number) => {
          const damp = Math.floor(520 + Math.sin(time / 3000) * 100);
          const dampHex = damp.toString(16).padStart(4, '0').toUpperCase();
          return [dampHex.substring(0, 2), dampHex.substring(2, 4), '1F', '00', 'E0', '00', '00', '0A'];
        }
      },
      {
        id: '0x150',
        name: 'Terrain Response Modes',
        source: 'Terrain Controller (ECU)',
        destination: 'Engine Controller (ECU)',
        description: 'Active terrain settings (Sand, Mud, Rock Crawl), wheel slippage friction coefficients, and center differential lockers.',
        generatePayload: (time: number) => {
          const activeSlippage = Math.sin(time / 2000) > 0.82 ? '99' : '00';
          return ['B2', 'FF', '00', activeSlippage, '12', 'A6', '00', '1F'];
        }
      },
      {
        id: '0x301',
        name: 'Active Sway-Bar Stabilizer',
        source: 'Terrain Controller (ECU)',
        destination: 'Suspension Controller (ECU)',
        description: 'Lateral rollover acceleration metrics and hydraulic anti-roll bar tension values.',
        generatePayload: () => ['15', '00', '4C', '02', 'FF', '1C', '00', '6E']
      }
    ]
  },
  {
    id: 'harrier-dark',
    name: 'Harrier Dark',
    brand: 'Tata Motors',
    type: 'Kryotec Powertrain SUV',
    baudRate: '250 kbps (Comfort & Chassis CAN)',
    description: 'Tata Motors\' premium SUV equipped with the Kryotec diesel powertrain and customized ESP terrain settings for diverse Indian driving conditions.',
    brandColor: '#eab308',
    accentClass: 'text-amber-500',
    bgAccentClass: 'bg-amber-500',
    borderColorClass: 'border-amber-500/30',
    nodes: [
      { id: 'kryotec', label: 'Engine Controller (ECU)', xFactor: 0.18, y: -70, color: '#eab308', active: true },
      { id: 'esp', label: 'Stability Controller (ECU)', xFactor: 0.45, y: 70, color: '#f97316', active: true },
      { id: 'bcm', label: 'Cabin Controller (ECU)', xFactor: 0.8, y: -70, color: '#6366f1', active: true },
      { id: 'gateway', label: 'Security Gateway (Gateway)', xFactor: 0.5, y: -70, color: '#f43f5e', active: false, highlight: true }
    ],
    signals: [
      {
        id: '0x1A0',
        name: 'Kryotec Throttle Signals',
        source: 'Engine Controller (ECU)',
        destination: 'Stability Controller (ECU)',
        description: 'Diesel fuel injection timing offsets, variable geometry turbo boost ratios, and particulate filter status.',
        generatePayload: (time: number) => {
          const fuel = Math.floor(110 + Math.sin(time / 2500) * 40);
          const fuelHex = fuel.toString(16).padStart(2, '0').toUpperCase();
          return [fuelHex, '1F', 'A2', '00', 'CD', 'F0', '03', '52'];
        }
      },
      {
        id: '0x2F5',
        name: 'Terrain Response Selector',
        source: 'Stability Controller (ECU)',
        destination: 'Security Gateway (Gateway)',
        description: 'Dial switches (Normal, Wet, Rough Road) controlling brake friction vectoring thresholds.',
        generatePayload: (time: number) => {
          const dial = Math.sin(time / 5000) > 0.4 ? '02' : '01'; // Wet or Normal
          return [dial, '00', '0C', '4F', '00', '00', '00', 'EE'];
        }
      },
      {
        id: '0x3F8',
        name: 'Harrier ESP Active Slip',
        source: 'Stability Controller (ECU)',
        destination: 'Engine Controller (ECU)',
        description: 'Wheel-speed differential calculations and electronic stability program slip indicators.',
        generatePayload: (time: number) => {
          const slip = Math.sin(time / 3000) > 0.88 ? 'A2' : '00';
          return [slip, '0F', 'EE', '20', '00', '00', '00', 'A4'];
        }
      },
      {
        id: '0x4EE',
        name: 'Dark Comfort Red Ambient',
        source: 'Cabin Controller (ECU)',
        destination: 'Security Gateway (Gateway)',
        description: 'Saves signature Dark Edition custom red-ambient light configurations and dynamic turn indicator states.',
        generatePayload: () => ['FF', 'EE', 'D4', '00', '22', '00', '00', '80']
      }
    ]
  }
];
