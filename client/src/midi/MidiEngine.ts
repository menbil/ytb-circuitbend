import {
  MidiTarget,
  MidiActivityEvent
} from './midiTypes.js';

export interface MidiProfile {
  id: string;
  name: string;
  ccMap: Record<number, MidiTarget>;
  noteMap: Record<number, MidiTarget>;
}

export interface LaunchControlBank {
  id: number;
  name: string;
  shortName: string;
  description: string;
  knobCcMap: Record<number, MidiTarget>;
}

export interface MidiLedState {
  isPlaying: boolean;
  isTapeFreeze: boolean;
  isRecording: boolean;
  isRecordingWav: boolean;
  lfoEnabled: boolean;
  showVcrOsd: boolean;
  activePresetId: string;
  punchInFx: 'datamosh' | 'glitch' | 'crush' | null;
  activeBank: number;
}

// Novation Launch Control (Original 16-Knob, non-XL) — 100% 1:1 Screen Order Mapping:
// Top Row (K1..K8) = Video Knobs in exact left-to-right screen order
// Bottom Row (K9..K16) = Audio Knobs in exact left-to-right screen order (+ Master on K16)
export const LAUNCH_CONTROL_BANKS: LaunchControlBank[] = [
  {
    id: 0,
    name: 'BANQUE 1/3 — LIGNE 1 ÉCRAN (VIDÉO LIGNE 1 EN HAUT / AUDIO LIGNE 1 + MASTER EN BAS)',
    shortName: 'BANQUE 1 (LIGNE 1 ÉCRAN)',
    description: 'Haut (K1-K8) = 1. CRT TUBE & VHS PHYSICS (ordre exact écran) • Bas (K9-K16) = 1. TAPE & REVERB + MASTER (ordre exact écran)',
    knobCcMap: {
      // Top Row (Knobs 1 to 8 — CC 21 to 28): Exact order of Video Row 1 ("1. CRT TUBE & VHS PHYSICS") on screen
      21: 'video.crtCurvature',     // K1: CRT CURVATURE
      22: 'video.vaporwaveTint',    // K2: VAPORWAVE TINT
      23: 'video.luminance',        // K3: LUMINANCE
      24: 'video.apertureGrille',   // K4: PHOSPHOR MASK
      25: 'video.chromaSmear',      // K5: CHROMA SMEAR
      26: 'video.vhsHeadSwitching', // K6: HEAD SWITCHING
      27: 'video.vHoldDrift',       // K7: V-HOLD DRIFT
      28: 'video.datamosh',         // K8: DATAMOSH MELT

      // Bottom Row (Knobs 9 to 16 — CC 41 to 48): Exact order of Audio Row 1 ("1. TAPE & REVERB") + MASTER on screen
      41: 'audio.tapeSpeed',        // K9:  TAPE SPEED
      42: 'audio.wowRate',          // K10: WOW RATE
      43: 'audio.wowDepth',         // K11: WOW DEPTH
      44: 'audio.flutterRate',      // K12: FLUTTER RATE
      45: 'audio.flutterDepth',     // K13: FLUTTER DEPTH
      46: 'audio.tapeTone',         // K14: TAPE TONE
      47: 'audio.reverbWet',        // K15: MALL REVERB
      48: 'audio.masterVolume'      // K16: MASTER (Tout à droite à l'écran)
    }
  },
  {
    id: 1,
    name: 'BANQUE 2/3 — LIGNE 2 ÉCRAN (VIDÉO LIGNE 2 EN HAUT / AUDIO LIGNE 2 EN BAS)',
    shortName: 'BANQUE 2 (LIGNE 2 ÉCRAN)',
    description: 'Haut (K1-K8) = 2. GLITCH & 3D (potards 1 à 8 dans l’ordre écran) • Bas (K9-K16) = 2. DRIVE & CIRCUIT (les 8 potards dans l’ordre écran)',
    knobCcMap: {
      // Top Row (Knobs 1 to 8 — CC 21 to 28): Exact order of Video Row 2 ("2. GLITCH & 3D", Knobs 1..8) on screen
      21: 'video.glitchIntensity',  // K1: H-SYNC LOSS
      22: 'video.rgbShift',         // K2: RGB SHIFT
      23: 'video.scanlines',        // K3: SCANLINES
      24: 'video.colorBleed',       // K4: COLOR BLEED
      25: 'video.feedback',         // K5: CAP. FEEDBACK
      26: 'video.noise',            // K6: RF NOISE
      27: 'video.meshDisplacement', // K7: 3D Z-EXTRUDE
      28: 'video.orbit3d',          // K8: 3D ORBIT/TILT

      // Bottom Row (Knobs 9 to 16 — CC 41 to 48): Exact order of Audio Row 2 ("2. DRIVE & CIRCUIT", Knobs 1..8) on screen
      41: 'audio.bitcrush',         // K9:  BITCRUSH
      42: 'audio.drive',            // K10: SMOOTH DRIVE
      43: 'audio.ringModMix',       // K11: RING MOD
      44: 'audio.filterCutoff',     // K12: CUTOFF
      45: 'audio.filterResonance',  // K13: RESONANCE Q
      46: 'audio.tapeHiss',         // K14: TAPE HISS
      47: 'audio.tapeDropouts',     // K15: TAPE DROPOUT
      48: 'audio.stutterSpeed'      // K16: STUTTER SIZE
    }
  },
  {
    id: 2,
    name: 'BANQUE 3/3 — FIN LIGNE 2 VIDÉO (3D TUNNEL & SIDECHAIN KICK EN K7-K8) + AUDIO LIGNE 2 & MASTER',
    shortName: 'BANQUE 3 (FIN LIGNE 2)',
    description: 'Haut (K1-K8) = Fin Ligne 2 Vidéo potards 3 à 10 (Scanlines → ... → 3D Tunnel en K7, Sidechain Kick en K8) • Bas (K9-K16) = Audio Ligne 2 + MASTER en K16',
    knobCcMap: {
      // Top Row (Knobs 1 to 8 — CC 21 to 28): Video Row 2 shifted by 2 so Knobs 3..10 of Row 2 map 1:1 up to 3D TUNNEL (K7) & SIDECHAIN KICK (K8)
      21: 'video.scanlines',        // K1: SCANLINES (3ème potard Ligne 2 Vidéo)
      22: 'video.colorBleed',       // K2: COLOR BLEED (4ème potard Ligne 2 Vidéo)
      23: 'video.feedback',         // K3: CAP. FEEDBACK (5ème potard Ligne 2 Vidéo)
      24: 'video.noise',            // K4: RF NOISE (6ème potard Ligne 2 Vidéo)
      25: 'video.meshDisplacement', // K5: 3D Z-EXTRUDE (7ème potard Ligne 2 Vidéo)
      26: 'video.orbit3d',          // K6: 3D ORBIT/TILT (8ème potard Ligne 2 Vidéo)
      27: 'video.tunnel3d',         // K7: 3D TUNNEL (9ème potard Ligne 2 Vidéo)
      28: 'video.audioReact',       // K8: SIDECHAIN KICK (10ème potard Ligne 2 Vidéo)

      // Bottom Row (Knobs 9 to 16 — CC 41 to 48): Audio Row 2 + MASTER on K16
      41: 'audio.bitcrush',         // K9:  BITCRUSH
      42: 'audio.drive',            // K10: SMOOTH DRIVE
      43: 'audio.ringModMix',       // K11: RING MOD
      44: 'audio.filterCutoff',     // K12: CUTOFF
      45: 'audio.filterResonance',  // K13: RESONANCE Q
      46: 'audio.tapeHiss',         // K14: TAPE HISS
      47: 'audio.tapeDropouts',     // K15: TAPE DROPOUT
      48: 'audio.masterVolume'      // K16: MASTER
    }
  }
];

