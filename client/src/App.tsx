import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  PlaylistItem, 
  VideoBendingParams, 
  AudioBendingParams, 
  Preset, 
  UserPreset,
  LfoConfig, 
  LfoShape, 
  LfoTargetId, 
  VideoParamKey, 
  AudioParamKey,
  ModRouting,
  ModSourceId,
  ModTargetPath,
  MsegPoint,
  SerumLfoUnit,
  BpmSyncDivision,
  LiveInputSource
} from './types/index.js';
import { PRESETS } from './presets.js';
import { AudioCircuitEngine } from './audio/AudioCircuitEngine.js';
import { MidiEngine } from './midi/MidiEngine.js';
import { MidiModal } from './components/MidiModal.js';
import { MidiTarget } from './midi/midiTypes.js';
import { Header } from './components/Header.js';
import { VideoViewport } from './components/VideoViewport.js';
import { PlaylistPanel } from './components/PlaylistPanel.js';
import { RackControls } from './components/RackControls.js';
import { getEffectiveLfoRateHz, SHAPE_POINTS } from './components/SerumModPanel.js';
import { Minimize2, Upload } from 'lucide-react';

// Parameter min/max bounds for Serum-style modulation scaling
const PARAM_RANGES: Record<string, [number, number]> = {
  'audio.filterCutoff': [80, 16000],
  'audio.filterResonance': [0.2, 24.0],
  'audio.tapeSpeed': [0.5, 1.1],
  'audio.wowRate': [0.4, 2.5],
  'audio.flutterRate': [5.0, 15.0],
  'audio.stutterSpeed': [0.04, 0.40],
  'audio.ringModFreq': [30, 1200]
};

const evalMsegPoints = (phase: number, points?: MsegPoint[]): number => {
  if (!points || points.length < 2) return 0.5;
  const p = ((phase % 1.0) + 1.0) % 1.0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (p >= a.x && p <= b.x) {
      const span = Math.max(0.0001, b.x - a.x);
      const t = (p - a.x) / span;
      return a.y + (b.y - a.y) * t;
    }
  }
  return points[points.length - 1].y;
};

