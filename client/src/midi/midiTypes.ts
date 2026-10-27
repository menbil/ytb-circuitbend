export type MidiTarget =
  // Video params
  | 'video.glitchIntensity'
  | 'video.rgbShift'
  | 'video.scanlines'
  | 'video.colorBleed'
  | 'video.feedback'
  | 'video.noise'
  | 'video.vaporwaveTint'
  | 'video.crtCurvature'
  | 'video.apertureGrille'
  | 'video.vhsHeadSwitching'
  | 'video.vHoldDrift'
  | 'video.meshDisplacement'
  | 'video.chromaSmear'
  | 'video.audioReact'
  | 'video.luminance'
  | 'video.datamosh'
  // Audio params
  | 'audio.drive'
  | 'audio.bitcrush'
  | 'audio.filterCutoff'
  | 'audio.filterResonance'
  | 'audio.tapeSpeed'
  | 'audio.wowDepth'
  | 'audio.flutterDepth'
  | 'audio.reverbWet'
  | 'audio.tapeTone'
  | 'audio.tapeHiss'
  | 'audio.tapeDropouts'
  | 'audio.stutterSpeed'
  | 'audio.ringModMix'
  | 'audio.ringModFreq'
  | 'audio.masterVolume'
  // Modulation & Macro Controls
  | 'mod.morphAB'
  | 'mod.macroX'
  | 'mod.macroY'
  | 'mod.lfo1Rate'
  | 'mod.lfo2Rate'
  | 'mod.lfoDepth'
  // Action triggers
  | 'action.playToggle'
  | 'action.tapeFreeze'
  | 'action.randomize'
  | 'action.resetClean'
  | 'action.snapshot'
  | 'action.recordToggle'
  | 'action.tapTempo'
  | 'action.lfoToggle'
  | 'action.vcrOsdToggle'
  | 'action.preset0'
  | 'action.preset1'
  | 'action.preset2'
  | 'action.preset3'
  | 'action.preset4'
  | 'action.nextTrack'
  | 'action.prevTrack';

export interface MidiTargetMetadata {
  id: MidiTarget;
  label: string;
  category: 'video' | 'audio' | 'action';
  min?: number;
  max?: number;
  isLogarithmic?: boolean;
}

