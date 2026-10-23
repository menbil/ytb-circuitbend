import {
  MidiTarget,
  MidiActivityEvent,
  MIDI_TARGET_CATALOG
} from './midiTypes.js';

export interface MidiProfile {
  id: string;
  name: string;
  ccMap: Record<number, MidiTarget>;
  noteMap: Record<number, MidiTarget>;
}

// 1. Novation Launch Control Factory Mapping (16 Knobs + 8 Pads)
export const LAUNCH_CONTROL_PROFILE: MidiProfile = {
  id: 'launch-control',
  name: 'Novation Launch Control',
  ccMap: {
    // Top Row (Knobs 1 to 8): Factory CC 21 to 28
    21: 'video.glitchIntensity',
    22: 'video.rgbShift',
    23: 'video.scanlines',
    24: 'video.colorBleed',
    25: 'video.feedback',
    26: 'video.noise',
    27: 'video.vaporwaveTint',
    28: 'video.crtCurvature',

    // Bottom Row (Knobs 9 to 16): Factory CC 41 to 48
    41: 'audio.drive',
    42: 'audio.bitcrush',
    43: 'audio.filterCutoff',
    44: 'audio.filterResonance',
    45: 'audio.tapeSpeed',
    46: 'audio.wowDepth',
    47: 'audio.flutterDepth',
    48: 'audio.reverbWet',

    // CC Mode for Pads (CC 73 to 80)
    73: 'action.playToggle',
    74: 'action.tapeFreeze',
    75: 'action.randomize',
    76: 'action.nextTrack',
    77: 'action.preset0',
    78: 'action.preset1',
    79: 'action.preset2',
    80: 'action.preset3'
  },
  noteMap: {
    // Note Mode for Pads (Launch Control User & Factory templates: 9..12 & 25..28, or 36..43)
    9: 'action.playToggle',
    10: 'action.tapeFreeze',
    11: 'action.randomize',
    12: 'action.nextTrack',
    25: 'action.preset0',
    26: 'action.preset1',
    27: 'action.preset2',
    28: 'action.preset3',

    // Alternative standard octave 36..43
    36: 'action.playToggle',
    37: 'action.tapeFreeze',
    38: 'action.randomize',
    39: 'action.nextTrack',
    40: 'action.preset0',
    41: 'action.preset1',
    42: 'action.preset2',
    43: 'action.preset3'
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
    39: 'action.nextTrack'
  }
};

const STORAGE_KEY = 'ytb_circuitbend_midi_bindings_v2';

export type MidiDispatchFn = (target: MidiTarget, normalizedValue: number, isTrigger: boolean) => void;

export class MidiEngine {
  private midiAccess: any = null;
  private isConnected = false;
  private deviceName: string = 'No Device';
  private customCcMap: Record<number, MidiTarget> = {};
  private customNoteMap: Record<number, MidiTarget> = {};
  private activeProfileId: string = 'auto';

  private dispatchFn: MidiDispatchFn | null = null;
  private activityListeners: Array<(event: MidiActivityEvent) => void> = [];
  private stateChangeListeners: Array<(connected: boolean, deviceName: string) => void> = [];

  // MIDI Learn state
  private learningTarget: MidiTarget | null = null;

  constructor() {
    this.loadCustomBindings();
  }

  public init(dispatch: MidiDispatchFn) {
    this.dispatchFn = dispatch;

    if (typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator) {
      (navigator as any).requestMIDIAccess({ sysex: false })
        .then((access: any) => {
          this.midiAccess = access;
          this.setupInputs();
          access.onstatechange = () => {
            this.setupInputs();
          };
        })
        .catch((err: any) => {
          console.warn('[Web MIDI] Access denied or unsupported:', err);
        });
    }
  }

  public onActivity(cb: (event: MidiActivityEvent) => void) {
    this.activityListeners.push(cb);
  }

  public onStateChange(cb: (connected: boolean, deviceName: string) => void) {
    this.stateChangeListeners.push(cb);
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

  public setBinding(type: 'cc' | 'note', number: number, target: MidiTarget) {
    if (type === 'cc') {
      this.customCcMap[number] = target;
    } else {
      this.customNoteMap[number] = target;
    }
    this.saveCustomBindings();
  }

  public removeBinding(type: 'cc' | 'note', number: number) {
    if (type === 'cc') {
      delete this.customCcMap[number];
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
    this.saveCustomBindings();
  }

  public getAllBindings(): { cc: Record<number, MidiTarget>; notes: Record<number, MidiTarget> } {
    return {
      cc: { ...this.getMergedCcMap() },
      notes: { ...this.getMergedNoteMap() }
    };
  }

  private setupInputs() {
    if (!this.midiAccess) return;

    let found = false;
    let firstName = 'MIDI Controller';

    for (const input of this.midiAccess.inputs.values()) {
      found = true;
      firstName = input.name || 'MIDI Controller';
      this.deviceName = firstName;

      console.log(`%c[Web MIDI] Connected device: ${input.name} (${input.manufacturer || 'Generic'})`, 'color: #ff9d00; font-weight: bold;');

      input.onmidimessage = (msg: any) => this.handleMidiMessage(msg, input.name || firstName);
    }

    this.isConnected = found;
    if (!found) {
      this.deviceName = 'No Device';
    }

    this.stateChangeListeners.forEach(cb => cb(this.isConnected, this.deviceName));
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

    const paramNumber = data1;
    const value = data2;
    const normalized = value / 127;

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

    // 2. Resolve mapped target
    let target: MidiTarget | undefined;
    if (isCC) {
      target = this.getMergedCcMap()[paramNumber];
    } else if (isNoteOn) {
      target = this.getMergedNoteMap()[paramNumber];
    }

    // Log in DevTools console with clear colors
    console.log(
      `%c[MIDI IN]%c Dev:${deviceName} | Ch:${channel + 1} | ${isCC ? 'CC' : 'Note'}:${paramNumber} | Val:${value} ${target ? '-> [' + target + ']' : '(unmapped)'}`,
      'background: #1e293b; color: #38bdf8; font-weight: bold; padding: 2px 4px; border-radius: 2px;',
      'color: #e2e8f0;'
    );

    // 3. Dispatch to Audio / Video / Action State
    if (target && this.dispatchFn) {
      this.dispatchFn(target, normalized, isNoteOn);
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

  private getMergedCcMap(): Record<number, MidiTarget> {
    // Precedence: Generic fallback -> Launch Control XL -> Launch Control primary -> Custom user overrides
    return {
      ...GENERIC_PROFILE.ccMap,
      ...LAUNCH_CONTROL_XL_PROFILE.ccMap,
      ...LAUNCH_CONTROL_PROFILE.ccMap,
      ...this.customCcMap
    };
  }

  private getMergedNoteMap(): Record<number, MidiTarget> {
    return {
      ...GENERIC_PROFILE.noteMap,
      ...LAUNCH_CONTROL_XL_PROFILE.noteMap,
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
        }
      }
    } catch {}
  }

  private saveCustomBindings() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          cc: this.customCcMap,
          notes: this.customNoteMap
        }));
      }
    } catch {}
  }
}
