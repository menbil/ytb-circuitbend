import { AudioBendingParams } from '../types/index.js';

export class AudioCircuitEngine {
  private ctx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private connectedElement: HTMLMediaElement | null = null;

  // Circuit Bends
  private bitcrusherNode: WaveShaperNode | null = null;
  private driveNode: WaveShaperNode | null = null;
  private filterNode: BiquadFilterNode | null = null;

  // Wow & Flutter (Dual LFO Tape Deck)
  private delayNode: DelayNode | null = null;
  private wowLfo: OscillatorNode | null = null;
  private wowGain: GainNode | null = null;
  private flutterLfo: OscillatorNode | null = null;
  private flutterGain: GainNode | null = null;
  private tapeDryGain: GainNode | null = null;
  private tapeWetGain: GainNode | null = null;

  // Mallsoft Convolution Reverb
  private convolverNode: ConvolverNode | null = null;
  private reverbDryGain: GainNode | null = null;
  private reverbWetGain: GainNode | null = null;

  // Granular Stutter / Audio Freeze Loop
  private stutterInputGain: GainNode | null = null;
  private stutterDelayNode: DelayNode | null = null;
  private stutterFeedbackGain: GainNode | null = null;
  private stutterDryGain: GainNode | null = null;
  private stutterWetGain: GainNode | null = null;
  private isFrozen: boolean = false;

  // Tape Tone (Type I Ferric Head Bump & HF Rolloff)
  private headBumpFilter: BiquadFilterNode | null = null;
  private tapeHfFilter: BiquadFilterNode | null = null;
  private tapeLfFilter: BiquadFilterNode | null = null;

  // Analog Tape Hiss Generator
  private hissSource: AudioBufferSourceNode | null = null;
  private hissFilter: BiquadFilterNode | null = null;
  private hissGain: GainNode | null = null;

  // Tape Dropouts
  private dropoutGain: GainNode | null = null;
  private dropoutInterval: any = null;

  // Master Limiter & Analyser
  private limiterNode: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  // Stream Recording Destination & Audio Analysis Buffer
  private streamDestination: MediaStreamAudioDestinationNode | null = null;
  private freqData: Uint8Array | null = null;

  private isInitialized = false;
  private isTapeStopped = false;
  private tapeInterval: any = null;

  constructor() {}

  /**
   * Builds synthetic impulse response for Abandoned Mall / Cathedral reverb
   * Uses low-pass filtered smooth reflections to eliminate any harsh white noise hiss
   */
  private createMallReverbImpulse(seconds: number = 3.0, decay: number = 2.4): AudioBuffer {
    if (!this.ctx) throw new Error('No audio context');
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const impulse = this.ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    let smoothL = 0;
    let smoothR = 0;
    // Lowpass filter alpha ~1800Hz to remove harsh static hiss completely
    const alpha = 0.10;

    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Warm exponential decay
      const env = Math.exp(-t * decay);
      const rawL = (Math.random() * 2 - 1) * env;
      const rawR = (Math.random() * 2 - 1) * env;

      smoothL += (rawL - smoothL) * alpha;
      smoothR += (rawR - smoothR) * alpha;

      left[i] = smoothL * 1.5;
      right[i] = smoothR * 1.5;
    }