// 1. Novation Launch Control Factory Mapping (16 Knobs x 3 Banks + 8 LED Pads + 4 Arrow Buttons)
export const LAUNCH_CONTROL_PROFILE: MidiProfile = {
  id: 'launch-control',
  name: 'Novation Launch Control',
  ccMap: {
    ...LAUNCH_CONTROL_BANKS[0].knobCcMap,

    // CC Mode for Pads (Novation Launch Control CC 73 to 80 — Left-to-Right: Transport -> Live FX -> Capture/REC on Far Right!)
    73: 'action.playToggle',    // Pad 1 (Far Left): Play / Pause (LED Vert)
    74: 'action.tapeFreeze',    // Pad 2: Tape Brake + Continuous Stutter Loop (LED Orange)
    75: 'action.punchDatamosh', // Pad 3: Live Punch-In Datamosh + Glitch FX (LED Rouge)
    76: 'action.randomize',     // Pad 4: Randomize Procedural Patch (LED Jaune)
    77: 'action.resetClean',    // Pad 5: Reset Clean / Bypass All FX (LED Vert)
    78: 'action.lfoToggle',     // Pad 6: Activer / Désactiver Moteur LFO (LED Vert)
    79: 'action.snapshot',      // Pad 7: Polaroid Photo Snapshot (Flash LED Jaune)
    80: 'action.recordToggle',  // Pad 8 (Far Right, under Master Vol): Video Session Record MP4 (LED Rouge Vif !)

    // 4 Directional Arrow Buttons on the right of Launch Control (CC 114 to 117)
    114: 'action.bankPrev',     // Flèche Haut (▲): Banque de Potards Précédente (1 <-> 2 <-> 3)
    115: 'action.bankNext',     // Flèche Bas (▼): Banque de Potards Suivante (1 <-> 2 <-> 3)
    116: 'action.prevTrack',    // Flèche Gauche (◄): Vidéo Précédente
    117: 'action.nextTrack',    // Flèche Droite (►): Vidéo Suivante
    118: 'action.vcrOsdToggle',
    119: 'action.recordToggle',
    120: 'action.preset3',
    121: 'action.preset4'
  },
  noteMap: {
    // Factory Template 1: Pads 1-4 (Notes 9..12) & Pads 5-8 (Notes 25..28)
    9: 'action.playToggle',     // Pad 1: Play / Pause
    10: 'action.tapeFreeze',    // Pad 2: Tape Brake + Stutter Freeze Loop
    11: 'action.punchDatamosh', // Pad 3: Punch-In Datamosh + Glitch FX
    12: 'action.randomize',     // Pad 4: Randomize Procedural Patch
    25: 'action.resetClean',    // Pad 5: Reset Clean / Bypass All FX
    26: 'action.lfoToggle',     // Pad 6: LFO Engine ON/OFF
    27: 'action.snapshot',      // Pad 7: Polaroid Photo Snapshot
    28: 'action.recordToggle',  // Pad 8 (Far Right): Video Session Record (REC MP4)

    // Factory Template 2: Pads 1-4 (Notes 13..16) & Pads 5-8 (Notes 29..32)
    13: 'action.playToggle',
    14: 'action.tapeFreeze',
    15: 'action.punchDatamosh',
    16: 'action.randomize',
    29: 'action.resetClean',
    30: 'action.lfoToggle',
    31: 'action.snapshot',
    32: 'action.recordToggle',

    // Factory Template 3: Pads 1-4 (Notes 17..20) & Pads 5-7 (Notes 33..35)
    17: 'action.playToggle',
    18: 'action.tapeFreeze',
    19: 'action.punchDatamosh',
    20: 'action.randomize',
    33: 'action.resetClean',
    34: 'action.lfoToggle',
    35: 'action.snapshot',

    // Factory Template 4: Pads 1-4 (Notes 21..24)
    21: 'action.playToggle',
    22: 'action.tapeFreeze',
    23: 'action.punchDatamosh',
    24: 'action.randomize',

    // User Template: Notes 36..43 (C1..G1 chromatic)
    36: 'action.playToggle',    // Pad 1
    37: 'action.tapeFreeze',    // Pad 2 (Tape Brake + Stutter Loop)
    38: 'action.punchDatamosh', // Pad 3 (Punch-In Datamosh)
    39: 'action.randomize',     // Pad 4 (Randomize)
    40: 'action.resetClean',    // Pad 5 (Bypass Clean)
    41: 'action.lfoToggle',     // Pad 6 (LFO ON/OFF)
    42: 'action.snapshot',      // Pad 7 (Snapshot Photo)
    43: 'action.recordToggle',  // Pad 8 (REC MP4 - Far Right)

    // Generic 0 & 1
    0: 'action.playToggle',
    1: 'action.tapeFreeze'
  }
};