export const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const audioEngineRef = useRef<AudioCircuitEngine | null>(null);
  const liveMediaStreamRef = useRef<MediaStream | null>(null);

  // Playlist & Input Source State
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [playlistTitle, setPlaylistTitle] = useState<string>('VAPORWAVE QUEUE');
  const [isPlaylistOpen, setIsPlaylistOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [liveSource, setLiveSource] = useState<LiveInputSource>('youtube');
  const [localMediaTitle, setLocalMediaTitle] = useState<string | null>(null);
  const [isFileDragOver, setIsFileDragOver] = useState<boolean>(false);

  // Playback & OSD State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isTapeFreeze, setIsTapeFreeze] = useState<boolean>(false);
  const [showTimeline, setShowTimeline] = useState<boolean>(true);
  const [isRackMinimized, setIsRackMinimized] = useState<boolean>(false);
  const [showVcrOsd, setShowVcrOsd] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [audioState, setAudioState] = useState<string>('uninitialized');

  // Direct Recording & Web MIDI State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<any>(null);

  const [midiConnected, setMidiConnected] = useState<boolean>(false);
  const [, setMidiDeviceName] = useState<string | null>(null);
  const [midiToast, setMidiToast] = useState<{ message: string; sub?: string } | null>(null);
  const midiToastTimerRef = useRef<any>(null);
  const midiEngineRef = useRef<MidiEngine | null>(null);
  const [isMidiModalOpen, setIsMidiModalOpen] = useState<boolean>(false);
  const actionHandlersRef = useRef<{
    playToggle?: () => void;
    tapeFreeze?: () => void;
    randomize?: () => void;
    resetClean?: () => void;
    snapshot?: () => void;
    recordToggle?: () => void;
    nextTrack?: () => void;
    prevTrack?: () => void;
    applyPreset?: (p: Preset) => void;
    tapTempo?: () => void;
    lfoToggle?: () => void;
    vcrOsdToggle?: () => void;
    changeMorph?: (t: number) => void;
  }>({});

  // Base Preset & Parameter States (User-controlled knob positions)
  const defaultPreset = PRESETS.find((p) => p.id === 'clean') || PRESETS[0];
  const [videoParams, setVideoParams] = useState<VideoBendingParams>(defaultPreset.video);
  const [audioParams, setAudioParams] = useState<AudioBendingParams>(defaultPreset.audio);
  const [modulatedVideoParams, setModulatedVideoParams] = useState<VideoBendingParams>(defaultPreset.video);
  const [modulatedAudioParams, setModulatedAudioParams] = useState<AudioBendingParams>(defaultPreset.audio);
  const [activePresetId, setActivePresetId] = useState<string>(defaultPreset.id);

  // User Saved Presets State
  const [userPresets, setUserPresets] = useState<UserPreset[]>(() => {
    try {
      const saved = localStorage.getItem('ytb_circuitbend_user_presets');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Zen Mode, Share URL & Snapshot States
  const [isZenMode, setIsZenMode] = useState<boolean>(false);
  const [snapshotFlash, setSnapshotFlash] = useState<boolean>(false);
  const [shareUrlCopied, setShareUrlCopied] = useState<boolean>(false);

  // Serum Modulation Matrix, X/Y Chaos Pad, BPM Tap Tempo & Preset A/B Morph State
  const [modRoutings, setModRoutings] = useState<ModRouting[]>([]);
  const [macroXY, setMacroXY] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const [xyHold, setXyHold] = useState<boolean>(false);
  const [bpm, setBpm] = useState<number>(120);
  const tapTimesRef = useRef<number[]>([]);
  const [punchInFx, setPunchInFx] = useState<'datamosh' | 'glitch' | 'crush' | null>(null);
  const [morphSlotA, setMorphSlotA] = useState<string>('clean');
  const [morphSlotB, setMorphSlotB] = useState<string>('abandoned-mall');
  const [morphAmount, setMorphAmount] = useState<number>(0);

  const liveSourcesRef = useRef<Record<ModSourceId, number>>({
    lfo1: 0.5,
    lfo2: 0.5,
    envAudio: 0.0,
    macroX: 0.5,
    macroY: 0.5
  });

  // LFO Multi-Destination Modulation Matrix State
  const [lfoConfig, setLfoConfig] = useState<LfoConfig>({
    enabled: false,
    shape: 'sine',
    rate: 1.0,
    depth: 0.65,
    phaseSpread: 0.35,
    targets: {
      filterCutoff: true,
      tapeSpeed: false,
      drive: false,
      reverbWet: false,
      glitchIntensity: false,
      rgbShift: false,
      scanlines: false,
      meshDisplacement: false,
      luminance: false,
      colorBleed: false
    },
    customAudioTarget: 'bitcrush',
    customAudioEnabled: false,
    customVideoTarget: 'feedback',
    customVideoEnabled: false
  });

  const lfoRandomValRef = useRef<number>(0.5);
  const lfoDriftCurrentRef = useRef<number>(0.5);
  const lfoDriftTargetRef = useRef<number>(0.5);
  const lastLfoStepRef = useRef<number>(0);

  const lfo2RandomValRef = useRef<number>(0.5);
  const lfo2DriftCurrentRef = useRef<number>(0.5);
  const lfo2DriftTargetRef = useRef<number>(0.5);
  const lastLfo2StepRef = useRef<number>(0);

  const lfo1PhaseRef = useRef<number>(0);
  const lfo2PhaseRef = useRef<number>(0);
  const lastModFrameTimeRef = useRef<number>(performance.now() / 1000);

  const showToast = useCallback((message: string, sub?: string) => {
    setMidiToast({ message, sub });
    if (midiToastTimerRef.current) clearTimeout(midiToastTimerRef.current);
    midiToastTimerRef.current = setTimeout(() => setMidiToast(null), 2600);
  }, []);

  // Drag & Drop Routing Handlers
  const handleDropModSource = useCallback((source: ModSourceId, target: ModTargetPath, amount = 0.55) => {
    setLfoConfig((prev) => ({ ...prev, enabled: true }));
    setModRoutings((prev) => {
      const existingIdx = prev.findIndex((r) => r.source === source && r.target === target);
      if (existingIdx !== -1) {
        const copy = [...prev];
        copy[existingIdx] = {
          ...copy[existingIdx],
          amount: Math.max(-1, Math.min(1, copy[existingIdx].amount + 0.2))
        };
        return copy;
      }
      return [
        ...prev,
        {
          id: `${source}-${target}-${Date.now()}`,
          source,
          target,
          amount,
          bipolar: source !== 'envAudio'
        }
      ];
    });
    showToast(`🔗 MODULATION : ${source.toUpperCase()} → ${target.toUpperCase()}`, 'Glissez le badge verticalement pour ajuster la profondeur');
  }, [showToast]);

  const handleUpdateModAmount = useCallback((routingId: string, amount: number) => {
    setModRoutings((prev) => prev.map((r) => (r.id === routingId ? { ...r, amount } : r)));
  }, []);

  const handleToggleModBipolar = useCallback((routingId: string) => {
    setModRoutings((prev) => prev.map((r) => (r.id === routingId ? { ...r, bipolar: !r.bipolar } : r)));
  }, []);

  const handleRemoveMod = useCallback((routingId: string) => {
    setModRoutings((prev) => prev.filter((r) => r.id !== routingId));
  }, []);

  // Synchronize LFO1 & LFO2 rates when BPM changes or Tap Tempo is triggered
  const syncLfoToBpm = useCallback((nextBpm: number) => {
    setBpm(nextBpm);
    setLfoConfig((prev): LfoConfig => {
      const l1Div: BpmSyncDivision = prev.lfo1?.syncDivision && prev.lfo1.syncDivision !== 'free' ? prev.lfo1.syncDivision : '1/4';
      const l2Div: BpmSyncDivision = prev.lfo2?.syncDivision && prev.lfo2.syncDivision !== 'free' ? prev.lfo2.syncDivision : '1/2';
      const l1Hz = getEffectiveLfoRateHz(l1Div, prev.lfo1?.rate ?? prev.rate, nextBpm);
      const l2Hz = getEffectiveLfoRateHz(l2Div, prev.lfo2?.rate ?? prev.rate * 1.5, nextBpm);
      const defaultPts1 = prev.shape !== 'custom' ? SHAPE_POINTS[prev.shape] : SHAPE_POINTS.sine;
      return {
        ...prev,
        rate: l1Hz,
        lfo1: {
          id: 'lfo1',
          enabled: true,
          smooth: prev.lfo1?.smooth ?? 0,
          shape: prev.lfo1?.shape ?? prev.shape,
          rate: l1Hz,
          syncDivision: l1Div,
          points: prev.lfo1?.points ?? defaultPts1
        },
        lfo2: {
          id: 'lfo2',
          enabled: true,
          smooth: prev.lfo2?.smooth ?? 0,
          shape: prev.lfo2?.shape ?? 'triangle',
          rate: l2Hz,
          syncDivision: l2Div,
          points: prev.lfo2?.points ?? SHAPE_POINTS.triangle
        }
      };
    });
  }, []);

  // Tap Tempo Handler
  const handleTapTempo = useCallback(() => {
    const now = performance.now();
    const recent = tapTimesRef.current.filter((t) => now - t < 3000);
    recent.push(now);
    tapTimesRef.current = recent;
    if (recent.length >= 2) {
      let sum = 0;
      for (let i = 1; i < recent.length; i++) {
        sum += recent[i] - recent[i - 1];
      }
      const avgMs = sum / (recent.length - 1);
      const detectedBpm = Math.max(40, Math.min(220, Math.round(60000 / avgMs)));
      syncLfoToBpm(detectedBpm);
      showToast(`⏱️ TAP TEMPO : ${detectedBpm} BPM`, 'Horloge LFO 1 (1/4) & LFO 2 (1/2) synchronisées');
    }
  }, [showToast, syncLfoToBpm]);

  // Preset A/B Morphing Crossfader Interpolation
  const handleChangeMorphAmount = useCallback((t: number) => {
    setMorphAmount(t);
    const findPreset = (id: string) =>
      PRESETS.find((p) => p.id === id) || userPresets.find((u) => u.id === id) || PRESETS[0];

    const pA = findPreset(morphSlotA);
    const pB = findPreset(morphSlotB);
    if (!pA || !pB) return;

    const lerp = (a: number, b: number) => Number((a + (b - a) * t).toFixed(3));

    const morphedVideo: VideoBendingParams = {
      glitchIntensity: lerp(pA.video.glitchIntensity, pB.video.glitchIntensity),
      rgbShift: lerp(pA.video.rgbShift, pB.video.rgbShift),
      scanlines: lerp(pA.video.scanlines, pB.video.scanlines),
      colorBleed: lerp(pA.video.colorBleed, pB.video.colorBleed),
      feedback: lerp(pA.video.feedback, pB.video.feedback),
      noise: lerp(pA.video.noise, pB.video.noise),
      vaporwaveTint: lerp(pA.video.vaporwaveTint, pB.video.vaporwaveTint),
      crtCurvature: lerp(pA.video.crtCurvature, pB.video.crtCurvature),
      apertureGrille: lerp(pA.video.apertureGrille, pB.video.apertureGrille),
      vhsHeadSwitching: lerp(pA.video.vhsHeadSwitching, pB.video.vhsHeadSwitching),
      vHoldDrift: lerp(pA.video.vHoldDrift, pB.video.vHoldDrift),
      meshDisplacement: lerp(pA.video.meshDisplacement, pB.video.meshDisplacement),
      chromaSmear: lerp(pA.video.chromaSmear, pB.video.chromaSmear),
      audioReact: lerp(pA.video.audioReact, pB.video.audioReact),
      luminance: lerp(pA.video.luminance, pB.video.luminance),
      datamosh: lerp(pA.video.datamosh ?? 0, pB.video.datamosh ?? 0)
    };

    const morphedAudio: AudioBendingParams = {
      ...audioParams,
      bitcrush: lerp(pA.audio.bitcrush, pB.audio.bitcrush),
      drive: lerp(pA.audio.drive, pB.audio.drive),
      filterCutoff: Math.round(lerp(pA.audio.filterCutoff, pB.audio.filterCutoff)),
      filterResonance: lerp(pA.audio.filterResonance, pB.audio.filterResonance),
      tapeSpeed: lerp(pA.audio.tapeSpeed, pB.audio.tapeSpeed),
      wowRate: lerp(pA.audio.wowRate, pB.audio.wowRate),
      wowDepth: lerp(pA.audio.wowDepth, pB.audio.wowDepth),
      flutterRate: lerp(pA.audio.flutterRate, pB.audio.flutterRate),
      flutterDepth: lerp(pA.audio.flutterDepth, pB.audio.flutterDepth),
      delayTime: lerp(pA.audio.delayTime, pB.audio.delayTime),
      reverbWet: lerp(pA.audio.reverbWet, pB.audio.reverbWet),
      tapeTone: lerp(pA.audio.tapeTone, pB.audio.tapeTone),
      tapeHiss: lerp(pA.audio.tapeHiss, pB.audio.tapeHiss),
      tapeDropouts: lerp(pA.audio.tapeDropouts, pB.audio.tapeDropouts),
      stutterSpeed: lerp(pA.audio.stutterSpeed, pB.audio.stutterSpeed),
      ringModMix: lerp(pA.audio.ringModMix ?? 0, pB.audio.ringModMix ?? 0),
      ringModFreq: Math.round(lerp(pA.audio.ringModFreq ?? 180, pB.audio.ringModFreq ?? 180))
    };

    setActivePresetId('morph-ab');
    setVideoParams(morphedVideo);
    setAudioParams(morphedAudio);
  }, [morphSlotA, morphSlotB, userPresets, audioParams]);

  // Unified Modulation & LFO Matrix Loop (Non-destructive around base control values!)
  useEffect(() => {
    const isChaosPadMoved = Math.abs(macroXY.x - 0.5) > 0.01 || Math.abs(macroXY.y - 0.5) > 0.01;
    if (!lfoConfig.enabled && modRoutings.length === 0 && !isChaosPadMoved && !punchInFx) {
      setModulatedVideoParams(videoParams);
      setModulatedAudioParams(audioParams);
      return;
    }

    let animId: number;
    lastModFrameTimeRef.current = performance.now() / 1000;

    const evalUnitWave = (
      phase: number,
      unit: SerumLfoUnit | undefined,
      fallbackShape: LfoShape,
      isLfo2: boolean
    ): number => {
      const p = ((phase % 1.0) + 1.0) % 1.0;
      const shape = unit?.shape ?? fallbackShape;
      switch (shape) {
        case 'sine':
          return (Math.sin(p * Math.PI * 2) + 1) / 2;
        case 'random':
          return isLfo2 ? lfo2RandomValRef.current : lfoRandomValRef.current;
        case 'drift':
          return isLfo2 ? lfo2DriftCurrentRef.current : lfoDriftCurrentRef.current;
        case 'custom':
          return evalMsegPoints(p, unit?.points ?? SHAPE_POINTS.sine);
        case 'triangle':
        case 'saw':
        case 'sawDown':
        case 'square':
          if (unit?.points && unit.points.length >= 2) {
            return evalMsegPoints(p, unit.points);
          }
          if (shape === 'triangle') return Math.abs(p * 2 - 1);
          if (shape === 'saw') return p;
          if (shape === 'sawDown') return 1.0 - p;
          return p < 0.5 ? 1.0 : 0.0;
        default:
          return (Math.sin(p * Math.PI * 2) + 1) / 2;
      }
    };

    const loop = () => {
      const now = performance.now() / 1000;

      const lfo1Rate = getEffectiveLfoRateHz(
        lfoConfig.lfo1?.syncDivision ?? 'free',
        lfoConfig.lfo1?.rate ?? lfoConfig.rate,
        bpm
      );
      const lfo2Rate = getEffectiveLfoRateHz(
        lfoConfig.lfo2?.syncDivision ?? 'free',
        lfoConfig.lfo2?.rate ?? lfoConfig.rate * 1.5,
        bpm
      );

      const basePhase = ((now * lfo1Rate) % 1.0 + 1.0) % 1.0;
      const lfo2Phase = ((now * lfo2Rate) % 1.0 + 1.0) % 1.0;

      // Update S&H Random & Drift steps for LFO 1
      const step1 = Math.floor(now * lfo1Rate);
      if (step1 !== lastLfoStepRef.current) {
        lastLfoStepRef.current = step1;
        lfoRandomValRef.current = Math.random();
        lfoDriftTargetRef.current = Math.random();
      }
      lfoDriftCurrentRef.current += (lfoDriftTargetRef.current - lfoDriftCurrentRef.current) * 0.04;

      // Update S&H Random & Drift steps for LFO 2
      const step2 = Math.floor(now * lfo2Rate);
      if (step2 !== lastLfo2StepRef.current) {
        lastLfo2StepRef.current = step2;
        lfo2RandomValRef.current = Math.random();
        lfo2DriftTargetRef.current = Math.random();
      }
      lfo2DriftCurrentRef.current += (lfo2DriftTargetRef.current - lfo2DriftCurrentRef.current) * 0.04;

      // Update live sources for MSEG playhead & routing matrix
      const lfo1Val = evalUnitWave(basePhase, lfoConfig.lfo1, lfoConfig.shape, false);
      const lfo2Val = evalUnitWave(lfo2Phase, lfoConfig.lfo2, 'triangle', true);
      const envAudioVal = audioEngineRef.current ? audioEngineRef.current.getBassEnergy() : 0.0;

      liveSourcesRef.current = {
        lfo1: lfo1Val,
        lfo2: lfo2Val,
        envAudio: envAudioVal,
        macroX: macroXY.x,
        macroY: macroXY.y
      };

      const nextVideo: VideoBendingParams = { ...videoParams };
      const nextAudio: AudioBendingParams = { ...audioParams };

      // 1. Primary LFO Matrix Targets (Additive / Bipolar around user's base control value)
      if (lfoConfig.enabled) {
        const { targets, phaseSpread, depth, shape, customVideoEnabled, customVideoTarget, customAudioEnabled, customAudioTarget } = lfoConfig;
        let idx = 0;

        const getWaveBipolar = () => {
          const targetPhase = basePhase + (idx++) * (phaseSpread * 0.22);
          return (evalUnitWave(targetPhase, lfoConfig.lfo1, shape, false) - 0.5) * 2.0 * depth;
        };

        const modNorm = (base: number, scale = 0.5) =>
          Math.max(0.0, Math.min(1.0, base + getWaveBipolar() * scale));

        if (targets.glitchIntensity) nextVideo.glitchIntensity = modNorm(videoParams.glitchIntensity, 0.45);
        if (targets.rgbShift) nextVideo.rgbShift = modNorm(videoParams.rgbShift, 0.45);
        if (targets.scanlines) nextVideo.scanlines = modNorm(videoParams.scanlines || 0.25, 0.45);
        if (targets.meshDisplacement) nextVideo.meshDisplacement = modNorm(videoParams.meshDisplacement, 0.45);
        if (targets.luminance) nextVideo.luminance = modNorm(videoParams.luminance, 0.45);
        if (targets.colorBleed) nextVideo.colorBleed = modNorm(videoParams.colorBleed, 0.45);

        if (customVideoEnabled && customVideoTarget) {
          (nextVideo as any)[customVideoTarget] = modNorm((videoParams as any)[customVideoTarget] ?? 0.25, 0.45);
        }

        // Audio quick matrix targets
        if (targets.filterCutoff) {
          const swing = getWaveBipolar() * 4500;
          nextAudio.filterCutoff = Math.round(Math.max(80, Math.min(16000, audioParams.filterCutoff + swing)));
        }
        if (targets.drive) {
          nextAudio.drive = Number(modNorm(audioParams.drive || 0.1, 0.22).toFixed(2));
        }
        if (targets.tapeSpeed) {
          const spdSwing = getWaveBipolar() * 0.05;
          nextAudio.tapeSpeed = Number(Math.max(0.5, Math.min(1.1, audioParams.tapeSpeed + spdSwing)).toFixed(3));
        }
        if (targets.reverbWet) {
          nextAudio.reverbWet = Number(modNorm(audioParams.reverbWet || 0.2, 0.35).toFixed(2));
        }

        if (customAudioEnabled && customAudioTarget) {
          const range = PARAM_RANGES[`audio.${customAudioTarget}`] || [0.0, 1.0];
          const span = range[1] - range[0];
          const base = (audioParams as any)[customAudioTarget] ?? range[0];
          const modulated = Math.max(range[0], Math.min(range[1], base + getWaveBipolar() * span * 0.25));
          (nextAudio as any)[customAudioTarget] = Number(modulated.toFixed(3));
        }
      }

      // 2. Drag & Drop ModRoutings (Supports LFO1, LFO2, ENV AUDIO, MACRO X, MACRO Y)
      for (const route of modRoutings) {
        const rawSrc = liveSourcesRef.current[route.source] ?? 0.5;
        const [minVal, maxVal] = PARAM_RANGES[route.target] || [0.0, 1.0];

        if (route.target.startsWith('video.')) {
          const k = route.target.replace('video.', '') as VideoParamKey;
          const base = (nextVideo[k] ?? 0) as number;
          const effectiveBipolar =
            route.bipolar &&
            route.source !== 'envAudio' &&
            base > minVal + (maxVal - minVal) * 0.05;
          const srcSignal = effectiveBipolar ? (rawSrc - 0.5) * 2.0 : rawSrc;
          const delta = srcSignal * route.amount * (maxVal - minVal);
          (nextVideo as any)[k] = Number(Math.max(minVal, Math.min(maxVal, base + delta)).toFixed(3));
        } else if (route.target.startsWith('audio.')) {
          const k = route.target.replace('audio.', '') as AudioParamKey;
          const base = (nextAudio[k] ?? 0) as number;
          const effectiveBipolar =
            route.bipolar &&
            route.source !== 'envAudio' &&
            base > minVal + (maxVal - minVal) * 0.05;
          const srcSignal = effectiveBipolar ? (rawSrc - 0.5) * 2.0 : rawSrc;
          const delta = srcSignal * route.amount * (maxVal - minVal);
          const val = Math.max(minVal, Math.min(maxVal, base + delta));
          (nextAudio as any)[k] = maxVal > 100 ? Math.round(val) : Number(val.toFixed(3));
        }
      }

      // 3. Direct X/Y Chaos Pad Performance Offset when no manual macroX/macroY routing is assigned
      const hasMacroRouting = modRoutings.some((r) => r.source === 'macroX' || r.source === 'macroY');
      if (isChaosPadMoved && !hasMacroRouting) {
        const dx = macroXY.x - 0.5;
        const dy = macroXY.y - 0.5;
        nextVideo.glitchIntensity = Math.max(0, Math.min(1, nextVideo.glitchIntensity + Math.max(0, dx) * 0.7));
        nextVideo.rgbShift = Math.max(0, Math.min(1, nextVideo.rgbShift + Math.abs(dx) * 0.6));
        nextVideo.datamosh = Math.max(0, Math.min(1, (nextVideo.datamosh || 0) + Math.max(0, dy) * 0.8));
        nextAudio.filterCutoff = Math.round(Math.max(120, Math.min(16000, nextAudio.filterCutoff + dy * 9000)));
      }

      // 4. Momentary Keyboard Punch-In FX (Hold D / X / C)
      if (punchInFx === 'datamosh') {
        nextVideo.datamosh = Math.max(nextVideo.datamosh ?? 0, 0.85);
        nextVideo.rgbShift = Math.min(1, nextVideo.rgbShift + 0.35);
      } else if (punchInFx === 'glitch') {
        nextVideo.glitchIntensity = Math.max(nextVideo.glitchIntensity, 0.78);
        nextVideo.vhsHeadSwitching = Math.max(nextVideo.vhsHeadSwitching, 0.65);
        nextVideo.rgbShift = Math.min(1, nextVideo.rgbShift + 0.4);
      } else if (punchInFx === 'crush') {
        nextAudio.bitcrush = Math.max(nextAudio.bitcrush, 0.55);
        nextAudio.ringModMix = Math.max(nextAudio.ringModMix || 0, 0.65);
        nextVideo.colorBleed = Math.max(nextVideo.colorBleed, 0.75);
      }

      // Update Web Audio engine directly at 60Hz for zero latency
      if (audioEngineRef.current) {
        audioEngineRef.current.updateParams(nextAudio);
      }

      // Commit React UI state at ~30Hz (every 32ms) so React DOM reconciliation never starves WebGL / MediaRecorder
      if (now - lastModFrameTimeRef.current >= 0.032) {
        lastModFrameTimeRef.current = now;
        setModulatedVideoParams(nextVideo);
        setModulatedAudioParams(nextAudio);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [lfoConfig, modRoutings, videoParams, audioParams, macroXY, bpm, punchInFx]);

  // Initialize Web MIDI Engine
  useEffect(() => {
    const engine = new MidiEngine();
    midiEngineRef.current = engine;

    engine.onStateChange((connected, name) => {
      setMidiConnected(connected);
      setMidiDeviceName(name);
    });

    engine.onActivity((ev) => {
      if (ev.type === 'noteOn' || (ev.type === 'cc' && ev.value > 0)) {
        const actionLabel = ev.targetMapped 
          ? ev.targetMapped.replace('action.', '').replace('video.', 'Vidéo: ').replace('audio.', 'Audio: ') 
          : null;
        showToast(
          actionLabel 
            ? `🎛️ MIDI : ${actionLabel.toUpperCase()}` 
            : `🎛️ Signal MIDI : ${ev.type.toUpperCase()} #${ev.paramNumber}`,
          ev.targetMapped ? `Déclenché via Pad/Bouton #${ev.paramNumber}` : `Valeur: ${ev.value} (Ouvrez le menu MIDI pour assigner)`
        );
      }
    });

    engine.init((target: MidiTarget, normalized: number, isTrigger: boolean) => {
      if (target.startsWith('video.')) {
        const key = target.replace('video.', '') as keyof VideoBendingParams;
        setActivePresetId((prev) => (prev === 'custom' ? prev : 'custom'));
        setVideoParams((prev) => ({ ...prev, [key]: normalized }));
      } else if (target.startsWith('audio.')) {
        const key = target.replace('audio.', '');
        setActivePresetId((prev) => (prev === 'custom' ? prev : 'custom'));
        if (key === 'filterCutoff') {
          const hz = Math.round(80 * Math.pow(18000 / 80, normalized));
          setAudioParams((prev) => ({ ...prev, filterCutoff: hz }));
        } else if (key === 'filterResonance') {
          setAudioParams((prev) => ({ ...prev, filterResonance: 0.1 + normalized * 18.0 }));
        } else if (key === 'tapeSpeed') {
          setAudioParams((prev) => ({ ...prev, tapeSpeed: 0.5 + normalized * 1.0 }));
        } else if (key === 'stutterSpeed') {
          setAudioParams((prev) => ({ ...prev, stutterSpeed: 0.05 + normalized * 0.30 }));
        } else if (key === 'ringModFreq') {
          setAudioParams((prev) => ({ ...prev, ringModFreq: Math.round(30 + normalized * 1170) }));
        } else {
          setAudioParams((prev) => ({ ...prev, [key]: normalized }));
        }
      } else if (target.startsWith('mod.')) {
        const h = actionHandlersRef.current;
        if (target === 'mod.morphAB' && h.changeMorph) {
          h.changeMorph(Number(normalized.toFixed(2)));
        } else if (target === 'mod.macroX') {
          setMacroXY((prev) => ({ ...prev, x: Number(normalized.toFixed(3)) }));
        } else if (target === 'mod.macroY') {
          setMacroXY((prev) => ({ ...prev, y: Number(normalized.toFixed(3)) }));
        } else if (target === 'mod.lfo1Rate') {
          const hz = Number((0.1 + normalized * 11.9).toFixed(2));
          setLfoConfig((prev): LfoConfig => {
            const defaultPts = prev.shape !== 'custom' ? SHAPE_POINTS[prev.shape] : SHAPE_POINTS.sine;
            return {
              ...prev,
              enabled: true,
              rate: hz,
              lfo1: {
                id: 'lfo1',
                enabled: true,
                smooth: prev.lfo1?.smooth ?? 0,
                shape: prev.lfo1?.shape ?? prev.shape,
                points: prev.lfo1?.points ?? defaultPts,
                rate: hz,
                syncDivision: 'free'
              }
            };
          });
        } else if (target === 'mod.lfo2Rate') {
          const hz = Number((0.1 + normalized * 11.9).toFixed(2));
          setLfoConfig((prev): LfoConfig => ({
            ...prev,
            enabled: true,
            lfo2: {
              id: 'lfo2',
              enabled: true,
              smooth: prev.lfo2?.smooth ?? 0,
              shape: prev.lfo2?.shape ?? 'triangle',
              points: prev.lfo2?.points ?? SHAPE_POINTS.triangle,
              rate: hz,
              syncDivision: 'free'
            }
          }));
        } else if (target === 'mod.lfoDepth') {
          setLfoConfig((prev) => ({ ...prev, enabled: true, depth: Number(normalized.toFixed(2)) }));
        }
      } else if (target.startsWith('action.') && isTrigger) {
        const h = actionHandlersRef.current;
        if (target === 'action.playToggle' && h.playToggle) h.playToggle();
        else if (target === 'action.tapeFreeze' && h.tapeFreeze) h.tapeFreeze();
        else if (target === 'action.randomize' && h.randomize) h.randomize();
        else if (target === 'action.resetClean' && h.resetClean) h.resetClean();
        else if (target === 'action.snapshot' && h.snapshot) h.snapshot();
        else if (target === 'action.recordToggle' && h.recordToggle) h.recordToggle();
        else if (target === 'action.tapTempo' && h.tapTempo) h.tapTempo();
        else if (target === 'action.lfoToggle' && h.lfoToggle) h.lfoToggle();
        else if (target === 'action.vcrOsdToggle' && h.vcrOsdToggle) h.vcrOsdToggle();
        else if (target === 'action.preset0' && h.applyPreset) h.applyPreset(PRESETS[0]);
        else if (target === 'action.preset1' && h.applyPreset) h.applyPreset(PRESETS[1]);
        else if (target === 'action.preset2' && h.applyPreset) h.applyPreset(PRESETS[2]);
        else if (target === 'action.preset3' && h.applyPreset) h.applyPreset(PRESETS[3]);
        else if (target === 'action.preset4' && h.applyPreset && PRESETS[4]) h.applyPreset(PRESETS[4]);
        else if (target === 'action.nextTrack' && h.nextTrack) h.nextTrack();
        else if (target === 'action.prevTrack' && h.prevTrack) h.prevTrack();
      }
    });
  }, [showToast]);

  // Initialize Web Audio Engine
  useEffect(() => {
    const engine = new AudioCircuitEngine();
    audioEngineRef.current = engine;

    return () => {
      engine.dispose();
      audioEngineRef.current = null;
    };
  }, []);

  // Sync Modulated Audio Parameters to Engine
  useEffect(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.updateParams(modulatedAudioParams);
    }
  }, [modulatedAudioParams]);

  // Connect video element to Web Audio
  const handleEnsureAudioWired = useCallback(() => {
    if (!videoRef.current || !audioEngineRef.current) return;
    audioEngineRef.current.init(videoRef.current);
    audioEngineRef.current.resume();
    setAudioState(audioEngineRef.current.getContextState());
  }, []);

  // Decode URL `?patch=...` if present on initial load
  const initialLoadRef = useRef<boolean>(false);
  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const encodedPatch = params.get('patch');
    if (encodedPatch) {
      try {
        const decoded = JSON.parse(atob(encodedPatch));
        if (decoded.video) setVideoParams((prev) => ({ ...prev, ...decoded.video }));
        if (decoded.audio) setAudioParams((prev) => ({ ...prev, ...decoded.audio }));
        if (decoded.lfo) setLfoConfig((prev) => ({ ...prev, ...decoded.lfo }));
        if (decoded.modRoutings) setModRoutings(decoded.modRoutings);
        setActivePresetId('shared-url');
        // Clean `?patch=...` from the address bar after importing so refreshes/HMR don't re-trigger it
        window.history.replaceState({}, '', window.location.pathname);
        showToast('🔗 PATCH URL CHARGÉ', 'Réglages restaurés depuis le lien partagé');
      } catch (e) {
        console.warn('[Patch URL Decode Error]:', e);
      }
    }

    appendPlaylistUrl('https://www.youtube.com/watch?v=4RCrvRXUrs4&list=PLqftF03PwhxzYiafvN4C1AzQtDuPeeYqw');
  }, [showToast]);

  // Share Patch via URL (`?patch=...`)
  const handleSharePatchUrl = useCallback(() => {
    try {
      const payload = {
        video: videoParams,
        audio: audioParams,
        lfo: lfoConfig,
        modRoutings
      };
      const base64 = btoa(JSON.stringify(payload));
      const url = `${window.location.origin}${window.location.pathname}?patch=${encodeURIComponent(base64)}`;
      navigator.clipboard.writeText(url);
      setShareUrlCopied(true);
      setTimeout(() => setShareUrlCopied(false), 2200);
      showToast('🔗 LIEN DE PATCH COPIÉ', 'Partagez cette URL pour envoyer votre patch exact');
    } catch (err) {
      console.error('[Share URL Error]:', err);
    }
  }, [videoParams, audioParams, lfoConfig, modRoutings, showToast]);

  // Stop any active Webcam / Screen MediaStream
  const stopLiveMediaStream = useCallback(() => {
    if (liveMediaStreamRef.current) {
      liveMediaStreamRef.current.getTracks().forEach((t) => t.stop());
      liveMediaStreamRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Switch Live Input Source (YouTube / Webcam / Screen / Local File)
  const handleSelectLiveSource = useCallback(async (source: LiveInputSource) => {
    if (!videoRef.current) return;

    if (source === 'webcam') {
      try {
        stopLiveMediaStream();
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        liveMediaStreamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setLiveSource('webcam');
        setIsPlaying(true);
        setLocalMediaTitle('LIVE WEBCAM FEED');
        showToast('📷 WEBCAM ACTIVE', 'Flux caméra routé dans les shaders VHS/CRT');
      } catch (err: any) {
        showToast('⚠️ ACCÈS WEBCAM REFUSÉ', err?.message || 'Vérifiez les permissions caméra');
      }
    } else if (source === 'screen') {
      try {
        stopLiveMediaStream();
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        liveMediaStreamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setLiveSource('screen');
        setIsPlaying(true);
        setLocalMediaTitle('LIVE SCREEN CAPTURE');
        showToast('🖥️ CAPTURE D’ÉCRAN ACTIVE', 'Flux écran routé dans le moteur Glitch');
      } catch (err: any) {
        showToast('⚠️ CAPTURE ANNULÉE', err?.message || 'Partage d’écran interrompu');
      }
    } else if (source === 'youtube') {
      stopLiveMediaStream();
      setLiveSource('youtube');
      setLocalMediaTitle(null);
      if (playlist[currentIndex]) {
        loadTrackAtIndex(currentIndex, playlist);
      }
    }
  }, [currentIndex, playlist, showToast, stopLiveMediaStream]);

  // Load Dropped or Selected Local File (Video / Audio / Preset JSON)
  const handleLoadLocalFile = useCallback((file: File) => {
    if (file.name.toLowerCase().endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          handleImportPresetJson(reader.result);
          showToast(`📂 PRESET IMPORTÉ : ${file.name}`, 'Patch JSON appliqué par Drag & Drop');
        }
      };
      reader.readAsText(file);
      return;
    }

    if (!videoRef.current) return;
    stopLiveMediaStream();
    const blobUrl = URL.createObjectURL(file);
    setLiveSource('local');
    setLocalMediaTitle(file.name);
    videoRef.current.src = blobUrl;
    videoRef.current.loop = true;
    videoRef.current.load();
    videoRef.current.play().then(() => {
      setIsPlaying(true);
      handleEnsureAudioWired();
      showToast(`🎬 MÉDIA LOCAL : ${file.name}`, 'Lecture directe dans les shaders & le DSP Audio');
    }).catch((err) => {
      console.warn('[Local File Playback Warning]:', err);
    });
  }, [handleEnsureAudioWired, showToast, stopLiveMediaStream]);

  // Load & Append YouTube Video / Playlist to current queue
  const appendPlaylistUrl = async (url: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Échec de connexion au serveur de flux.' }));
        throw new Error(errorData.error || `Erreur serveur (${response.status})`);
      }

      const data = await response.json();
      if (!data.items || data.items.length === 0) {
        throw new Error('Aucun flux média exploitable trouvé pour ce lien.');
      }

      setPlaylist((prev) => {
        const wasEmpty = prev.length === 0;
        const existingIds = new Set(prev.map(i => i.id));
        const newItems = data.items.filter((i: PlaylistItem) => !existingIds.has(i.id));

        if (newItems.length === 0) {
          showToast('ℹ️ DÉJÀ DANS LA FILE', 'Ce titre est déjà présent dans la playlist');
          return prev;
        }

        const merged = [...prev, ...newItems];

        if (wasEmpty) {
          // Only auto-start playback if the playlist was completely empty
          setTimeout(() => loadTrackAtIndex(0, merged), 50);
        } else {
          // Keep current track playing seamlessly & pre-buffer newly added track in background
          const addedTitle = newItems.length === 1 ? newItems[0].title : `${newItems.length} titres ajoutés`;
          showToast('➕ AJOUTÉ À LA FILE (PRÉ-CHARGEMENT EN COURS)', addedTitle);
          if (newItems[0]?.id) {
            fetch('/api/prefetch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: newItems[0].id })
            }).catch(() => {});
          }
        }
        return merged;
      });

      if (data.playlistTitle) {
        setPlaylistTitle(data.playlistTitle);
      }
    } catch (err: any) {
      console.error('[Playlist Load Error]:', err);
      setError(err.message || 'Erreur lors du chargement de la vidéo.');
      setIsPlaylistOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTrackAtIndex = (index: number, list = playlist) => {
    if (!list[index] || !videoRef.current) return;
    stopLiveMediaStream();
    setLiveSource('youtube');
    setLocalMediaTitle(null);
    setCurrentIndex(index);
    const track = list[index];

    if (track?.duration && track.duration > 0) {
      setDuration(track.duration);
    }

    videoRef.current.loop = false;
    videoRef.current.src = track.streamUrl;
    videoRef.current.load();
    videoRef.current.play().then(() => {
      setIsPlaying(true);
      handleEnsureAudioWired();
    }).catch((err) => {
      console.warn('[Video Playback Warning]:', err.message);
      setIsPlaying(false);
    });

    // Pre-buffer next track in queue 4s after current stream starts
    if (list.length > 1) {
      const nextTrack = list[(index + 1) % list.length];
      if (nextTrack?.id) {
        setTimeout(() => {
          fetch('/api/prefetch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: nextTrack.id })
          }).catch(() => {});
        }, 4000);
      }
    }
  };

  const handlePlayToggle = () => {
    if (!videoRef.current) return;
    handleEnsureAudioWired();

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.error('Play failed:', err);
      });
    }
  };

  const handleNextTrack = () => {
    if (playlist.length === 0) return;
    const nextIdx = (currentIndex + 1) % playlist.length;
    setIsTapeFreeze(false);
    loadTrackAtIndex(nextIdx);
  };

  const handlePrevTrack = () => {
    if (playlist.length === 0) return;
    const prevIdx = (currentIndex - 1 + playlist.length) % playlist.length;
    setIsTapeFreeze(false);
    loadTrackAtIndex(prevIdx);
  };

  const handleRemoveTrack = (index: number) => {
    setPlaylist(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (currentIndex >= next.length) {
        setCurrentIndex(Math.max(0, next.length - 1));
      }
      return next;
    });
  };

  const handleToggleTapeFreeze = () => {
    if (!audioEngineRef.current) return;
    handleEnsureAudioWired();

    const nextState = audioEngineRef.current.toggleTapeFreeze(
      audioParams.tapeSpeed || 1.0,
      audioParams.stutterSpeed || 0.12,
      (active) => {
        setIsTapeFreeze(active);
      }
    );
    setIsTapeFreeze(nextState);

    if (!nextState && videoRef.current && videoRef.current.paused) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {});
    }
  };

  // Direct Session Video Recorder
  const handleToggleRecord = () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      setIsRecording(false);
    } else {
      if (!canvasRef.current) {
        alert('Canvas 3D WebGL non disponible pour l’enregistrement.');
        return;
      }
      try {
        // Lock captureStream to 30 FPS so offscreen Datamosh passes don't trigger double GPU readbacks
        const videoStream = canvasRef.current.captureStream(30);
        const audioDest = audioEngineRef.current ? audioEngineRef.current.getMediaStreamDestination() : null;
        const tracks = [
          ...videoStream.getVideoTracks(),
          ...(audioDest ? audioDest.stream.getAudioTracks() : [])
        ];
        const combinedStream = new MediaStream(tracks);

        // Prioritize hardware-accelerated H.264 & fast VP8 over CPU-heavy software VP9
        const candidateMimeTypes = [
          'video/webm;codecs=h264,opus',
          'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
          'video/mp4;codecs=avc1,mp4a.40.2',
          'video/mp4;codecs=avc1',
          'video/mp4',
          'video/webm;codecs=vp8,opus',
          'video/webm;codecs=vp9,opus',
          'video/webm'
        ];
        let mimeType = 'video/webm';
        if (typeof MediaRecorder !== 'undefined') {
          for (const candidate of candidateMimeTypes) {
            if (MediaRecorder.isTypeSupported(candidate)) {
              mimeType = candidate;
              break;
            }
          }
        }

        const recorder = new MediaRecorder(combinedStream, {
          mimeType,
          videoBitsPerSecond: 4_500_000,
          audioBitsPerSecond: 192_000
        });
        recordedChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = async () => {
          // Release canvas capture track immediately so GPU readback stops
          videoStream.getVideoTracks().forEach((t) => t.stop());
          const rawBlob = new Blob(recordedChunksRef.current, { type: mimeType });

          const triggerDownload = (blob: Blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `circuitbend-clip-${Date.now()}.mp4`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }, 300);

            showToast('💾 CLIP MP4 TÉLÉCHARGÉ', 'Enregistrement 60 FPS sauvegardé avec succès');
          };

          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const res = await fetch('/api/convert-mp4', {
              method: 'POST',
              headers: { 'Content-Type': 'application/octet-stream' },
              body: rawBlob,
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (res.ok) {
              const mp4Blob = await res.blob();
              triggerDownload(mp4Blob);
              return;
            }
          } catch (e) {
            console.warn('[MP4 Background Conversion - fallback to direct download]:', e);
          }

          triggerDownload(rawBlob);
        };

        // Flush encoded chunks every 1000ms to prevent RAM buffer stalls
        recorder.start(1000);
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        setRecordingDuration(0);

        recordTimerRef.current = setInterval(() => {
          setRecordingDuration((prev) => prev + 1);
        }, 1000);
      } catch (err) {
        console.error('[Recording Error]:', err);
        alert('Impossible de démarrer l’enregistrement MediaStream.');
      }
    }
  };

  const handleApplyPreset = (preset: Preset) => {
    setActivePresetId(preset.id);
    setVideoParams(preset.video);
    setAudioParams(preset.audio);
    if (preset.id === 'clean') {
      setLfoConfig((prev) => ({ ...prev, enabled: false }));
      setModRoutings([]);
    }
    if (audioEngineRef.current) {
      audioEngineRef.current.updateParams(preset.audio);
    }
  };

  // User Custom Presets Handlers
  const handleSaveUserPreset = (name: string) => {
    const trimmed = name.trim() || `Patch #${userPresets.length + 1}`;
    const newPreset: UserPreset = {
      id: `user-${Date.now()}`,
      name: trimmed,
      createdAt: Date.now(),
      video: { ...videoParams },
      audio: { ...audioParams },
      lfo: { ...lfoConfig },
      modMatrix: [...modRoutings]
    };
    const updated = [newPreset, ...userPresets];
    setUserPresets(updated);
    try {
      localStorage.setItem('ytb_circuitbend_user_presets', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    setActivePresetId(newPreset.id);
  };

  const handleDeleteUserPreset = (id: string) => {
    const updated = userPresets.filter((p) => p.id !== id);
    setUserPresets(updated);
    try {
      localStorage.setItem('ytb_circuitbend_user_presets', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    if (activePresetId === id) {
      setActivePresetId('clean');
    }
  };

  const handleApplyUserPreset = (preset: UserPreset) => {
    setActivePresetId(preset.id);
    setVideoParams(preset.video);
    setAudioParams(preset.audio);
    if (preset.lfo) {
      setLfoConfig(preset.lfo);
    }
    if (preset.modMatrix) {
      setModRoutings(preset.modMatrix);
    }
    if (audioEngineRef.current) {
      audioEngineRef.current.updateParams(preset.audio);
    }
  };

  const handleImportPresetJson = (jsonStr: string): boolean => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.video && parsed.audio) {
        const importedPreset: UserPreset = {
          id: `user-${Date.now()}`,
          name: parsed.name || 'Imported Patch',
          createdAt: Date.now(),
          video: parsed.video,
          audio: parsed.audio,
          lfo: parsed.lfo,
          modMatrix: parsed.modMatrix
        };
        const updated = [importedPreset, ...userPresets];
        setUserPresets(updated);
        try {
          localStorage.setItem('ytb_circuitbend_user_presets', JSON.stringify(updated));
        } catch (e) {
          console.error(e);
        }
        handleApplyUserPreset(importedPreset);
        return true;
      }
    } catch (err) {
      alert('Format JSON de preset invalide');
    }
    return false;
  };

  // High-Resolution Photo Snapshot Handler
  const handleTakeSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      alert('Canvas 3D non prêt pour la capture');
      return;
    }
    try {
      setSnapshotFlash(true);
      setTimeout(() => setSnapshotFlash(false), 220);

      const dataUrl = canvas.toDataURL('image/png');
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const filename = `circuitbend-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;

      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
      }, 100);
    } catch (err) {
      console.error('[Snapshot Error]:', err);
    }
  }, []);

  const handleRandomize = () => {
    setActivePresetId('custom-random');
    const rnd = (min: number, max: number) => min + Math.random() * (max - min);

    const randomVideo: VideoBendingParams = {
      glitchIntensity: Number(rnd(0.04, 0.35).toFixed(2)),
      rgbShift: Number(rnd(0.08, 0.38).toFixed(2)),
      scanlines: Number(rnd(0.15, 0.55).toFixed(2)),
      colorBleed: Number(rnd(0.15, 0.50).toFixed(2)),
      feedback: Number(rnd(0.05, 0.32).toFixed(2)),
      noise: Number(rnd(0.03, 0.18).toFixed(2)),
      vaporwaveTint: Number(rnd(0.25, 0.80).toFixed(2)),
      crtCurvature: Number(rnd(0.08, 0.30).toFixed(2)),
      apertureGrille: Number(rnd(0.12, 0.50).toFixed(2)),
      vhsHeadSwitching: Math.random() > 0.4 ? Number(rnd(0.10, 0.40).toFixed(2)) : 0.0,
      vHoldDrift: Math.random() > 0.85 ? Number(rnd(0.02, 0.10).toFixed(2)) : 0.0,
      meshDisplacement: Number(rnd(0.05, 0.35).toFixed(2)),
      chromaSmear: Number(rnd(0.05, 0.35).toFixed(2)),
      audioReact: Number(rnd(0.15, 0.55).toFixed(2)),
      luminance: Number(rnd(0.05, 0.35).toFixed(2)),
      datamosh: Number(rnd(0.08, 0.55).toFixed(2))
    };

    const randomAudio: AudioBendingParams = {
      ...audioParams,
      tapeSpeed: Math.random() > 0.35 ? Number(rnd(0.82, 0.96).toFixed(2)) : 1.0,
      wowRate: Number(rnd(0.4, 1.2).toFixed(1)),
      wowDepth: Number(rnd(0.03, 0.14).toFixed(2)),
      flutterRate: Number(rnd(6.0, 9.5).toFixed(1)),
      flutterDepth: Number(rnd(0.01, 0.06).toFixed(2)),
      tapeTone: Number(rnd(0.15, 0.42).toFixed(2)),
      tapeHiss: Number(rnd(0.003, 0.015).toFixed(3)),
      tapeDropouts: Math.random() > 0.5 ? Number(rnd(0.02, 0.08).toFixed(2)) : 0.0,
      stutterSpeed: Number(rnd(0.08, 0.18).toFixed(2)),
      reverbWet: Number(rnd(0.15, 0.38).toFixed(2)),
      bitcrush: Math.random() > 0.65 ? Number(rnd(0.01, 0.04).toFixed(2)) : 0.0,
      drive: Number(rnd(0.04, 0.16).toFixed(2)),
      ringModMix: Math.random() > 0.75 ? Number(rnd(0.05, 0.22).toFixed(2)) : 0.0,
      ringModFreq: Math.round(rnd(90, 340)),
      filterCutoff: Math.round(rnd(3500, 9200)),
      filterResonance: Number(rnd(0.8, 1.8).toFixed(1)),
      filterType: 'lowpass'
    };

    const musicalShapes: LfoShape[] = ['sine', 'triangle', 'drift', 'sine', 'drift', 'triangle'];
    const randomShape = musicalShapes[Math.floor(Math.random() * musicalShapes.length)];

    const randomTargets: Record<LfoTargetId, boolean> = {
      filterCutoff: false,
      tapeSpeed: false,
      drive: false,
      reverbWet: false,
      glitchIntensity: false,
      rgbShift: false,
      scanlines: false,
      meshDisplacement: false,
      luminance: false,
      colorBleed: false
    };

    const audioChoices: LfoTargetId[] = ['filterCutoff', 'reverbWet', 'drive'];
    const chosenAudio = audioChoices[Math.floor(Math.random() * audioChoices.length)];
    randomTargets[chosenAudio] = true;

    const videoChoices: LfoTargetId[] = ['rgbShift', 'scanlines', 'luminance', 'meshDisplacement', 'glitchIntensity'];
    const numVideo = Math.floor(rnd(1, 3));
    const shuffledVideo = [...videoChoices].sort(() => 0.5 - Math.random());
    for (let i = 0; i < numVideo; i++) {
      randomTargets[shuffledVideo[i]] = true;
    }

    const audioSlotKeys: AudioParamKey[] = ['reverbWet', 'filterCutoff', 'tapeTone', 'drive', 'wowDepth', 'flutterDepth'];
    const randomAudioTarget = audioSlotKeys[Math.floor(Math.random() * audioSlotKeys.length)];

    const videoSlotKeys: VideoParamKey[] = ['datamosh', 'feedback', 'chromaSmear', 'vaporwaveTint', 'crtCurvature'];
    const randomVideoTarget = videoSlotKeys[Math.floor(Math.random() * videoSlotKeys.length)];

    // Also generate 2 visual ring routings
    setModRoutings([
      {
        id: `rnd-lfo1-${Date.now()}`,
        source: 'lfo1',
        target: 'video.rgbShift',
        amount: Number(rnd(0.25, 0.45).toFixed(2)),
        bipolar: true
      },
      {
        id: `rnd-env-${Date.now() + 1}`,
        source: 'envAudio',
        target: Math.random() > 0.4 ? 'video.datamosh' : 'video.luminance',
        amount: Number(rnd(0.25, 0.50).toFixed(2)),
        bipolar: false
      }
    ]);

    setLfoConfig({
      enabled: true,
      shape: randomShape,
      rate: Number(rnd(0.20, 1.10).toFixed(2)),
      depth: Number(rnd(0.30, 0.58).toFixed(2)),
      phaseSpread: Number(rnd(0.20, 0.60).toFixed(2)),
      targets: randomTargets,
      customAudioTarget: randomAudioTarget,
      customAudioEnabled: Math.random() > 0.5,
      customVideoTarget: randomVideoTarget,
      customVideoEnabled: Math.random() > 0.4
    });

    setVideoParams(randomVideo);
    setAudioParams(randomAudio);
  };

  actionHandlersRef.current = {
    playToggle: handlePlayToggle,
    tapeFreeze: handleToggleTapeFreeze,
    randomize: handleRandomize,
    resetClean: () => handleApplyPreset(PRESETS[0]),
    snapshot: handleTakeSnapshot,
    recordToggle: handleToggleRecord,
    nextTrack: handleNextTrack,
    prevTrack: handlePrevTrack,
    applyPreset: handleApplyPreset,
    tapTempo: handleTapTempo,
    lfoToggle: () => setLfoConfig((prev) => ({ ...prev, enabled: !prev.enabled })),
    vcrOsdToggle: () => setShowVcrOsd((prev) => !prev),
    changeMorph: handleChangeMorphAmount
  };

  // Studio & Live Performance Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }

      const key = e.key.toLowerCase();

      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayToggle();
      } else if (key === 't' || key === 'f') {
        e.preventDefault();
        handleToggleTapeFreeze();
      } else if (key === 'r') {
        e.preventDefault();
        handleRandomize();
      } else if (key === 'l') {
        e.preventDefault();
        setLfoConfig((prev) => ({ ...prev, enabled: !prev.enabled }));
      } else if (key === 'v') {
        e.preventDefault();
        setShowVcrOsd((prev) => !prev);
      } else if (key === 'b') {
        e.preventDefault();
        handleTapTempo();
      } else if (key === 'd' && !e.repeat) {
        e.preventDefault();
        setPunchInFx('datamosh');
        showToast('💥 PUNCH-IN : DATAMOSH MELT [D]', 'Relâchez la touche D pour revenir au signal normal');
      } else if (key === 'x' && !e.repeat) {
        e.preventDefault();
        setPunchInFx('glitch');
        showToast('⚡ PUNCH-IN : H-SYNC GLITCH [X]', 'Relâchez la touche X pour revenir au signal normal');
      } else if (key === 'c' && !e.repeat) {
        e.preventDefault();
        setPunchInFx('crush');
        showToast('🔊 PUNCH-IN : BITCRUSH + RING MOD [C]', 'Relâchez la touche C pour revenir au signal normal');
      } else if (key === 's' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleTakeSnapshot();
      } else if (key === 'z') {
        e.preventDefault();
        setIsZenMode((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsZenMode(false);
        setIsPlaylistOpen(false);
      } else if (e.key >= '1' && e.key <= '8') {
        const idx = parseInt(e.key, 10) - 1;
        if (PRESETS[idx]) {
          e.preventDefault();
          handleApplyPreset(PRESETS[idx]);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'd' || key === 'x' || key === 'c') {
        setPunchInFx(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handlePlayToggle, handleToggleTapeFreeze, handleRandomize, handleApplyPreset, handleTakeSnapshot, handleTapTempo, showToast]);

  // Global Window Drag & Drop for Local Media Files (.mp4, .webm, .mp3) & Presets (.json)
  const handleWindowDragOver = (e: React.DragEvent) => {
    // Ignore internal Serum LFO or Preset drags
    if (
      e.dataTransfer.types.includes('application/x-circuitbend-mod') ||
      e.dataTransfer.types.includes('application/x-circuitbend-preset')
    ) {
      return;
    }
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      if (!isFileDragOver) setIsFileDragOver(true);
    }
  };

  const handleWindowDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsFileDragOver(false);
  };

  const handleWindowDrop = (e: React.DragEvent) => {
    if (
      e.dataTransfer.types.includes('application/x-circuitbend-mod') ||
      e.dataTransfer.types.includes('application/x-circuitbend-preset')
    ) {
      return;
    }
    e.preventDefault();
    setIsFileDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleLoadLocalFile(file);
    }
  };

  const currentTrack = playlist[currentIndex];
  const displayTitle = localMediaTitle || currentTrack?.title || 'STANDBY - FEED READY';

  return (
    <div
      onDragOver={handleWindowDragOver}
      onDragLeave={handleWindowDragLeave}
      onDrop={handleWindowDrop}
      className="h-screen w-screen overflow-hidden relative select-none bg-black text-neutral-300"
    >
      {/* Hidden Native Video Element for decoding frames */}
      <video
        ref={(el) => {
          videoRef.current = el;
          if (el && el !== videoEl) setVideoEl(el);
        }}
        crossOrigin="anonymous"
        playsInline
        preload="auto"
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', opacity: 0.001, zIndex: 0 }}
        onTimeUpdate={() => {
          if (videoRef.current) {
            const t = videoRef.current.currentTime;
            setCurrentTime((prev) => (Math.floor(t) !== Math.floor(prev) ? t : prev));
          }
        }}
        onDurationChange={() => {
          if (videoRef.current) {
            const dur = videoRef.current.duration;
            if (Number.isFinite(dur) && dur > 0) {
              setDuration(dur);
            }
          }
        }}
        onEnded={() => {
          if (liveSource === 'youtube') handleNextTrack();
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {/* FULLSCREEN IMMERSIVE VIDEO BACKGROUND */}
      <VideoViewport
        videoElement={videoEl || videoRef.current}
        videoParams={modulatedVideoParams}
        isPlaying={isPlaying}
        isTapeFreeze={isTapeFreeze}
        audioEngine={audioEngineRef.current}
        showTimeline={showTimeline && (isRackMinimized || isZenMode)}
        showVcrOsd={showVcrOsd}
        onToggleVcrOsd={() => setShowVcrOsd((prev) => !prev)}
        liveSource={liveSource}
        bpm={bpm}
        onPlayToggle={handlePlayToggle}
        onNext={handleNextTrack}
        onPrev={handlePrevTrack}
        onToggleTapeFreeze={handleToggleTapeFreeze}
        onCanvasReady={(c) => { canvasRef.current = c; }}
        title={displayTitle}
        duration={duration}
        currentTime={currentTime}
        onSeek={(val) => {
          if (videoRef.current) videoRef.current.currentTime = val;
        }}
      />

      {/* FULLSCREEN FILE DRAG & DROP OVERLAY */}
      {isFileDragOver && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md border-4 border-dashed border-cyan-400 flex flex-col items-center justify-center gap-3 pointer-events-none font-mono">
          <Upload size={48} className="text-cyan-400 animate-bounce" />
          <div className="text-lg font-bold text-cyan-300 tracking-wider">
            RELÂCHEZ VOTRE FICHIER POUR LE CIRCUIT-BENDER !
          </div>
          <div className="text-xs text-neutral-400">
            Formats supportés : Vidéo (.MP4, .WEBM, .MOV) • Audio (.MP3, .WAV) • Patch Preset (.JSON)
          </div>
        </div>
      )}

      {/* FLOATING MINIMAL HEADER (Top) */}
      <div className={`absolute top-0 left-0 right-0 z-30 pointer-events-none transition-opacity duration-300 ${isZenMode ? 'opacity-0' : 'opacity-100'}`}>
        <div className="pointer-events-auto">
          <Header
            audioContextState={audioState}
            onInitAudio={handleEnsureAudioWired}
            playlistCount={playlist.length}
            isPlaylistOpen={isPlaylistOpen}
            onTogglePlaylist={() => setIsPlaylistOpen(!isPlaylistOpen)}
            liveSource={liveSource}
            onSelectLiveSource={handleSelectLiveSource}
            onLoadLocalFile={handleLoadLocalFile}
            onShareUrl={handleSharePatchUrl}
            shareUrlCopied={shareUrlCopied}
          />
        </div>
      </div>

      {/* FLOATING BOTTOM DOCK: KNOBS, SERUM MATRIX, AUDIO VISUALIZER & MASTER */}
      <div className={`transition-opacity duration-300 ${isZenMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <RackControls
          videoParams={videoParams}
          audioParams={audioParams}
          modulatedVideoParams={modulatedVideoParams}
          modulatedAudioParams={modulatedAudioParams}
          activePresetId={activePresetId}
          analyser={audioEngineRef.current ? audioEngineRef.current.getAnalyser() : null}
          isTapeFreeze={isTapeFreeze}
          isRecording={isRecording}
          recordingDuration={recordingDuration}
          midiConnected={midiConnected}
          showTimeline={showTimeline}
          isZenMode={isZenMode}
          userPresets={userPresets}
          lfoConfig={lfoConfig}
          onUpdateLfo={(partial) => setLfoConfig((prev) => ({ ...prev, ...partial }))}
          modRoutings={modRoutings}
          onDropModSource={handleDropModSource}
          onUpdateModAmount={handleUpdateModAmount}
          onToggleModBipolar={handleToggleModBipolar}
          onRemoveMod={handleRemoveMod}
          onClearModRoutings={() => setModRoutings([])}
          liveSourcesRef={liveSourcesRef}
          macroXY={macroXY}
          onChangeMacroXY={(x, y) => setMacroXY({ x, y })}
          xyHold={xyHold}
          onToggleXyHold={() => setXyHold((prev) => !prev)}
          bpm={bpm}
          onChangeBpm={syncLfoToBpm}
          onTapTempo={handleTapTempo}
          morphSlotA={morphSlotA}
          morphSlotB={morphSlotB}
          morphAmount={morphAmount}
          onSelectMorphSlotA={setMorphSlotA}
          onSelectMorphSlotB={setMorphSlotB}
          onChangeMorphAmount={handleChangeMorphAmount}
          onToggleTimeline={() => setShowTimeline((prev) => !prev)}
          onMinimizedChange={setIsRackMinimized}
          onToggleTapeFreeze={handleToggleTapeFreeze}
          onToggleRecord={handleToggleRecord}
          onToggleZen={() => setIsZenMode((prev) => !prev)}
          onTakeSnapshot={handleTakeSnapshot}
          onSavePreset={handleSaveUserPreset}
          onDeleteUserPreset={handleDeleteUserPreset}
          onApplyUserPreset={handleApplyUserPreset}
          onImportPresetJson={handleImportPresetJson}
          onUpdateVideo={(partial) => {
            setActivePresetId('custom');
            setVideoParams((prev) => ({ ...prev, ...partial }));
          }}
          onUpdateAudio={(partial) => {
            setActivePresetId('custom');
            setAudioParams((prev) => ({ ...prev, ...partial }));
          }}
          onApplyPreset={handleApplyPreset}
          onRandomize={handleRandomize}
          onOpenMidiModal={() => {
            midiEngineRef.current?.connect();
            setIsMidiModalOpen(true);
          }}
        />
      </div>

      {/* Interactive Web MIDI Configurator Modal */}
      <MidiModal
        isOpen={isMidiModalOpen}
        onClose={() => setIsMidiModalOpen(false)}
        midiEngine={midiEngineRef.current}
      />

      {/* FLOATING SIDE DRAWER: PLAYLIST QUEUE */}
      <PlaylistPanel
        isOpen={isPlaylistOpen}
        onClose={() => setIsPlaylistOpen(false)}
        items={playlist}
        currentIndex={currentIndex}
        playlistTitle={playlistTitle}
        isLoading={isLoading}
        error={error}
        onSelectTrack={(idx) => loadTrackAtIndex(idx)}
        onLoadUrl={(url) => appendPlaylistUrl(url)}
        onRemoveTrack={handleRemoveTrack}
      />

      {/* Zen Mode Floating Exit Button */}
      {isZenMode && (
        <button
          onClick={() => setIsZenMode(false)}
          className="absolute top-4 right-4 z-50 px-3 py-1.5 rounded-full font-mono text-[11px] font-bold bg-black/85 hover:bg-black text-neutral-300 hover:text-white border border-neutral-700/80 shadow-[0_0_20px_rgba(0,0,0,0.9)] backdrop-blur-md transition-all flex items-center gap-2 group cursor-pointer"
          title="Quitter le mode Zen (Z ou Échap)"
        >
          <Minimize2 size={12} className="text-amber-400 group-hover:scale-110 transition-transform" />
          <span>QUITTER MODE ZEN (Z / ÉCHAP)</span>
        </button>
      )}

      {/* Live MIDI, Mod & Recording Feedback Toast */}
      {midiToast && (
        <div className="fixed bottom-14 right-6 z-50 px-4 py-2.5 rounded-lg bg-[#111318]/95 border border-cyan-500/80 shadow-[0_0_20px_rgba(6,182,212,0.4)] backdrop-blur-md animate-in slide-in-from-bottom-2 fade-in duration-150 flex items-center gap-3 font-mono">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          <div>
            <div className="text-xs font-bold text-cyan-300">{midiToast.message}</div>
            {midiToast.sub && <div className="text-[10px] text-neutral-400">{midiToast.sub}</div>}
          </div>
        </div>
      )}

      {/* Snapshot Shutter White Flash */}
      {snapshotFlash && (
        <div className="fixed inset-0 z-50 bg-white/80 pointer-events-none animate-pulse transition-opacity duration-200" />
      )}
    </div>
  );
};

export default App;