    return impulse;
  }

  /**
   * Builds gentle analog tape hiss (warm brownian floor without harsh white hiss)
   */
  private createTapeHissBuffer(): AudioBuffer {
    if (!this.ctx) throw new Error('No audio context');
    const rate = this.ctx.sampleRate;
    const length = rate * 4.0;
    const buffer = this.ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);

    let lastVal = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      // Brownian gentle low rumble
      lastVal = (lastVal + (0.02 * white)) / 1.02;
      data[i] = lastVal * 0.4;
    }
    return buffer;
  }

  /**
   * Initializes the modular Web Audio signal chain
   */
  public init(mediaElement: HTMLMediaElement): boolean {
    if (this.isInitialized && this.connectedElement === mediaElement) {
      this.resume();
      return true;
    }

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return false;

      this.ctx = new AudioCtxClass();
      this.connectedElement = mediaElement;

      // Disable pitch preservation so playbackRate changes pitch naturally
      this.applyPitchPreservation(false);

      this.sourceNode = this.ctx.createMediaElementSource(mediaElement);

      // 1. Bitcrusher & Overdrive
      this.bitcrusherNode = this.ctx.createWaveShaper();
      this.bitcrusherNode.oversample = 'none';

      this.driveNode = this.ctx.createWaveShaper();
      this.driveNode.oversample = '4x';

      // 2. Resonant Synth Filter
      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setValueAtTime(18000, this.ctx.currentTime);
      this.filterNode.Q.setValueAtTime(0.7, this.ctx.currentTime);

      // 3. Tape Tone Section (Type I Ferric Cassette EQ)
      // Head Bump peaking at 90Hz (+4dB)
      this.headBumpFilter = this.ctx.createBiquadFilter();
      this.headBumpFilter.type = 'peaking';
      this.headBumpFilter.frequency.setValueAtTime(90, this.ctx.currentTime);
      this.headBumpFilter.Q.setValueAtTime(1.2, this.ctx.currentTime);
      this.headBumpFilter.gain.setValueAtTime(0, this.ctx.currentTime);

      // High rolloff (11kHz)
      this.tapeHfFilter = this.ctx.createBiquadFilter();
      this.tapeHfFilter.type = 'lowpass';
      this.tapeHfFilter.frequency.setValueAtTime(18000, this.ctx.currentTime);

      // Sub-rumble highpass (35Hz)
      this.tapeLfFilter = this.ctx.createBiquadFilter();
      this.tapeLfFilter.type = 'highpass';
      this.tapeLfFilter.frequency.setValueAtTime(35, this.ctx.currentTime);

      // 4. Dual-LFO Wow & Flutter Tape Delay
      this.delayNode = this.ctx.createDelay(1.0);
      this.delayNode.delayTime.setValueAtTime(0.04, this.ctx.currentTime);

      // Slow Capstan Wow (0.5 - 2.5 Hz)
      this.wowLfo = this.ctx.createOscillator();
      this.wowLfo.type = 'sine';
      this.wowLfo.frequency.setValueAtTime(1.2, this.ctx.currentTime);
      this.wowGain = this.ctx.createGain();
      this.wowGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      // Fast Capstan Flutter (6 - 14 Hz)
      this.flutterLfo = this.ctx.createOscillator();
      this.flutterLfo.type = 'triangle';
      this.flutterLfo.frequency.setValueAtTime(9.0, this.ctx.currentTime);
      this.flutterGain = this.ctx.createGain();
      this.flutterGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      // Connect LFOs to delayTime
      this.wowLfo.connect(this.wowGain);
      this.flutterLfo.connect(this.flutterGain);
      this.wowGain.connect(this.delayNode.delayTime);
      this.flutterGain.connect(this.delayNode.delayTime);
      this.wowLfo.start();
      this.flutterLfo.start();

      this.tapeDryGain = this.ctx.createGain();
      this.tapeWetGain = this.ctx.createGain();
      this.tapeDryGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.tapeWetGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      // 5. Mallsoft Convolution Reverb
      this.convolverNode = this.ctx.createConvolver();
      this.convolverNode.buffer = this.createMallReverbImpulse();

      this.reverbDryGain = this.ctx.createGain();
      this.reverbWetGain = this.ctx.createGain();
      this.reverbDryGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.reverbWetGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      // 6. Tape Hiss Generator
      const hissBuf = this.createTapeHissBuffer();
      this.hissSource = this.ctx.createBufferSource();
      this.hissSource.buffer = hissBuf;
      this.hissSource.loop = true;

      this.hissFilter = this.ctx.createBiquadFilter();
      this.hissFilter.type = 'bandpass';
      this.hissFilter.frequency.setValueAtTime(3200, this.ctx.currentTime);
      this.hissFilter.Q.setValueAtTime(0.8, this.ctx.currentTime);

      this.hissGain = this.ctx.createGain();
      this.hissGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      this.hissSource.connect(this.hissFilter);
      this.hissFilter.connect(this.hissGain);
      this.hissSource.start();

      // 7. Master Limiter & Analyser
      this.limiterNode = this.ctx.createDynamicsCompressor();
      this.limiterNode.threshold.setValueAtTime(-2.0, this.ctx.currentTime);
      this.limiterNode.ratio.setValueAtTime(20.0, this.ctx.currentTime);
      this.limiterNode.attack.setValueAtTime(0.002, this.ctx.currentTime);
      this.limiterNode.release.setValueAtTime(0.08, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.30; // Snappy transient response for kick detection

      // 8. Granular Freeze / Stutter Loop Nodes
      this.stutterDelayNode = this.ctx.createDelay(1.0);
      this.stutterDelayNode.delayTime.setValueAtTime(0.12, this.ctx.currentTime);
      this.stutterFeedbackGain = this.ctx.createGain();
      this.stutterFeedbackGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
      this.stutterInputGain = this.ctx.createGain();
      this.stutterInputGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.stutterDryGain = this.ctx.createGain();
      this.stutterDryGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.stutterWetGain = this.ctx.createGain();
      this.stutterWetGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      // Tape Dropout Gain Node
      this.dropoutGain = this.ctx.createGain();
      this.dropoutGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

      // Recording Stream Destination Node
      this.streamDestination = this.ctx.createMediaStreamDestination();

      // 9. WIRING THE SIGNAL CHAIN
      // A. Source -> Granular Stutter Split (Zero-latency Dry + Freeze Loop Wet)
      this.sourceNode.connect(this.stutterDryGain);
      this.stutterDryGain.connect(this.bitcrusherNode);

      this.sourceNode.connect(this.stutterInputGain);
      this.stutterInputGain.connect(this.stutterDelayNode);
      this.stutterDelayNode.connect(this.stutterFeedbackGain);
      this.stutterFeedbackGain.connect(this.stutterDelayNode);
      this.stutterDelayNode.connect(this.stutterWetGain);
      this.stutterWetGain.connect(this.bitcrusherNode);

      // B. Circuit Distortion & Filters
      this.bitcrusherNode.connect(this.driveNode);
      this.driveNode.connect(this.filterNode);
      this.filterNode.connect(this.headBumpFilter);
      this.headBumpFilter.connect(this.tapeHfFilter);
      this.tapeHfFilter.connect(this.tapeLfFilter);

      // C. Tape Delay (Dry / Wet split)
      this.tapeLfFilter.connect(this.tapeDryGain);
      this.tapeLfFilter.connect(this.delayNode);
      this.delayNode.connect(this.tapeWetGain);

      // D. Merge into Reverb Split
      this.tapeDryGain.connect(this.reverbDryGain);
      this.tapeDryGain.connect(this.convolverNode);
      this.tapeWetGain.connect(this.reverbDryGain);
      this.tapeWetGain.connect(this.convolverNode);

      this.convolverNode.connect(this.reverbWetGain);

      // E. Reverb outputs + Hiss -> Tape Dropout -> Limiter
      this.reverbDryGain.connect(this.dropoutGain);
      this.reverbWetGain.connect(this.dropoutGain);
      this.dropoutGain.connect(this.limiterNode);
      this.hissGain.connect(this.limiterNode);

      // F. Limiter -> Master -> Analyser & Output & MediaStream Destination
      this.limiterNode.connect(this.masterGain);
      this.masterGain.connect(this.analyserNode);
      this.masterGain.connect(this.streamDestination);
      this.analyserNode.connect(this.ctx.destination);

      this.updateBitcrushCurve(0.0);
      this.updateDriveCurve(0.0);

      this.isInitialized = true;
      console.log('[WebAudio] Vaporwave & Tape Decay DSP Engine Active.');
      return true;
    } catch (err) {
      console.error('[WebAudio] Init error:', err);
      return false;
    }
  }

  public applyPitchPreservation(preserve: boolean) {
    if (!this.connectedElement) return;
    const el = this.connectedElement as any;
    el.preservesPitch = preserve;
    el.mozPreservesPitch = preserve;
    el.webkitPreservesPitch = preserve;
  }

  public async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  public getContextState(): AudioContextState | 'uninitialized' {
    return this.ctx ? this.ctx.state : 'uninitialized';
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  public getMediaStreamDestination(): MediaStreamAudioDestinationNode | null {
    return this.streamDestination;
  }

  private lastBass: number = 0;
  private kickEnvelope: number = 0;

  public getBassEnergy(): number {
    if (!this.analyserNode) return 0;
    if (!this.freqData) {
      this.freqData = new Uint8Array(this.analyserNode.frequencyBinCount);
    }
    this.analyserNode.getByteFrequencyData(this.freqData as any);
    
    // Sub-bass and Kick frequency bins (~40Hz to 160Hz)
    const b1 = this.freqData[1] || 0;
    const b2 = this.freqData[2] || 0;
    const b3 = this.freqData[3] || 0;
    const rawBass = (b1 * 1.6 + b2 * 1.3 + b3 * 0.9) / (3.8 * 255);

    // Instant attack transient detection
    const delta = Math.max(0, rawBass - this.lastBass);
    this.lastBass = rawBass * 0.65 + this.lastBass * 0.35;

    // Pump envelope on sudden energy rise
    if (delta > 0.04 || rawBass > 0.55) {
      this.kickEnvelope = Math.min(1.0, this.kickEnvelope + delta * 4.0 + rawBass * 0.45);
    } else {
      // Fast exponential decay for punchy kick release (~90ms)
      this.kickEnvelope *= 0.84;
    }

    return Math.min(1.0, this.kickEnvelope);
  }

  public isStopped(): boolean {
    return this.isTapeStopped;
  }

  public isFreezeActive(): boolean {
    return this.isFrozen;
  }

  /**
   * Activates or disables the Granular Buffer Stutter / Freeze loop.
   * Seamlessly coordinates with Tape Stop: if Tape Stop occurs, freeze loop releases.
   */
  public setFreeze(frozen: boolean, sliceDuration: number = 0.12, onStateChange?: (frozen: boolean) => void): boolean {
    if (!this.ctx || !this.stutterInputGain || !this.stutterFeedbackGain || !this.stutterDelayNode || !this.stutterDryGain || !this.stutterWetGain) {
      return false;
    }
    const t = this.ctx.currentTime;
    this.isFrozen = frozen;

    if (frozen) {
      const safeDuration = Math.max(0.04, Math.min(0.40, sliceDuration));
      this.stutterDelayNode.delayTime.setValueAtTime(safeDuration, t);
      // Fade out live input to prevent fresh audio from overwriting the slice
      this.stutterDryGain.gain.setTargetAtTime(0.0, t, 0.005);
      this.stutterInputGain.gain.setTargetAtTime(0.0, t, 0.005);
      // Bring in wet looped slice with high feedback
      this.stutterWetGain.gain.setTargetAtTime(1.0, t, 0.005);
      this.stutterFeedbackGain.gain.setTargetAtTime(0.985, t, 0.005);
    } else {
      // Cleanly restore transparent dry audio
      this.stutterFeedbackGain.gain.setTargetAtTime(0.0, t, 0.01);
      this.stutterWetGain.gain.setTargetAtTime(0.0, t, 0.01);
      this.stutterInputGain.gain.setTargetAtTime(1.0, t, 0.01);
      this.stutterDryGain.gain.setTargetAtTime(1.0, t, 0.01);
    }

    if (onStateChange) onStateChange(this.isFrozen);
    return this.isFrozen;
  }

  public toggleFreeze(sliceDuration: number = 0.12, onStateChange?: (frozen: boolean) => void): boolean {
    return this.setFreeze(!this.isFrozen, sliceDuration, onStateChange);
  }

  /**
   * Toggles Tape Stop:
   * - If running: progressively decelerates speed & pitch down to 0 and pauses
   * - If stopped: starts playback and smoothly accelerates back to nominal speed & pitch
   */
  public toggleTapeStop(nominalRate: number = 1.0, onStateChange?: (stopped: boolean) => void): boolean {
    if (!this.connectedElement) return false;
    const media = this.connectedElement;

    // Cleanly disengage freeze if active so tape stop doesn't get masked by feedback loop
    if (this.isFrozen) {
      this.setFreeze(false);
    }

    // Clear any active deceleration / acceleration
    if (this.tapeInterval) {
      clearInterval(this.tapeInterval);
      this.tapeInterval = null;
    }

    if (!this.isTapeStopped) {
      // 1. BRAKE: Decelerate down to ultra-slow tape drag (keeps video decoding & shaders pulsing)
      this.isTapeStopped = true;
      if (onStateChange) onStateChange(true);

      let current = media.playbackRate || nominalRate;
      this.tapeInterval = setInterval(() => {
        current *= 0.82;
        if (current <= 0.06) {
          clearInterval(this.tapeInterval);
          this.tapeInterval = null;
          media.playbackRate = 0.06;
          // Keep video playing in extreme slow-motion so shaders & video texture remain 100% active!
        } else {
          media.playbackRate = current;
        }
      }, 35);
    } else {
      // 2. RESUME: Spin back up smoothly to nominal speed & pitch
      this.isTapeStopped = false;
      if (onStateChange) onStateChange(false);

      let current = media.playbackRate || 0.06;
      this.tapeInterval = setInterval(() => {
        current += (nominalRate - current) * 0.25;
        if (Math.abs(nominalRate - current) < 0.02) {
          clearInterval(this.tapeInterval);
          this.tapeInterval = null;
          media.playbackRate = nominalRate;
        } else {
          media.playbackRate = current;
        }
      }, 35);
    }

    return this.isTapeStopped;
  }

  private updateBitcrushCurve(amount: number) {
    if (!this.bitcrusherNode) return;
    if (amount <= 0.01) {
      const samples = 1024;
      const curve = new Float32Array(samples);
      for (let i = 0; i < samples; i++) curve[i] = (i / (samples - 1)) * 2 - 1;
      this.bitcrusherNode.curve = curve;
      return;
    }
    const samples = 2048;
    const curve = new Float32Array(samples);
    const steps = Math.max(3, Math.round(128 * Math.pow(1 - amount * 0.96, 2.5)));
    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * 2 - 1;
      let y = Math.round(x * steps) / steps;
      if (amount > 0.5 && y > 0.4) y = Math.min(1.0, y * (1.0 + (amount - 0.5) * 0.4));
      curve[i] = y;
    }
    this.bitcrusherNode.curve = curve;
  }

  /**
   * Generates ultra-smooth analog saturation / soft-clipping curve
   * Normalizes output gain so the volume never jumps abruptly
   */
  private updateDriveCurve(amount: number) {
    if (!this.driveNode) return;

    if (amount <= 0.01) {
      const samples = 1024;
      const curve = new Float32Array(samples);
      for (let i = 0; i < samples; i++) curve[i] = (i / (samples - 1)) * 2 - 1;
      this.driveNode.curve = curve;
      return;
    }

    const samples = 2048;
    const curve = new Float32Array(samples);
    // Smooth analog drive factor: scales gently from 1.0 to 4.5
    const driveFactor = 1.0 + amount * 3.8;
    const norm = Math.tanh(driveFactor); // Gain normalization factor

    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * 2 - 1;
      // Soft hyperbolic tangent tape/tube saturation, perfectly normalized to [-1, +1]
      const y = Math.tanh(x * driveFactor) / norm;
      curve[i] = y;
    }
    this.driveNode.curve = curve;
  }

  public updateParams(params: AudioBendingParams) {
    if (!this.ctx || !this.isInitialized) return;
    const t = this.ctx.currentTime;

    // 1. Playback Speed & Pitch Lock vs Detune
    if (this.connectedElement && !this.isTapeStopped) {
      // If pitchLock is true, preserve pitch; otherwise disable preservation for analog detune
      this.applyPitchPreservation(params.pitchLock === true);

      const safeSpeed = Math.max(0.4, Math.min(1.5, params.tapeSpeed || 1.0));
      if (Math.abs(this.connectedElement.playbackRate - safeSpeed) > 0.01) {
        this.connectedElement.playbackRate = safeSpeed;
      }
    }

    // 2. Bitcrush & Drive
    this.updateBitcrushCurve(params.bitcrush);
    this.updateDriveCurve(params.drive);

    // 3. Resonant Filter
    if (this.filterNode) {
      if (this.filterNode.type !== params.filterType) this.filterNode.type = params.filterType;
      this.filterNode.frequency.setTargetAtTime(Math.max(40, params.filterCutoff), t, 0.02);
      this.filterNode.Q.setTargetAtTime(Math.max(0.1, params.filterResonance), t, 0.02);
    }

    // 4. Tape Tone (Ferric EQ Head Bump)
    if (this.headBumpFilter && this.tapeHfFilter) {
      const bumpGain = params.tapeTone * 5.5; // +5.5 dB at 90Hz
      this.headBumpFilter.gain.setTargetAtTime(bumpGain, t, 0.03);
      // HF rolloff from 18kHz down to 9kHz when tapeTone is max
      const hfCut = 18000 - params.tapeTone * 9000;
      this.tapeHfFilter.frequency.setTargetAtTime(hfCut, t, 0.03);
    }

    // 5. Dual Wow & Flutter Delays
    if (this.wowLfo && this.wowGain && this.flutterLfo && this.flutterGain && this.delayNode && this.tapeWetGain) {
      this.wowLfo.frequency.setTargetAtTime(Math.max(0.2, params.wowRate), t, 0.03);
      // Wow amplitude up to 0.012s
      this.wowGain.gain.setTargetAtTime(params.wowDepth * 0.012, t, 0.03);

      this.flutterLfo.frequency.setTargetAtTime(Math.max(3.0, params.flutterRate), t, 0.03);
      // Flutter fast vibration amplitude up to 0.003s
      this.flutterGain.gain.setTargetAtTime(params.flutterDepth * 0.0035, t, 0.03);

      const baseDelay = Math.max(0.005, params.delayTime || 0.03);
      this.delayNode.delayTime.setTargetAtTime(baseDelay, t, 0.03);

      const hasTapeMod = params.wowDepth > 0.02 || params.flutterDepth > 0.02 || params.delayTime > 0.02;
      this.tapeWetGain.gain.setTargetAtTime(hasTapeMod ? 0.75 : 0.0, t, 0.03);
      this.tapeDryGain!.gain.setTargetAtTime(1.0, t, 0.03);
    }

    // 6. Mallsoft Reverb
    if (this.reverbWetGain && this.reverbDryGain) {
      const wet = Math.max(0, Math.min(1, params.reverbWet));
      this.reverbWetGain.gain.setTargetAtTime(wet * 0.85, t, 0.03);
      this.reverbDryGain.gain.setTargetAtTime(1.0 - wet * 0.25, t, 0.03);
    }

    // 7. Subtle Tape Hiss
    if (this.hissGain) {
      // Gentle subtle level (never deafening white noise)
      const hissLevel = Math.max(0, Math.min(1, params.tapeHiss)) * 0.022;
      this.hissGain.gain.setTargetAtTime(hissLevel, t, 0.03);
    }

    // 7.5 Tape Dropouts (Random micro-cuts & tape crease artifacts)
    if (this.dropoutGain && params.tapeDropouts !== undefined) {
      if (params.tapeDropouts > 0.04) {
        if (!this.dropoutInterval) {
          this.dropoutInterval = setInterval(() => {
            if (!this.ctx || !this.dropoutGain) return;
            if (Math.random() < params.tapeDropouts * 0.45) {
              const now = this.ctx.currentTime;
              this.dropoutGain.gain.setValueAtTime(0.05, now);
              this.dropoutGain.gain.setTargetAtTime(1.0, now + 0.035, 0.02);
            }
          }, 250);
        }
      } else {
        if (this.dropoutInterval) {
          clearInterval(this.dropoutInterval);
          this.dropoutInterval = null;
          if (this.dropoutGain && this.ctx) {
            this.dropoutGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
          }
        }
      }
    }

    // 8. Master Gain
    if (this.masterGain) {
      const vol = params.isMuted ? 0 : Math.max(0, Math.min(1, params.masterVolume));
      this.masterGain.gain.setTargetAtTime(vol, t, 0.02);
    }
  }

  public dispose() {
    try {
      if (this.dropoutInterval) {
        clearInterval(this.dropoutInterval);
        this.dropoutInterval = null;
      }
      if (this.wowLfo) this.wowLfo.stop();
      if (this.flutterLfo) this.flutterLfo.stop();
      if (this.hissSource) this.hissSource.stop();
      if (this.ctx) this.ctx.close();
    } catch {
      // ignore
    }
    this.isInitialized = false;
  }
}