// 2. Novation Launch Control XL Mapping (24 Knobs + 8 Faders + 16 Buttons)
export const LAUNCH_CONTROL_XL_PROFILE: MidiProfile = {
  id: 'launch-control-xl',
  name: 'Novation Launch Control XL',
  ccMap: {
    // Send A (Knobs 1 to 8): CC 13 to 20
    13: 'video.glitchIntensity',
    14: 'video.rgbShift',
    15: 'video.scanlines',
    16: 'video.colorBleed',
    17: 'video.feedback',
    18: 'video.noise',
    19: 'video.vaporwaveTint',
    20: 'video.crtCurvature',

    // Send B (Knobs 9 to 16): CC 29 to 36
    29: 'audio.drive',
    30: 'audio.bitcrush',
    31: 'audio.filterCutoff',
    32: 'audio.filterResonance',
    33: 'audio.tapeSpeed',
    34: 'audio.wowDepth',
    35: 'audio.flutterDepth',
    36: 'audio.reverbWet',

    // Pan (Knobs 17 to 24): CC 49 to 56
    49: 'audio.tapeTone',
    50: 'audio.tapeHiss',
    51: 'audio.tapeDropouts',
    52: 'audio.stutterSpeed',
    53: 'video.apertureGrille',
    54: 'video.vHoldDrift',
    55: 'video.chromaSmear',
    56: 'video.audioReact',

    // Faders 1 to 8: CC 77 to 84
    77: 'video.glitchIntensity',
    78: 'video.meshDisplacement',
    79: 'audio.drive',
    80: 'audio.filterCutoff',
    81: 'audio.tapeSpeed',
    82: 'audio.reverbWet',
    83: 'video.luminance',
    84: 'audio.masterVolume'
  },
  noteMap: {
    // Track Focus / Track Control buttons (often Notes 41..48 and 73..80)
    41: 'action.playToggle',
    42: 'action.tapeFreeze',
    43: 'action.randomize',
    44: 'action.nextTrack',
    45: 'action.preset0',
    46: 'action.preset1',
    47: 'action.preset2',
    48: 'action.preset3'
  }
};