export const MIDI_TARGET_CATALOG: MidiTargetMetadata[] = [
  // Video (Ordered to match Launch Control Top Row K1-K8 first)
  { id: 'video.glitchIntensity', label: 'H-Sync Loss / Glitch (Tearing)', category: 'video', min: 0, max: 1 },
  { id: 'video.rgbShift', label: 'RGB Channel Shift', category: 'video', min: 0, max: 1 },
  { id: 'video.datamosh', label: 'Datamosh Melt (Fusion Temporelle)', category: 'video', min: 0, max: 1 },
  { id: 'video.feedback', label: 'Capacitive Feedback Trails', category: 'video', min: 0, max: 1 },
  { id: 'video.colorBleed', label: 'Color Bleed & Phase', category: 'video', min: 0, max: 1 },
  { id: 'video.vaporwaveTint', label: 'Vaporwave Pastel Tint', category: 'video', min: 0, max: 1 },
  { id: 'video.scanlines', label: 'CRT Scanlines', category: 'video', min: 0, max: 1 },
  { id: 'video.crtCurvature', label: 'CRT Screen Curvature', category: 'video', min: 0, max: 1 },
  { id: 'video.meshDisplacement', label: '3D Topography Mesh', category: 'video', min: 0, max: 1 },
  { id: 'video.chromaSmear', label: 'Chroma Beam Smear', category: 'video', min: 0, max: 1 },
  { id: 'video.luminance', label: 'Luminance & Solarization', category: 'video', min: 0, max: 1 },
  { id: 'video.apertureGrille', label: 'Phosphor Mask (Aperture Grille)', category: 'video', min: 0, max: 1 },
  { id: 'video.vhsHeadSwitching', label: 'VHS Head Switching Noise', category: 'video', min: 0, max: 1 },
  { id: 'video.vHoldDrift', label: 'V-Hold Vertical Drift', category: 'video', min: 0, max: 1 },
  { id: 'video.noise', label: 'Analog RF Noise', category: 'video', min: 0, max: 1 },
  { id: 'video.audioReact', label: 'Sidechain Kick Audio-React', category: 'video', min: 0, max: 1 },

  // Audio
  { id: 'audio.drive', label: 'Tape Saturation / Overdrive', category: 'audio', min: 0, max: 1 },
  { id: 'audio.bitcrush', label: 'Bit Depth Crush', category: 'audio', min: 0, max: 1 },
  { id: 'audio.filterCutoff', label: 'Filter Cutoff (80Hz - 18kHz)', category: 'audio', min: 80, max: 18000, isLogarithmic: true },
  { id: 'audio.filterResonance', label: 'Filter Resonance (Q)', category: 'audio', min: 0.1, max: 18 },
  { id: 'audio.tapeSpeed', label: 'Tape Playback Speed (0.5x - 1.5x)', category: 'audio', min: 0.5, max: 1.5 },
  { id: 'audio.wowDepth', label: 'Wow Detune Modulation', category: 'audio', min: 0, max: 1 },
  { id: 'audio.flutterDepth', label: 'Flutter Vibration Flutter', category: 'audio', min: 0, max: 1 },
  { id: 'audio.reverbWet', label: 'Mallsoft Reverb Wet Mix', category: 'audio', min: 0, max: 1 },
  { id: 'audio.tapeTone', label: 'Tape Head Bump / Ferric EQ', category: 'audio', min: 0, max: 1 },
  { id: 'audio.tapeHiss', label: 'Brownian Tape Hiss Floor', category: 'audio', min: 0, max: 1 },
  { id: 'audio.tapeDropouts', label: 'Tape Micro-Dropouts', category: 'audio', min: 0, max: 1 },
  { id: 'audio.stutterSpeed', label: 'Freeze Slice Speed', category: 'audio', min: 0.05, max: 0.35 },
  { id: 'audio.ringModMix', label: 'Ring Modulator Mix', category: 'audio', min: 0, max: 1 },
  { id: 'audio.ringModFreq', label: 'Ring Modulator Frequency (30Hz - 1200Hz)', category: 'audio', min: 30, max: 1200 },
  { id: 'audio.masterVolume', label: 'Master Output Volume', category: 'audio', min: 0, max: 1 },

  // Modulation & Performance Macros
  { id: 'mod.morphAB', label: 'Crossfader Morph A ↔ B', category: 'video', min: 0, max: 1 },
  { id: 'mod.macroX', label: 'Vector Pad X (Macro X)', category: 'video', min: 0, max: 1 },
  { id: 'mod.macroY', label: 'Vector Pad Y (Macro Y)', category: 'video', min: 0, max: 1 },
  { id: 'mod.lfo1Rate', label: 'LFO 1 Speed (0.1Hz - 12Hz)', category: 'audio', min: 0.1, max: 12 },
  { id: 'mod.lfo2Rate', label: 'LFO 2 Speed (0.1Hz - 12Hz)', category: 'audio', min: 0.1, max: 12 },
  { id: 'mod.lfoDepth', label: 'LFO Global Depth (0% - 100%)', category: 'audio', min: 0, max: 1 },

  // Actions
  { id: 'action.playToggle', label: 'Play / Pause Stream (Space)', category: 'action' },
  { id: 'action.tapeFreeze', label: 'TAPE STOP // FREEZE Brake (Key T/F)', category: 'action' },
  { id: 'action.randomize', label: 'Randomize Parameters / Glitch Chaos (Key R)', category: 'action' },
  { id: 'action.resetClean', label: 'RESET CLEAN // Bypass All FX (Panic Dry)', category: 'action' },
  { id: 'action.snapshot', label: 'Capture Photo Instantanée CRT (Key S)', category: 'action' },
  { id: 'action.recordToggle', label: 'Enregistrement Vidéo Session (Record MP4)', category: 'action' },
  { id: 'action.tapTempo', label: 'Tap Tempo BPM Sync (Key B / Flèche ▲)', category: 'action' },
  { id: 'action.lfoToggle', label: 'Activer / Désactiver Moteur LFO (Flèche ▼)', category: 'action' },
  { id: 'action.vcrOsdToggle', label: 'Afficher / Masquer VCR OSD 1994 (Key V)', category: 'action' },
  { id: 'action.preset0', label: 'Preset: Direct Bypass (Clean)', category: 'action' },
  { id: 'action.preset1', label: 'Preset: 1984 Abandoned Mall', category: 'action' },
  { id: 'action.preset2', label: 'Preset: Damaged VHS Tape', category: 'action' },
  { id: 'action.preset3', label: 'Preset: Nightwave Slowed', category: 'action' },
  { id: 'action.preset4', label: 'Preset: Fried 8-Bit Console', category: 'action' },
  { id: 'action.nextTrack', label: 'Vidéo Suivante Playlist (Flèche ►)', category: 'action' },
  { id: 'action.prevTrack', label: 'Vidéo Précédente Playlist (Flèche ◄)', category: 'action' }
];

export interface MidiActivityEvent {
  device: string;
  type: 'cc' | 'noteOn' | 'noteOff';
  channel: number;
  paramNumber: number; // CC number or Note number
  value: number;       // 0-127
  targetMapped?: MidiTarget;
  timestamp: number;
}

