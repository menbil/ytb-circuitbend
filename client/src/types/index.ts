export interface PlaylistItem {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
  streamUrl: string;
  author?: string;
}

export interface VideoBendingParams {
  // Legacy Circuit Glitch
  glitchIntensity: number;   // 0.0 -> 1.0 (H-sync loss / frame tearing)
  rgbShift: number;          // 0.0 -> 1.0 (RGB channel separation)
  scanlines: number;         // 0.0 -> 1.0 (CRT interlaced scanlines)
  colorBleed: number;        // 0.0 -> 1.0 (aggressive chroma bleed / inversion)
  feedback: number;          // 0.0 -> 1.0 (capacitive decay / ghost trails)
  noise: number;             // 0.0 -> 1.0 (analog RF fuzz)

  // Vaporwave, VHS & CRT Physics
  vaporwaveTint: number;     // 0.0 -> 1.0 (fuchsia/cyan pastels & lifted blacks)
  crtCurvature: number;      // 0.0 -> 1.0 (barrel distortion & glass curvature)
  apertureGrille: number;    // 0.0 -> 1.0 (RGB phosphor triad mask)
  vhsHeadSwitching: number;  // 0.0 -> 1.0 (bottom edge head switching noise)
  vHoldDrift: number;        // 0.0 -> 1.0 (vertical sync roll)

  // 3D Mesh & Optical Bleed
  meshDisplacement: number;  // 0.0 -> 1.0 (Three.js 3D plane vertex topography)
  chromaSmear: number;       // 0.0 -> 1.0 (beam bleed & composite RCA horizontal smear)
  audioReact: number;        // 0.0 -> 1.0 (sidechain audio bass energy to glitch & pulse)
  luminance: number;         // 0.0 -> 1.0 (luma overdrive, solarization & contrast bending)
}

export interface AudioBendingParams {
  // Core circuit bends
  bitcrush: number;          // 0.0 -> 1.0 (Bit depth crush)
  drive: number;             // 0.0 -> 1.0 (Hard sigmoid saturation)
  filterCutoff: number;      // 80Hz -> 18000Hz (Biquad cutoff)
  filterResonance: number;   // 0.1 -> 24.0 (Extreme Q for self-oscillation)
  filterType: BiquadFilterType;

  // Vaporwave & Tape Deck mechanics
  tapeSpeed: number;         // 0.5x -> 1.1x (unpreserved pitch slowing)
  wowRate: number;           // 0.5Hz -> 2.5Hz (slow capstan oscillation)
  wowDepth: number;          // 0.0 -> 1.0 (slow detune intensity)
  flutterRate: number;       // 5.0Hz -> 15.0Hz (fast capstan vibration)
  flutterDepth: number;      // 0.0 -> 1.0 (flutter vibration intensity)
  delayTime: number;         // 0.0s -> 0.5s (tape buffer)

  // Mallsoft, Tone Decay & Imperfections
  reverbWet: number;         // 0.0 -> 1.0 (abandoned mall convolution reverb)
  tapeTone: number;          // 0.0 -> 1.0 (Type I Ferric: head bump + HF rolloff)
  tapeHiss: number;          // 0.0 -> 1.0 (analog tape hiss noise floor)
  tapeDropouts: number;      // 0.0 -> 1.0 (tape creases & random micro-cut dropouts)
  stutterSpeed: number;      // 0.05s -> 0.35s (freeze loop slice duration)

  // Master
  masterVolume: number;      // 0.0 -> 1.0
  isMuted: boolean;
  pitchLock: boolean;        // true = preserve pitch when slowing, false = analog detune
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  badge: string;
  video: VideoBendingParams;
  audio: AudioBendingParams;
}

export interface UserPreset {
  id: string;
  name: string;
  createdAt: number;
  video: VideoBendingParams;
  audio: AudioBendingParams;
  lfo?: LfoConfig;
}

export type LfoShape = 'sine' | 'triangle' | 'saw' | 'sawDown' | 'square' | 'random' | 'drift';

export type VideoParamKey = keyof VideoBendingParams;
export type AudioParamKey = keyof Omit<AudioBendingParams, 'filterType' | 'isMuted' | 'pitchLock'>;

export type LfoTargetId = 
  | 'filterCutoff' 
  | 'tapeSpeed' 
  | 'drive' 
  | 'reverbWet' 
  | 'glitchIntensity' 
  | 'rgbShift' 
  | 'scanlines' 
  | 'meshDisplacement' 
  | 'luminance' 
  | 'colorBleed';

export interface LfoConfig {
  enabled: boolean;
  shape: LfoShape;
  rate: number;         // 0.1Hz -> 5.0Hz
  depth: number;        // Master depth 0.0 -> 1.0
  phaseSpread: number;  // 0.0 -> 1.0 (Polyrhythmic phase offsets across targets)
  targets: Record<LfoTargetId, boolean>; // Primary modulation matrix targets
  customAudioTarget: AudioParamKey;      // Freely selectable Audio target slot
  customAudioEnabled: boolean;
  customVideoTarget: VideoParamKey;      // Freely selectable Video target slot
  customVideoEnabled: boolean;
}