// 3. Generic Fallback Profile (CC 1 to 8 & 16 to 23)
export const GENERIC_PROFILE: MidiProfile = {
  id: 'generic',
  name: 'Generic CC Controller',
  ccMap: {
    1: 'video.glitchIntensity',
    2: 'video.rgbShift',
    3: 'video.scanlines',
    4: 'video.meshDisplacement',
    5: 'audio.drive',
    6: 'audio.tapeSpeed',
    7: 'audio.reverbWet',
    8: 'audio.filterCutoff',
    // Korg nanoKONTROL / Akai
    16: 'video.glitchIntensity',
    17: 'video.rgbShift',
    18: 'video.scanlines',
    19: 'video.meshDisplacement',
    20: 'audio.drive',
    21: 'audio.tapeSpeed',
    22: 'audio.reverbWet',
    23: 'audio.filterCutoff'
  },
  noteMap: {
    36: 'action.playToggle',
    37: 'action.tapeFreeze',
    38: 'action.randomize',
    39: 'action.resetClean'
  }
};

const STORAGE_KEY = 'ytb_circuitbend_midi_bindings_v12';

// Novation Launch Control Bi-Color LED Velocities (Red/Green/Amber)
export const LC_COLOR = {
  OFF: 12,         // 0x0C (Éteint)
  RED_DIM: 13,     // 0x0D (Rouge sombre / veille REC)
  RED_FULL: 15,    // 0x0F (Rouge vif : REC actif / Punch-In)
  GREEN_DIM: 28,   // 0x1C (Vert sombre)
  GREEN_FULL: 60,  // 0x3C (Vert vif : PLAY / CLEAN / LFO actif)
  AMBER_DIM: 29,   // 0x1D (Ambre doux : veille)
  YELLOW_FULL: 62, // 0x3E (Jaune vif : RANDOM / SNAPSHOT)
  AMBER_FULL: 63   // 0x3F (Orange/Ambre vif : FREEZE / PRESET actif)
} as const;

export type MidiDispatchFn = (target: MidiTarget, normalizedValue: number, isTrigger: boolean) => void;

export class MidiEngine {
  private midiAccess: any = null;
  private isConnected = false;
  private deviceName: string = 'No Device';
  private lastError: string | null = null;
  private customCcMap: Record<number, MidiTarget> = {};
  private customNoteMap: Record<number, MidiTarget> = {};
  private customBankKnobMaps: Array<Record<number, MidiTarget>> = [{}, {}, {}];
  private activeProfileId: string = 'auto';
  private activeBank: number = 0; // 0 = Bank 1, 1 = Bank 2, 2 = Bank 3
  private lastActiveChannel: number = 0;
  private sysexEnabled: boolean = false;
  private lastLedState: MidiLedState = {
    isPlaying: false,
    isTapeFreeze: false,
    isRecording: false,
    isRecordingWav: false,
    lfoEnabled: true,
    showVcrOsd: true,
    activePresetId: 'clean',
    punchInFx: null,
    activeBank: 0
  };
  private flashPadIndex: number | null = null;
  private flashPadTimer: any = null;

  private dispatchFn: MidiDispatchFn | null = null;
  private activityListeners: Array<(event: MidiActivityEvent) => void> = [];
  private stateChangeListeners: Array<(connected: boolean, deviceName: string) => void> = [];
  private bankChangeListeners: Array<(bankIndex: number, bank: LaunchControlBank) => void> = [];

  // MIDI Learn state
  private learningTarget: MidiTarget | null = null;

  constructor() {
    this.loadCustomBindings();
  }

  public init(dispatch: MidiDispatchFn) {
    this.dispatchFn = dispatch;
    this.connect();

    // On external HTTPS domains (Render), Chromium/Opera may require a user gesture to grant Web MIDI access
    if (typeof window !== 'undefined') {
      const retryOnGesture = () => {
        if (!this.isConnected) {
          this.connect();
        } else {
          window.removeEventListener('pointerdown', retryOnGesture);
          window.removeEventListener('keydown', retryOnGesture);
        }
      };
      window.addEventListener('pointerdown', retryOnGesture, { passive: true });
      window.addEventListener('keydown', retryOnGesture, { passive: true });
    }
  }

  public async connect(): Promise<boolean> {
    if (typeof navigator === 'undefined' || typeof (navigator as any).requestMIDIAccess !== 'function') {
      this.lastError = 'Web MIDI non supporté par ce navigateur (utilisez Chrome, Edge, Opera ou Brave en HTTPS).';
      this.stateChangeListeners.forEach((cb) => cb(false, this.deviceName));
      return false;
    }

    try {
      this.lastError = null;
      let access: any = null;
      // Request sysex:true first so Novation Launch Control LEDs can be driven via both standard MIDI & SysEx
      try {
        access = await (navigator as any).requestMIDIAccess({ sysex: true });
        this.sysexEnabled = true;
      } catch {
        access = await (navigator as any).requestMIDIAccess({ sysex: false });
        this.sysexEnabled = false;
      }
      this.midiAccess = access;
      this.setupInputs();
      access.onstatechange = () => {
        this.setupInputs();
      };
      if (!this.isConnected) {
        this.lastError = 'Aucun port MIDI détecté. Sur Windows, fermez tout autre navigateur/onglet local (localhost) ou logiciel utilisant déjà le Launch Control.';
      } else {
        this.syncHardwareLeds();
      }
      return this.isConnected;
    } catch (err: any) {
      this.lastError = err?.message || 'Permission Web MIDI refusée dans le navigateur (vérifiez l’icône cadenas à gauche de l’URL).';
      console.warn('[Web MIDI] Access denied or unsupported:', err);
      this.stateChangeListeners.forEach((cb) => cb(false, this.deviceName));
      return false;
    }
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  public onActivity(cb: (event: MidiActivityEvent) => void) {
    this.activityListeners.push(cb);
  }

  public onStateChange(cb: (connected: boolean, deviceName: string) => void) {
    this.stateChangeListeners.push(cb);
  }

  public onBankChange(cb: (bankIndex: number, bank: LaunchControlBank) => void) {
    this.bankChangeListeners.push(cb);
  }

  public getActiveBank(): number {
    return this.activeBank;
  }

  public getActiveBankInfo(): LaunchControlBank {
    return LAUNCH_CONTROL_BANKS[this.activeBank] || LAUNCH_CONTROL_BANKS[0];
  }

  public setActiveBank(bankIndex: number, notify = true): LaunchControlBank {
    const total = LAUNCH_CONTROL_BANKS.length;
    this.activeBank = ((bankIndex % total) + total) % total;
    this.lastLedState.activeBank = this.activeBank;
    const bank = this.getActiveBankInfo();
    this.syncHardwareLeds();
    if (notify) {
      this.bankChangeListeners.forEach((cb) => cb(this.activeBank, bank));
    }
    return bank;
  }

  public stepBank(delta: number): LaunchControlBank {
    return this.setActiveBank(this.activeBank + delta, true);
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public getDeviceName(): string {
    return this.deviceName;
  }

  public setLearnTarget(target: MidiTarget | null) {
    this.learningTarget = target;
  }

  public getLearnTarget(): MidiTarget | null {
    return this.learningTarget;
  }

  public setBinding(type: 'cc' | 'note', number: number, target: MidiTarget, bankIndex?: number) {
    if (type === 'cc') {
      const isLaunchControlKnob = (number >= 21 && number <= 28) || (number >= 41 && number <= 48);
      if (isLaunchControlKnob) {
        const b = bankIndex !== undefined ? bankIndex : this.activeBank;
        if (!this.customBankKnobMaps[b]) this.customBankKnobMaps[b] = {};
        this.customBankKnobMaps[b][number] = target;
      } else {
        this.customCcMap[number] = target;
      }
    } else {
      this.customNoteMap[number] = target;
    }
    this.saveCustomBindings();
    this.syncHardwareLeds();
  }

  public removeBinding(type: 'cc' | 'note', number: number) {
    if (type === 'cc') {
      delete this.customCcMap[number];
      if (this.customBankKnobMaps[this.activeBank]) {
        delete this.customBankKnobMaps[this.activeBank][number];
      }
    } else {
      delete this.customNoteMap[number];
    }
    this.saveCustomBindings();
  }

  public resetToProfile(profileId: 'launch-control' | 'launch-control-xl' | 'generic') {
    this.activeProfileId = profileId;
    let prof = LAUNCH_CONTROL_PROFILE;
    if (profileId === 'launch-control-xl') prof = LAUNCH_CONTROL_XL_PROFILE;
    if (profileId === 'generic') prof = GENERIC_PROFILE;

    this.customCcMap = { ...prof.ccMap };
    this.customNoteMap = { ...prof.noteMap };
    this.customBankKnobMaps = [
      { ...LAUNCH_CONTROL_BANKS[0].knobCcMap },
      { ...LAUNCH_CONTROL_BANKS[1].knobCcMap },
      { ...LAUNCH_CONTROL_BANKS[2].knobCcMap }
    ];
    this.saveCustomBindings();
    this.syncHardwareLeds();
  }

  public getAllBindings(bankIndex?: number): { cc: Record<number, MidiTarget>; notes: Record<number, MidiTarget> } {
    return {
      cc: { ...this.getMergedCcMap(bankIndex) },
      notes: { ...this.getMergedNoteMap() }
    };
  }

  /**
   * Computes the Novation Launch Control LED color byte for a given MidiTarget & current app state
   */
  private getTargetLedColor(target: MidiTarget | undefined, state: MidiLedState, padIdx: number): number {
    if (this.flashPadIndex === padIdx) {
      return LC_COLOR.YELLOW_FULL;
    }
    if (!target) return LC_COLOR.OFF;

    switch (target) {
      case 'action.recordToggle':
        // Bright Red when recording video MP4, Dim Red standby so you always spot the REC pad!
        return state.isRecording ? LC_COLOR.RED_FULL : LC_COLOR.RED_DIM;
      case 'action.recordWavToggle':
        return state.isRecordingWav ? LC_COLOR.RED_FULL : LC_COLOR.RED_DIM;
      case 'action.playToggle':
        // Bright Green when playing, Dim Amber when paused
        return state.isPlaying ? LC_COLOR.GREEN_FULL : LC_COLOR.AMBER_DIM;
      case 'action.tapeFreeze':
        // Bright Orange/Amber when Tape Freeze is active, Off when normal
        return state.isTapeFreeze ? LC_COLOR.AMBER_FULL : LC_COLOR.OFF;
      case 'action.randomize':
        // Bright Yellow when on a Random patch, Off/Dim otherwise
        return state.activePresetId === 'custom-random' ? LC_COLOR.YELLOW_FULL : LC_COLOR.OFF;
      case 'action.resetClean':
      case 'action.preset0':
        // Bright Green when Clean Bypass is active
        return state.activePresetId === 'clean' ? LC_COLOR.GREEN_FULL : LC_COLOR.OFF;
      case 'action.lfoToggle':
        // Bright Green when LFO engine is running
        return state.lfoEnabled ? LC_COLOR.GREEN_FULL : LC_COLOR.OFF;
      case 'action.vcrOsdToggle':
        return state.showVcrOsd ? LC_COLOR.GREEN_FULL : LC_COLOR.OFF;
      case 'action.punchDatamosh':
        return state.punchInFx === 'datamosh' ? LC_COLOR.RED_FULL : LC_COLOR.OFF;
      case 'action.punchGlitch':
        return state.punchInFx === 'glitch' ? LC_COLOR.RED_FULL : LC_COLOR.OFF;
      case 'action.punchCrush':
        return state.punchInFx === 'crush' ? LC_COLOR.RED_FULL : LC_COLOR.OFF;
      case 'action.preset1':
        return state.activePresetId === 'mall-1984' ? LC_COLOR.AMBER_FULL : LC_COLOR.OFF;
      case 'action.preset2':
        return state.activePresetId === 'broken-vhs' ? LC_COLOR.AMBER_FULL : LC_COLOR.OFF;
      case 'action.preset3':
        return state.activePresetId === 'slowed-reverb' ? LC_COLOR.AMBER_FULL : LC_COLOR.OFF;
      case 'action.preset4':
        return state.activePresetId === 'circuit-fried' ? LC_COLOR.AMBER_FULL : LC_COLOR.OFF;
      case 'action.preset5':
        return state.activePresetId === 'rutt-etra-3d' ? LC_COLOR.AMBER_FULL : LC_COLOR.OFF;
      case 'action.preset6':
        return state.activePresetId === 'tunnel-vortex-3d' ? LC_COLOR.AMBER_FULL : LC_COLOR.OFF;
      case 'action.preset7':
        return state.activePresetId === 'liquid-datamosh' ? LC_COLOR.AMBER_FULL : LC_COLOR.OFF;
      default:
        return LC_COLOR.OFF;
    }
  }

  /**
   * Drives the physical LEDs on the Novation Launch Control (8 Pads + 4 Arrow Buttons)
   */
  public syncHardwareLeds(nextState?: Partial<MidiLedState>) {
    if (nextState) {
      this.lastLedState = { ...this.lastLedState, ...nextState, activeBank: this.activeBank };
    }
    if (!this.midiAccess || !this.midiAccess.outputs) return;

    const state = this.lastLedState;
    const noteMap = this.getMergedNoteMap();
    const ccMap = this.getMergedCcMap();

    const factoryNotes = [9, 10, 11, 12, 25, 26, 27, 28];
    const factoryNotesT2 = [13, 14, 15, 16, 29, 30, 31, 32];
    const userNotes = [36, 37, 38, 39, 40, 41, 42, 43];
    const padCcs = [73, 74, 75, 76, 77, 78, 79, 80];

    // Channels to broadcast LED states on: last active channel from hardware + Ch 1 (0) + Ch 9 (8, Factory Template 1 default)
    const channels = Array.from(new Set([this.lastActiveChannel, 0, 8]));

    // Arrow LEDs indicate active Knob Bank:
    // Bank 1 (0): Up ▲ = ON, Down ▼ = OFF
    // Bank 2 (1): Up ▲ = ON, Down ▼ = ON
    // Bank 3 (2): Up ▲ = OFF, Down ▼ = ON
    const upArrowColor = state.activeBank === 0 || state.activeBank === 1 ? LC_COLOR.RED_FULL : 0;
    const downArrowColor = state.activeBank === 1 || state.activeBank === 2 ? LC_COLOR.RED_FULL : 0;
    const leftArrowColor = LC_COLOR.RED_DIM;
    const rightArrowColor = LC_COLOR.RED_DIM;

    for (const output of this.midiAccess.outputs.values()) {
      try {
        if (typeof output.open === 'function') {
          output.open().catch?.(() => {});
        }

        // 1. Update 8 Pads across Note & CC modes
        for (let padIdx = 0; padIdx < 8; padIdx++) {
          const fn1 = factoryNotes[padIdx];
          const fn2 = factoryNotesT2[padIdx];
          const un = userNotes[padIdx];
          const pcc = padCcs[padIdx];

          const target = noteMap[fn1] || noteMap[un] || ccMap[pcc];
          const color = this.getTargetLedColor(target, state, padIdx);

          for (const ch of channels) {
            output.send([0x90 | ch, fn1, color]);
            output.send([0x90 | ch, fn2, color]);
            output.send([0x90 | ch, un, color]);
            output.send([0xb0 | ch, pcc, color]);
          }

          // Official Novation Launch Control SysEx LED command (F0 00 20 29 02 0A 78 <Template> <LED> <Color> F7)
          if (this.sysexEnabled) {
            for (const tmpl of [this.lastActiveChannel, 0, 8]) {
              output.send([0xf0, 0x00, 0x20, 0x29, 0x02, 0x0a, 0x78, tmpl & 0x0f, padIdx, color, 0xf7]);
            }
          }
        }

        // 2. Update 4 Directional Arrow Button LEDs (CC 114=Up, 115=Down, 116=Left, 117=Right)
        for (const ch of channels) {
          output.send([0xb0 | ch, 114, upArrowColor]);
          output.send([0xb0 | ch, 115, downArrowColor]);
          output.send([0xb0 | ch, 116, leftArrowColor]);
          output.send([0xb0 | ch, 117, rightArrowColor]);
        }
        if (this.sysexEnabled) {
          for (const tmpl of [this.lastActiveChannel, 0, 8]) {
            output.send([0xf0, 0x00, 0x20, 0x29, 0x02, 0x0a, 0x78, tmpl & 0x0f, 8, upArrowColor, 0xf7]);
            output.send([0xf0, 0x00, 0x20, 0x29, 0x02, 0x0a, 0x78, tmpl & 0x0f, 9, downArrowColor, 0xf7]);
            output.send([0xf0, 0x00, 0x20, 0x29, 0x02, 0x0a, 0x78, tmpl & 0x0f, 10, leftArrowColor, 0xf7]);
            output.send([0xf0, 0x00, 0x20, 0x29, 0x02, 0x0a, 0x78, tmpl & 0x0f, 11, rightArrowColor, 0xf7]);
          }
        }
      } catch {
        // Ignore individual port send errors
      }
    }
  }

  private triggerPadFlash(padIdx: number) {
    this.flashPadIndex = padIdx;
    this.syncHardwareLeds();
    if (this.flashPadTimer) clearTimeout(this.flashPadTimer);
    this.flashPadTimer = setTimeout(() => {
      this.flashPadIndex = null;
      this.syncHardwareLeds();
    }, 320);
  }

  private setupInputs() {
    if (!this.midiAccess) return;

    let found = false;
    let preferredName = '';

    for (const input of this.midiAccess.inputs.values()) {
      found = true;
      const name: string = input.name || 'MIDI Controller';
      if (!preferredName || name.toLowerCase().includes('launch control')) {
        preferredName = name;
      }

      if (typeof input.open === 'function') {
        try {
          input.open();
        } catch {}
      }

      console.log(`%c[Web MIDI] Connected device: ${name} (${input.manufacturer || 'Generic'})`, 'color: #ff9d00; font-weight: bold;');

      input.onmidimessage = (msg: any) => this.handleMidiMessage(msg, name);
    }

    this.isConnected = found;
    this.deviceName = found ? (preferredName || 'MIDI Controller') : 'No Device';

    this.stateChangeListeners.forEach(cb => cb(this.isConnected, this.deviceName));
    if (found) {
      setTimeout(() => this.syncHardwareLeds(), 60);
    }
  }

  private handleMidiMessage(msg: any, deviceName: string) {
    if (!msg.data || msg.data.length < 2) return;
    const [status, data1, data2 = 0] = msg.data;
    const command = status & 0xf0;
    const channel = status & 0x0f;

    const isCC = command === 0xb0;
    const isNoteOn = command === 0x90 && data2 > 0;
    const isNoteOff = command === 0x80 || (command === 0x90 && data2 === 0);

    if (!isCC && !isNoteOn && !isNoteOff) return;

    this.lastActiveChannel = channel;

    const paramNumber = data1;
    const value = data2;
    const normalized = value / 127;

    // If a momentary pad or arrow button is released on the Launch Control, its internal firmware turns off the LED.
    // Re-sync our stateful LEDs right after release so active toggles (REC, PLAY, FREEZE, LFO, PRESET, BANK) stay lit!
    if (isNoteOff || (isCC && value === 0 && paramNumber >= 73)) {
      setTimeout(() => this.syncHardwareLeds(), 15);
      setTimeout(() => this.syncHardwareLeds(), 70);
      return;
    }

    // 1. Handle MIDI Learn Mode
    if (this.learningTarget && (isCC || isNoteOn)) {
      const type = isCC ? 'cc' : 'note';
      this.setBinding(type, paramNumber, this.learningTarget);
      console.log(`%c[MIDI LEARN] Successfully mapped ${type.toUpperCase()} ${paramNumber} -> ${this.learningTarget}`, 'color: #06b6d4; font-weight: bold;');
      const learned = this.learningTarget;
      this.learningTarget = null; // Auto exit learn on first trigger

      this.notifyActivity({
        device: deviceName,
        type: isCC ? 'cc' : 'noteOn',
        channel,
        paramNumber,
        value,
        targetMapped: learned,
        timestamp: Date.now()
      });
      return;
    }

    // 2. Resolve mapped target (aware of active Knob Bank 0..2 for CC 21..28 & 41..48)
    let target: MidiTarget | undefined;
    if (isCC) {
      target = this.getMergedCcMap(this.activeBank)[paramNumber];
    } else if (isNoteOn) {
      target = this.getMergedNoteMap()[paramNumber];
    }

    // Flash pad briefly on one-shot actions (Snapshot, Tap Tempo, Prev/Next Track)
    if (isNoteOn || (isCC && paramNumber >= 73 && paramNumber <= 80 && value > 0)) {
      const padIdx = isCC
        ? paramNumber - 73
        : [9, 10, 11, 12, 25, 26, 27, 28].indexOf(paramNumber) >= 0
          ? [9, 10, 11, 12, 25, 26, 27, 28].indexOf(paramNumber)
          : paramNumber - 36;
      if (
        padIdx >= 0 &&
        padIdx < 8 &&
        (target === 'action.snapshot' || target === 'action.tapTempo' || target === 'action.nextTrack' || target === 'action.prevTrack')
      ) {
        this.triggerPadFlash(padIdx);
      }
    }

    // 3. Dispatch to Audio / Video / Action State
    const isTrigger = isNoteOn || (isCC && value > 0);
    if (target && this.dispatchFn) {
      this.dispatchFn(target, normalized, isTrigger);
    }

    // Re-sync LEDs shortly after trigger so toggled states reflect immediately on the pads
    if (isTrigger && target?.startsWith('action.')) {
      setTimeout(() => this.syncHardwareLeds(), 25);
    }

    // 4. Notify UI activity listeners (LED indicators)
    this.notifyActivity({
      device: deviceName,
      type: isCC ? 'cc' : isNoteOn ? 'noteOn' : 'noteOff',
      channel,
      paramNumber,
      value,
      targetMapped: target,
      timestamp: Date.now()
    });
  }

  private notifyActivity(event: MidiActivityEvent) {
    this.activityListeners.forEach(cb => cb(event));
  }

  private getMergedCcMap(bankIndex?: number): Record<number, MidiTarget> {
    const b = bankIndex !== undefined ? bankIndex : this.activeBank;
    const bankKnobs = LAUNCH_CONTROL_BANKS[b]?.knobCcMap || LAUNCH_CONTROL_BANKS[0].knobCcMap;
    const customBankKnobs = this.customBankKnobMaps[b] || {};
    return {
      ...GENERIC_PROFILE.ccMap,
      ...LAUNCH_CONTROL_PROFILE.ccMap,
      ...this.customCcMap,
      ...bankKnobs,
      ...customBankKnobs
    };
  }

  private getMergedNoteMap(): Record<number, MidiTarget> {
    return {
      ...GENERIC_PROFILE.noteMap,
      ...LAUNCH_CONTROL_PROFILE.noteMap,
      ...this.customNoteMap
    };
  }

  private loadCustomBindings() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          this.customCcMap = parsed.cc || {};
          this.customNoteMap = parsed.notes || {};
          if (Array.isArray(parsed.bankKnobs) && parsed.bankKnobs.length === 3) {
            this.customBankKnobMaps = parsed.bankKnobs;
          }
        }
      }
    } catch {}
  }

  private saveCustomBindings() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          cc: this.customCcMap,
          notes: this.customNoteMap,
          bankKnobs: this.customBankKnobMaps
        }));
      }
    } catch {}
  }
}
