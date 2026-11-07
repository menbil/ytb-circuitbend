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
import { AudioInputModal } from './components/AudioInputModal.js';
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

  // Desktop Local Cache, A/B Loop & Dual-Window VJ State
  const [cachedIds, setCachedIds] = useState<string[]>([]);
  const [activeDownloads, setActiveDownloads] = useState<string[]>([]);
  const [cacheSizeMb, setCacheSizeMb] = useState<number>(0);
  const [loopStart, setLoopStart] = useState<number | null>(null);
  const [loopEnd, setLoopEnd] = useState<number | null>(null);
  const [isVjWindowOpen, setIsVjWindowOpen] = useState<boolean>(false);
  const vjWindowRef = useRef<Window | null>(null);
  const vjChannelRef = useRef<BroadcastChannel | null>(null);
  const [externalBassEnergy, setExternalBassEnergy] = useState<number>(0);
  const isVjProjectionMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('vj') === '1';

  // Direct Recording (MP4 Video + 24-bit WAV Stem) & Web MIDI State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<any>(null);

  const [isRecordingWav, setIsRecordingWav] = useState<boolean>(false);
  const [wavRecordingDuration, setWavRecordingDuration] = useState<number>(0);
  const wavRecorderRef = useRef<MediaRecorder | null>(null);
  const wavChunksRef = useRef<Blob[]>([]);
  const wavTimerRef = useRef<any>(null);

  const [midiConnected, setMidiConnected] = useState<boolean>(false);
  const [, setMidiDeviceName] = useState<string | null>(null);
  const [midiToast, setMidiToast] = useState<{ message: string; sub?: string } | null>(null);
  const midiToastTimerRef = useRef<any>(null);
  const midiEngineRef = useRef<MidiEngine | null>(null);
  const [isMidiModalOpen, setIsMidiModalOpen] = useState<boolean>(false);
  const [isAudioInputModalOpen, setIsAudioInputModalOpen] = useState<boolean>(false);
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
      datamosh: lerp(pA.video.datamosh ?? 0, pB.video.datamosh ?? 0),
      orbit3d: lerp(pA.video.orbit3d ?? 0, pB.video.orbit3d ?? 0),
      tunnel3d: lerp(pA.video.tunnel3d ?? 0, pB.video.tunnel3d ?? 0)
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

    const stepModulation = () => {
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
    };

    (window as any).__stepModulation = stepModulation;

    const loop = () => {
      stepModulation();
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

  // Refresh Local Disk Cache Status
  const refreshCacheStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/cache/status');
      if (res.ok) {
        const data = await res.json();
        setCachedIds(data.cachedIds || []);
        setActiveDownloads(data.activeDownloads || []);
        setCacheSizeMb(data.totalSizeMb || 0);
      }
    } catch {}
  }, []);

  // Poll cache status periodically so UI badges update when background downloads complete
  useEffect(() => {
    if (isVjProjectionMode) return;
    refreshCacheStatus();
    const timer = setInterval(refreshCacheStatus, 4000);
    return () => clearInterval(timer);
  }, [isVjProjectionMode, refreshCacheStatus]);

  // Persist user presets to local disk (`data/presets.json`) + localStorage
  const persistPresetsToDisk = useCallback((presetsToSave: UserPreset[]) => {
    try {
      localStorage.setItem('ytb_circuitbend_user_presets', JSON.stringify(presetsToSave));
    } catch {}
    fetch('/api/library/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presets: presetsToSave })
    }).catch(() => {});
  }, []);

  // Persist playlist queue to local disk (`data/playlist.json`)
  const persistPlaylistToDisk = useCallback((title: string, itemsToSave: PlaylistItem[]) => {
    fetch('/api/library/playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlistTitle: title, items: itemsToSave })
    }).catch(() => {});
  }, []);

  // Decode URL `?patch=...` and load persistent desktop library on initial load
  const initialLoadRef = useRef<boolean>(false);
  useEffect(() => {
    if (initialLoadRef.current || isVjProjectionMode) return;
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
        window.history.replaceState({}, '', window.location.pathname);
        showToast('🔗 PATCH URL CHARGÉ', 'Réglages restaurés depuis le lien partagé');
      } catch (e) {
        console.warn('[Patch URL Decode Error]:', e);
      }
    }

    // 1. Load saved presets from disk (`data/presets.json`)
    fetch('/api/library/presets')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.presets) && data.presets.length > 0) {
          setUserPresets((prev) => {
            const byId = new Map<string, UserPreset>();
            for (const p of [...data.presets, ...prev]) {
              if (p && p.id) byId.set(p.id, p);
            }
            return Array.from(byId.values());
          });
        }
      })
      .catch(() => {});

    // 2. Load saved playlist from disk (`data/playlist.json`) or fall back to initial demo
    fetch('/api/library/playlist')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.saved?.items && Array.isArray(data.saved.items) && data.saved.items.length > 0) {
          setPlaylist(data.saved.items);
          setPlaylistTitle(data.saved.playlistTitle || 'DESKTOP QUEUE');
          setTimeout(() => loadTrackAtIndex(0, data.saved.items), 50);
        } else {
          appendPlaylistUrl('https://www.youtube.com/watch?v=4RCrvRXUrs4&list=PLqftF03PwhxzYiafvN4C1AzQtDuPeeYqw');
        }
      })
      .catch(() => {
        appendPlaylistUrl('https://www.youtube.com/watch?v=4RCrvRXUrs4&list=PLqftF03PwhxzYiafvN4C1AzQtDuPeeYqw');
      });
  }, [isVjProjectionMode, showToast]);

  // Dual-Window VJ BroadcastChannel Sync (Main Controller <-> 2nd Screen VJ Window)
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('circuitbend_vj_sync');
    vjChannelRef.current = channel;

    if (isVjProjectionMode) {
      // If opened from main window, try direct 60fps Canvas MediaStream first (zero latency, works with all sources)
      try {
        const openerCanvas = (window.opener as any)?.__circuitBendCanvas as HTMLCanvasElement | undefined;
        if (openerCanvas && typeof openerCanvas.captureStream === 'function' && videoRef.current) {
          const directStream = openerCanvas.captureStream(60);
          videoRef.current.muted = true;
          videoRef.current.srcObject = directStream;
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      } catch {}

      channel.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg || msg.type !== 'VJ_STATE') return;
        if (msg.videoParams) setModulatedVideoParams(msg.videoParams);
        if (typeof msg.isTapeFreeze === 'boolean') setIsTapeFreeze(msg.isTapeFreeze);
        if (typeof msg.showVcrOsd === 'boolean') setShowVcrOsd(msg.showVcrOsd);
        if (typeof msg.bpm === 'number') setBpm(msg.bpm);
        if (typeof msg.bassEnergy === 'number') setExternalBassEnergy(msg.bassEnergy);
        if (msg.title) setLocalMediaTitle(msg.title);

        const v = videoRef.current;
        // Only fall back to URL stream if not already receiving direct opener Canvas stream
        if (v && !v.srcObject && msg.streamUrl && !msg.streamUrl.startsWith('blob:')) {
          const currentUrl = v.getAttribute('data-vj-src') || '';
          if (currentUrl !== msg.streamUrl) {
            v.setAttribute('data-vj-src', msg.streamUrl);
            v.src = msg.streamUrl;
            v.muted = true;
            v.load();
            v.play().then(() => setIsPlaying(true)).catch(() => {});
          } else {
            if (typeof msg.playbackRate === 'number' && Math.abs(v.playbackRate - msg.playbackRate) > 0.02) {
              v.playbackRate = msg.playbackRate;
            }
            if (typeof msg.currentTime === 'number' && Math.abs(v.currentTime - msg.currentTime) > 1.2) {
              v.currentTime = msg.currentTime;
            }
            if (msg.isPlaying && v.paused) {
              v.play().catch(() => {});
              setIsPlaying(true);
            } else if (!msg.isPlaying && !v.paused) {
              v.pause();
              setIsPlaying(false);
            }
          }
        }
      };

      // Ask main window for immediate state snapshot on mount
      channel.postMessage({ type: 'VJ_HELLO' });
    } else {
      channel.onmessage = (ev) => {
        if (ev.data?.type === 'VJ_HELLO') {
          const v = videoRef.current;
          const bassEnergy = audioEngineRef.current ? audioEngineRef.current.getBassEnergy() : 0;
          channel.postMessage({
            type: 'VJ_STATE',
            videoParams: modulatedVideoParams,
            isPlaying,
            isTapeFreeze,
            showVcrOsd,
            bpm,
            bassEnergy,
            title: localMediaTitle || playlist[currentIndex]?.title || 'CIRCUIT//BEND VJ OUT',
            streamUrl: v?.currentSrc || playlist[currentIndex]?.streamUrl || '',
            currentTime: v?.currentTime || 0,
            playbackRate: v?.playbackRate || 1.0
          });
        }
      };
    }

    return () => {
      channel.close();
      vjChannelRef.current = null;
    };
  }, [isVjProjectionMode]);

  // Broadcast live 30Hz state to VJ 2nd screen only when using external BroadcastChannel mode (not direct canvas blit)
  useEffect(() => {
    if (isVjProjectionMode || !vjChannelRef.current || (window as any).__vjMirrorCtx) return;
    const v = videoRef.current;
    const bassEnergy = audioEngineRef.current ? audioEngineRef.current.getBassEnergy() : 0;
    vjChannelRef.current.postMessage({
      type: 'VJ_STATE',
      videoParams: modulatedVideoParams,
      isPlaying,
      isTapeFreeze,
      showVcrOsd,
      bpm,
      bassEnergy,
      title: localMediaTitle || playlist[currentIndex]?.title || 'CIRCUIT//BEND VJ OUT',
      streamUrl: v?.currentSrc || playlist[currentIndex]?.streamUrl || '',
      currentTime: v?.currentTime || 0,
      playbackRate: v?.playbackRate || 1.0
    });
  }, [
    isVjProjectionMode,
    modulatedVideoParams,
    isPlaying,
    isTapeFreeze,
    showVcrOsd,
    bpm,
    localMediaTitle,
    playlist,
    currentIndex
  ]);

  // Open or Focus 2nd Screen VJ Window (Zero-Encoding Direct GPU Canvas Blit)
  const handleOpenVjWindow = useCallback(() => {
    if (vjWindowRef.current && !vjWindowRef.current.closed) {
      vjWindowRef.current.focus();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      showToast('⚠️ CANVAS NON PRÊT', 'Patientez une seconde que le moteur 3D démarre');
      return;
    }

    (window as any).__circuitBendCanvas = canvas;

    const win = window.open(
      '',
      'CircuitBendVJOut',
      'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no'
    );

    if (!win) {
      showToast('⚠️ POPUP BLOQUÉE', 'Autorisez l’ouverture de fenêtre pour le mode VJ Dual-Screen');
      return;
    }

    vjWindowRef.current = win;
    setIsVjWindowOpen(true);

    // Inject lightweight, zero-encoding hardware Canvas receiver into 2nd window
    win.document.open();
    win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>CIRCUIT // BEND — VJ 2ND SCREEN OUTPUT</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100vw;
      height: 100vh;
      background: #000;
      overflow: hidden;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      user-select: none;
    }
    canvas {
      width: 100vw;
      height: 100vh;
      object-fit: contain;
      display: block;
      background: #000;
      transform-origin: center center;
      transition: transform 0.18s ease;
    }
    #hud {
      position: fixed;
      top: 16px;
      right: 16px;
      display: flex;
      gap: 8px;
      opacity: 0;
      transition: opacity 0.25s ease;
      z-index: 50;
    }
    body:hover #hud {
      opacity: 1;
    }
    button {
      background: rgba(15, 15, 20, 0.88);
      color: #e9d5ff;
      border: 1px solid #a855f7;
      padding: 8px 14px;
      border-radius: 6px;
      font-family: inherit;
      font-size: 11px;
      font-weight: bold;
      cursor: pointer;
      box-shadow: 0 0 15px rgba(168, 85, 247, 0.4);
    }
    button:hover {
      background: #9333ea;
      color: #fff;
    }
  </style>
</head>
<body>
  <canvas id="vj-canvas" width="854" height="480"></canvas>
  <div id="hud">
    <button id="fs-btn">⛶ PLEIN ÉCRAN (OU DOUBLE-CLIC)</button>
    <button id="fit-btn">CADRAGE : CONTAIN (16:9)</button>
  </div>
  <script>
    const c = document.getElementById('vj-canvas');
    const ctx = c.getContext('2d', { alpha: false });
    const fsBtn = document.getElementById('fs-btn');
    const fitBtn = document.getElementById('fit-btn');
    let mode = 0; // 0 = CONTAIN 16:9, 1 = COVER (Zoom Sans Bordures CRT), 2 = STRETCH (Plein Écran Étiré)
    function toggleFs() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
    fsBtn.addEventListener('click', toggleFs);
    document.body.addEventListener('dblclick', toggleFs);
    fitBtn.addEventListener('click', () => {
      mode = (mode + 1) % 3;
      if (mode === 0) {
        c.style.objectFit = 'contain';
        c.style.transform = 'scale(1)';
        fitBtn.textContent = 'CADRAGE : CONTAIN (16:9)';
      } else if (mode === 1) {
        c.style.objectFit = 'cover';
        c.style.transform = 'scale(1.12)';
        fitBtn.textContent = 'CADRAGE : COVER (SANS BORDURES CRT)';
      } else {
        c.style.objectFit = 'fill';
        c.style.transform = 'scale(1.03)';
        fitBtn.textContent = 'CADRAGE : STRETCH (PLEIN ÉCRAN 100%)';
      }
    });

    // Fullscreen Anti-Occlusion Pump: if main window is hidden behind fullscreen, 2nd window drives the WebGL frame!
    let tick = 0;
    function vjLoop(now) {
      try {
        if (window.opener && !window.opener.closed) {
          const lastMain = window.opener.__lastMainFrameTime || 0;
          if (now - lastMain > 28 && typeof window.opener.__stepCircuitFrame === 'function') {
            tick = (tick + 1) % 2;
            if (tick === 0) {
              if (typeof window.opener.__stepModulation === 'function') {
                window.opener.__stepModulation();
              }
              window.opener.__stepCircuitFrame(now / 1000);
              if (typeof window.opener.__blitToVjCanvas === 'function') {
                window.opener.__blitToVjCanvas();
              } else if (window.opener.__circuitBendCanvas && ctx) {
                ctx.drawImage(window.opener.__circuitBendCanvas, 0, 0, 854, 480);
              }
            }
          }
        }
      } catch (e) {}
      requestAnimationFrame(vjLoop);
    }
    requestAnimationFrame(vjLoop);
  </script>
</body>
</html>`);
    win.document.close();

    try {
      const vjCanvas = win.document.getElementById('vj-canvas') as HTMLCanvasElement | null;
      if (vjCanvas) {
        (window as any).__vjMirrorCtx = vjCanvas.getContext('2d', {
          alpha: false
        });
      }
    } catch (err) {
      console.error('[VJ 2nd Screen Context Error]:', err);
    }

    showToast(
      '🖥️ SORTIE VJ 2ÈME ÉCRAN ACTIVE (GPU DIRECT)',
      'Copie GPU directe sans encodage vidéo • Double-cliquez dans la 2ème fenêtre pour le plein écran'
    );

    const checkClosed = setInterval(() => {
      if (!vjWindowRef.current || vjWindowRef.current.closed) {
        clearInterval(checkClosed);
        (window as any).__vjMirrorCtx = null;
        setIsVjWindowOpen(false);
        vjWindowRef.current = null;
      }
    }, 1000);
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

  // Stop any active Webcam / Screen / System Audio MediaStream
  const stopLiveMediaStream = useCallback(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.connectLiveStream(null);
    }
    if (liveMediaStreamRef.current) {
      liveMediaStreamRef.current.getTracks().forEach((t) => t.stop());
      liveMediaStreamRef.current = null;
    }
    if (videoRef.current) {
      if (videoRef.current.srcObject) {
        videoRef.current.srcObject = null;
      }
      videoRef.current.muted = false;
    }
  }, []);

  // Switch Live Input Source (YouTube / Webcam / Screen+Audio / System Audio In / Local File)
  const handleSelectLiveSource = useCallback(async (source: LiveInputSource) => {
    if (!videoRef.current) return;

    if (source === 'webcam') {
      try {
        stopLiveMediaStream();
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        liveMediaStreamRef.current = stream;
        videoRef.current.muted = true; // Prevent raw dry feedback loop; audio goes through AudioCircuitEngine
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (stream.getAudioTracks().length > 0 && audioEngineRef.current) {
          audioEngineRef.current.connectLiveStream(stream, videoRef.current);
          setAudioState(audioEngineRef.current.getContextState());
        }
        setLiveSource('webcam');
        setIsPlaying(true);
        setLocalMediaTitle('LIVE WEBCAM FEED');
        showToast('📷 WEBCAM + AUDIO ACTIFS', 'Flux caméra et micro routés dans les shaders & le DSP');
      } catch (err: any) {
        showToast('⚠️ ACCÈS WEBCAM REFUSÉ', err?.message || 'Vérifiez les permissions caméra');
      }
    } else if (source === 'screen') {
      try {
        stopLiveMediaStream();
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        liveMediaStreamRef.current = stream;
        videoRef.current.muted = true; // Prevent double dry audio; routed into AudioCircuitEngine DSP
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const hasAudio =
          stream.getAudioTracks().length > 0 &&
          audioEngineRef.current?.connectLiveStream(stream, videoRef.current);
        if (audioEngineRef.current) {
          setAudioState(audioEngineRef.current.getContextState());
        }
        setLiveSource('screen');
        setIsPlaying(true);
        setLocalMediaTitle(hasAudio ? 'SCREEN + PC SYSTEM AUDIO DSP' : 'LIVE SCREEN CAPTURE');
        showToast(
          hasAudio ? '🖥️ ÉCRAN + SON PC ROUTÉS DANS LE DSP' : '🖥️ CAPTURE D’ÉCRAN ACTIVE',
          hasAudio
            ? 'Le son du PC passe dans le Tape Speed, Wow/Flutter, Reverb & Bitcrush !'
            : 'Astuce : Cochez "Partager l’audio du système" pour bender le son du PC'
        );
      } catch (err: any) {
        showToast('⚠️ CAPTURE ANNULÉE', err?.message || 'Partage d’écran interrompu');
      }
    } else if (source === 'systemAudio') {
      // Open the interactive Audio Input Bridge Modal (System Loopback vs Soundcard/Mic)
      setIsAudioInputModalOpen(true);
    } else if (source === 'youtube') {
      stopLiveMediaStream();
      setLiveSource('youtube');
      setLocalMediaTitle(null);
      if (playlist[currentIndex]) {
        loadTrackAtIndex(currentIndex, playlist);
      }
    }
  }, [currentIndex, playlist, showToast, stopLiveMediaStream]);

  // Helper: Activate Audio-Reactive VJ Visuals (bumps AudioReactive & links ENV AUDIO -> Glitch/RGB Shift)
  const activateAudioReactiveVisuals = useCallback(() => {
    setVideoParams((prev) => ({
      ...prev,
      audioReactive: Math.max(prev.audioReactive || 0, 0.78)
    }));
    setLfoConfig((prev) => ({ ...prev, enabled: true }));
    setModRoutings((prev) => {
      const hasEnvAudio = prev.some((r) => r.source === 'envAudio');
      if (hasEnvAudio) return prev;
      return [
        ...prev,
        {
          id: `envAudio-rgbShift-${Date.now()}`,
          source: 'envAudio',
          target: 'video.rgbShift',
          amount: 0.65,
          bipolar: false
        },
        {
          id: `envAudio-glitchIntensity-${Date.now() + 1}`,
          source: 'envAudio',
          target: 'video.glitchIntensity',
          amount: 0.45,
          bipolar: false
        }
      ];
    });
  }, []);

  // 1. Connect PC System Audio Loopback (Silent Audio-Reactive Visualizer Mode for Spotify / DJ Apps)
  const handleConnectSystemLoopback = useCallback(
    async (keepCurrentVisual: boolean) => {
      if (!videoRef.current) return;
      stopLiveMediaStream();

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        systemAudio: 'include'
      } as any);

      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error(
          'Aucune piste audio détectée ! Cochez bien la case "Partager l’audio du système" (ou de l’onglet) en bas de la fenêtre.'
        );
      }

      // Mute the video element 100% so only Spotify / PC audio is heard in your headphones
      videoRef.current.muted = true;

      if (keepCurrentVisual) {
        // Stop the screen video track so the current CRT visual stays on screen while Spotify drives the shaders!
        stream.getVideoTracks().forEach((t) => t.stop());
        if (videoRef.current.paused) {
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      } else {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsPlaying(true);
      }

      liveMediaStreamRef.current = stream;
      handleEnsureAudioWired();
      audioEngineRef.current?.connectLiveStream(stream, videoRef.current);
      if (audioEngineRef.current) {
        setAudioState(audioEngineRef.current.getContextState());
      }
      activateAudioReactiveVisuals();
      setLiveSource('systemAudio');
      setLocalMediaTitle('SPOTIFY / PC AUDIO VISUALIZER (MUET)');
      showToast(
        '🎵 MODE VISUALISEUR SPOTIFY / VJ ACTIF',
        'Vidéo 100% muette • La télé CRT et ENV AUDIO pulsent sur les basses de Spotify !'
      );
    },
    [activateAudioReactiveVisuals, handleEnsureAudioWired, showToast, stopLiveMediaStream]
  );

  // 2. Connect External Soundcard / Line-In / Microphone (Silent Audio-Reactive Visualizer Mode)
  const handleConnectMicOrLineIn = useCallback(
    async (deviceId?: string) => {
      if (!videoRef.current) return;
      stopLiveMediaStream();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        video: false
      });

      // Mute the video element 100% so there is zero audio clash or feedback
      videoRef.current.muted = true;
      if (videoRef.current.paused) {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }

      liveMediaStreamRef.current = stream;
      handleEnsureAudioWired();
      audioEngineRef.current?.connectLiveStream(stream, videoRef.current);
      if (audioEngineRef.current) {
        setAudioState(audioEngineRef.current.getContextState());
      }
      activateAudioReactiveVisuals();
      setLiveSource('systemAudio');
      setLocalMediaTitle('VISUALISEUR AUDIO EXTERNE (MUET)');
      showToast(
        '🎵 VISUALISEUR AUDIO EXTERNE ACTIF',
        'Vidéo 100% muette • Les shaders CRT et ENV AUDIO réagissent au rythme en direct'
      );
    },
    [activateAudioReactiveVisuals, handleEnsureAudioWired, showToast, stopLiveMediaStream]
  );

  // Load Dropped or Selected Local File (Video / Audio / Preset JSON)
  const handleLoadLocalFile = useCallback((file: File) => {
    if (file.name.toLowerCase().endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          handleImportPresetJson(reader.result);
          showToast(`📂 PRESET IMPORTÉ : ${file.name}`, 'Patch JSON appliqué et sauvegardé sur disque');
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
    setLoopStart(null);
    setLoopEnd(null);
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

  // Prefetch a single track or upcoming tracks into local disk cache (`data/cache/`)
  const handlePrefetchTrack = useCallback((trackId: string) => {
    if (!trackId || trackId.startsWith('local-')) return;
    fetch('/api/cache/prefetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: trackId })
    })
      .then(() => {
        refreshCacheStatus();
        showToast('⬇ MISE EN CACHE DISQUE LANCÉE', 'Téléchargement 1080p en arrière-plan pour Seek instantané');
      })
      .catch(() => {});
  }, [refreshCacheStatus, showToast]);

  const handlePrefetchAll = useCallback(() => {
    const idsToCache = playlist
      .filter((item) => !item.isLocal && !cachedIds.includes(item.id))
      .slice(0, 5)
      .map((item) => item.id);
    if (idsToCache.length === 0) {
      showToast('✅ DÉJÀ EN CACHE', 'Les pistes sont déjà présentes sur le disque local');
      return;
    }
    fetch('/api/cache/prefetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: idsToCache })
    })
      .then(() => {
        refreshCacheStatus();
        showToast(`⬇ PRÉ-CACHE LANCÉ (${idsToCache.length} PISTES)`, 'Téléchargement en tâche de fond vers data/cache/');
      })
      .catch(() => {});
  }, [cachedIds, playlist, refreshCacheStatus, showToast]);

  const handleClearCache = useCallback(() => {
    fetch('/api/cache', { method: 'DELETE' })
      .then(() => {
        refreshCacheStatus();
        showToast('🗑️ CACHE DISQUE VIDÉ', 'Les fichiers temporaires YouTube ont été supprimés');
      })
      .catch(() => {});
  }, [refreshCacheStatus, showToast]);

  // Add items from Built-in YouTube Search or PC Folder Scanner
  const handleAddItems = useCallback(
    (newItemsInput: PlaylistItem[], playFirst: boolean = false) => {
      if (!newItemsInput || newItemsInput.length === 0) return;

      setPlaylist((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        const filtered = newItemsInput.filter((i) => !existingIds.has(i.id));
        const merged = [...prev, ...filtered];
        persistPlaylistToDisk(playlistTitle, merged);

        if (playFirst) {
          const targetId = newItemsInput[0].id;
          const targetIdx = merged.findIndex((i) => i.id === targetId);
          setTimeout(() => loadTrackAtIndex(targetIdx >= 0 ? targetIdx : 0, merged), 50);
        } else if (prev.length === 0 && merged.length > 0) {
          setTimeout(() => loadTrackAtIndex(0, merged), 50);
        } else {
          showToast(
            '➕ AJOUTÉ À LA FILE',
            filtered.length === 1 ? filtered[0].title : `${filtered.length} médias ajoutés`
          );
        }
        return merged;
      });
    },
    [persistPlaylistToDisk, playlistTitle, showToast]
  );

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

      const nextTitle = data.playlistTitle || playlistTitle;
      if (data.playlistTitle) {
        setPlaylistTitle(data.playlistTitle);
      }

      setPlaylist((prev) => {
        const wasEmpty = prev.length === 0;
        const existingIds = new Set(prev.map((i) => i.id));
        const newItems = data.items.filter((i: PlaylistItem) => !existingIds.has(i.id));

        if (newItems.length === 0) {
          showToast('ℹ️ DÉJÀ DANS LA FILE', 'Ce titre est déjà présent dans la playlist');
          return prev;
        }

        const merged = [...prev, ...newItems];
        persistPlaylistToDisk(nextTitle, merged);

        if (wasEmpty) {
          setTimeout(() => loadTrackAtIndex(0, merged), 50);
        } else {
          const addedTitle = newItems.length === 1 ? newItems[0].title : `${newItems.length} titres ajoutés`;
          showToast('➕ AJOUTÉ À LA FILE', addedTitle);
        }
        return merged;
      });
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
    setLiveSource(list[index].isLocal ? 'local' : 'youtube');
    setLocalMediaTitle(list[index].isLocal ? list[index].title : null);
    setCurrentIndex(index);
    setLoopStart(null);
    setLoopEnd(null);
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
    setPlaylist((prev) => {
      const next = prev.filter((_, i) => i !== index);
      persistPlaylistToDisk(playlistTitle, next);
      if (currentIndex >= next.length) {
        setCurrentIndex(Math.max(0, next.length - 1));
      }
      return next;
    });
  };

  // A/B Loop Handlers
  const handleSetLoopStart = useCallback(() => {
    if (!videoRef.current) return;
    const t = Number(videoRef.current.currentTime.toFixed(2));
    setLoopStart(t);
    if (loopEnd !== null && loopEnd <= t) {
      setLoopEnd(null);
    }
    showToast(`🔁 BOUCLE A (IN) : ${t.toFixed(1)}s`, 'Appuyez sur O ou [B OUT] pour fermer la boucle');
  }, [loopEnd, showToast]);

  const handleSetLoopEnd = useCallback(() => {
    if (!videoRef.current) return;
    const t = Number(videoRef.current.currentTime.toFixed(2));
    if (loopStart === null || t <= loopStart + 0.2) {
      const start = Math.max(0, Number((t - 2.0).toFixed(2)));
      setLoopStart(start);
      setLoopEnd(t);
      showToast(`🔁 BOUCLE A/B ACTIVE : ${start.toFixed(1)}s → ${t.toFixed(1)}s`, 'Lecture en boucle continue');
    } else {
      setLoopEnd(t);
      showToast(`🔁 BOUCLE A/B ACTIVE : ${loopStart.toFixed(1)}s → ${t.toFixed(1)}s`, 'Lecture en boucle continue');
    }
  }, [loopStart, showToast]);

  const handleClearLoop = useCallback(() => {
    setLoopStart(null);
    setLoopEnd(null);
    showToast('🔁 BOUCLE A/B DÉSACTIVÉE', 'Retour à la lecture linéaire');
  }, [showToast]);

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

  // Direct Session Video Recorder (Hardware Cropped 16:9 2D Proxy Canvas -> Zero WebGL Stall)
  const handleToggleRecord = () => {
    if (isRecording) {
      (window as any).__recMirrorCtx = null;
      (window as any).__recVideoTrack = null;
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
        // Create offscreen 854x480 16:9 NTSC VHS proxy canvas (shares blit with 2nd screen -> 5x fewer pixels, zero WebGL stall)
        const recCanvas = document.createElement('canvas');
        recCanvas.width = 854;
        recCanvas.height = 480;
        const recCtx = recCanvas.getContext('2d', { alpha: false });
        (window as any).__recMirrorCtx = recCtx;

        // Use manual frame capture (captureStream(0)) so frames are only grabbed right after WebGL render completes
        const videoStream =
          typeof (recCanvas as any).captureStream === 'function'
            ? recCanvas.captureStream(0)
            : canvasRef.current.captureStream(30);
        const [videoTrack] = videoStream.getVideoTracks();
        (window as any).__recVideoTrack = videoTrack || null;

        // Seed initial frame immediately
        if (typeof (window as any).__blitToVjCanvas === 'function') {
          (window as any).__blitToVjCanvas();
        }

        const audioDest = audioEngineRef.current ? audioEngineRef.current.getMediaStreamDestination() : null;
        const tracks = [
          ...videoStream.getVideoTracks(),
          ...(audioDest ? audioDest.stream.getAudioTracks() : [])
        ];
        const combinedStream = new MediaStream(tracks);

        const candidateMimeTypes = [
          'video/webm;codecs=vp8,opus',
          'video/webm;codecs=h264,opus',
          'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
          'video/mp4;codecs=avc1,mp4a.40.2',
          'video/mp4;codecs=avc1',
          'video/mp4',
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
          videoBitsPerSecond: 3_500_000,
          audioBitsPerSecond: 192_000
        });
        recordedChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = async () => {
          (window as any).__recMirrorCtx = null;
          (window as any).__recVideoTrack = null;
          videoStream.getVideoTracks().forEach((t) => t.stop());
          const rawBlob = new Blob(recordedChunksRef.current, { type: mimeType });

          const triggerDownload = (blob: Blob, savedPath?: string | null) => {
            const d = new Date();
            const pad = (n: number) => n.toString().padStart(2, '0');
            const dtStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}h${pad(d.getMinutes())}m${pad(d.getSeconds())}s`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `circuitbend-video_${dtStr}.mp4`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }, 300);

            showToast(
              '💾 CLIP MP4 EXPORTÉ SUR DISQUE',
              savedPath ? `Sauvegardé dans ${savedPath}` : 'Enregistrement 60 FPS sauvegardé avec succès'
            );
          };

          try {
            const res = await fetch('/api/convert-mp4', {
              method: 'POST',
              headers: { 'Content-Type': 'application/octet-stream' },
              body: rawBlob
            });

            if (res.ok) {
              const savedPath = res.headers.get('X-Export-Path');
              const mp4Blob = await res.blob();
              triggerDownload(mp4Blob, savedPath);
              return;
            }
          } catch (e) {
            console.warn('[MP4 Conversion fallback]:', e);
          }

          triggerDownload(rawBlob);
        };

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

  // Lossless 24-bit WAV Audio Stem Recorder (for Ableton / FL Studio / Logic)
  const handleToggleRecordWav = () => {
    if (isRecordingWav) {
      if (wavRecorderRef.current && wavRecorderRef.current.state !== 'inactive') {
        wavRecorderRef.current.stop();
      }
      if (wavTimerRef.current) {
        clearInterval(wavTimerRef.current);
        wavTimerRef.current = null;
      }
      setIsRecordingWav(false);
    } else {
      handleEnsureAudioWired();
      const audioDest = audioEngineRef.current ? audioEngineRef.current.getMediaStreamDestination() : null;
      if (!audioDest || audioDest.stream.getAudioTracks().length === 0) {
        showToast('⚠️ AUDIO NON INITIALISÉ', 'Lancez la lecture avant d’enregistrer un stem WAV');
        return;
      }

      try {
        const audioOnlyStream = new MediaStream(audioDest.stream.getAudioTracks());
        const recorder = new MediaRecorder(audioOnlyStream, {
          audioBitsPerSecond: 320_000
        });
        wavChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            wavChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = async () => {
          const rawAudioBlob = new Blob(wavChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          try {
            showToast('🎚️ ENCODAGE WAV 24-BIT EN COURS...', 'Conversion FFmpeg vers PCM 24-bit / 48kHz');
            const res = await fetch('/api/export-wav', {
              method: 'POST',
              headers: { 'Content-Type': 'application/octet-stream' },
              body: rawAudioBlob
            });
            if (res.ok) {
              const d = new Date();
              const pad = (n: number) => n.toString().padStart(2, '0');
              const dtStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}h${pad(d.getMinutes())}m${pad(d.getSeconds())}s`;
              const savedPath = res.headers.get('X-Export-Path');
              const wavBlob = await res.blob();
              const url = URL.createObjectURL(wavBlob);
              const a = document.createElement('a');
              a.style.display = 'none';
              a.href = url;
              a.download = `circuitbend-stem_${dtStr}.wav`;
              document.body.appendChild(a);
              a.click();
              setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }, 300);
              showToast(
                '🎹 STEM .WAV 24-BIT EXPORTÉ',
                savedPath ? `Sauvegardé dans ${savedPath}` : 'Prêt pour Ableton / FL Studio'
              );
              return;
            }
          } catch (err) {
            console.warn('[WAV Export Error]:', err);
          }
          showToast('⚠️ ERREUR EXPORT WAV', 'Vérifiez que FFmpeg est disponible');
        };

        recorder.start(500);
        wavRecorderRef.current = recorder;
        setIsRecordingWav(true);
        setWavRecordingDuration(0);

        wavTimerRef.current = setInterval(() => {
          setWavRecordingDuration((prev) => prev + 1);
        }, 1000);
        showToast('🎙️ ENREGISTREMENT STEM .WAV ACTIF', 'Tout le traitement Tape & DSP est capturé en 24-bit');
      } catch (err) {
        console.error('[WAV Recorder Error]:', err);
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

  // User Custom Presets Handlers (Persisted on Local Disk + localStorage)
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
    persistPresetsToDisk(updated);
    setActivePresetId(newPreset.id);
    showToast(`💾 PRESET SAUVEGARDÉ : ${trimmed}`, 'Enregistré sur le disque local (data/presets.json)');
  };

  const handleDeleteUserPreset = (id: string) => {
    const updated = userPresets.filter((p) => p.id !== id);
    setUserPresets(updated);
    persistPresetsToDisk(updated);
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
        persistPresetsToDisk(updated);
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

      (window as any).__forceRenderWebGL?.();
      const dataUrl = canvas.toDataURL('image/png');
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const filename = `circuitbend-photo_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}h${pad(now.getMinutes())}m${pad(now.getSeconds())}s.png`;

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

  const lastRandomStyleRef = useRef<number>(-1);
  const [randomStyleLabel, setRandomStyleLabel] = useState<string | null>(null);

  const handleRandomize = () => {
    setActivePresetId('custom-random');
    const rnd = (min: number, max: number) => min + Math.random() * (max - min);
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

    // Pick one of 8 radically distinct aesthetic archetypes (never repeating the same archetype twice in a row!)
    const totalStyles = 8;
    let styleIdx = Math.floor(Math.random() * totalStyles);
    if (styleIdx === lastRandomStyleRef.current) {
      styleIdx = (styleIdx + 1 + Math.floor(Math.random() * (totalStyles - 1))) % totalStyles;
    }
    lastRandomStyleRef.current = styleIdx;

    // Clean baseline so only the chosen archetype's signature parameters are pushed hard (avoids muddy "all-at-20%" soup)
    const baseVideo: VideoBendingParams = {
      glitchIntensity: 0.0,
      rgbShift: 0.04,
      scanlines: 0.12,
      colorBleed: 0.0,
      feedback: 0.0,
      noise: 0.02,
      vaporwaveTint: 0.0,
      crtCurvature: 0.12,
      apertureGrille: 0.15,
      vhsHeadSwitching: 0.0,
      vHoldDrift: 0.0,
      meshDisplacement: 0.0,
      chromaSmear: 0.0,
      audioReact: Number(rnd(0.35, 0.85).toFixed(2)),
      luminance: 0.0,
      datamosh: 0.0,
      orbit3d: 0.0,
      tunnel3d: 0.0
    };

    const baseAudio: AudioBendingParams = {
      ...audioParams,
      tapeSpeed: 1.0,
      wowRate: Number(rnd(0.5, 1.6).toFixed(1)),
      wowDepth: 0.02,
      flutterRate: Number(rnd(6.0, 11.0).toFixed(1)),
      flutterDepth: 0.01,
      tapeTone: 0.15,
      tapeHiss: 0.004,
      tapeDropouts: 0.0,
      stutterSpeed: Number(rnd(0.07, 0.22).toFixed(2)),
      reverbWet: 0.12,
      bitcrush: 0.0,
      drive: 0.0,
      ringModMix: 0.0,
      ringModFreq: Math.round(rnd(80, 320)),
      filterCutoff: 12000,
      filterResonance: 1.0,
      filterType: 'lowpass'
    };

    let styleName = '';
    let styleSub = '';
    let lfo1Shape: LfoShape = 'sine';
    let lfo2Shape: LfoShape = 'triangle';
    let routings: ModRouting[] = [];

    switch (styleIdx) {
      case 0: {
        // 1. 3D RUTT-ETRA TOPOGRAPHY + ORBIT
        styleName = '🏔️ 3D RUTT-ETRA RELIEF & ORBIT';
        styleSub = 'Extrusion Z haute-fidélité + Caméra 3D flottante';
        baseVideo.meshDisplacement = Number(rnd(0.62, 0.95).toFixed(2));
        baseVideo.orbit3d = Number(rnd(0.55, 0.90).toFixed(2));
        baseVideo.rgbShift = Number(rnd(0.12, 0.32).toFixed(2));
        baseVideo.scanlines = Number(rnd(0.25, 0.55).toFixed(2));
        baseVideo.crtCurvature = 0.0;
        baseAudio.tapeSpeed = Number(rnd(0.86, 0.98).toFixed(2));
        baseAudio.reverbWet = Number(rnd(0.35, 0.62).toFixed(2));
        baseAudio.filterCutoff = Math.round(rnd(3200, 7500));
        baseAudio.filterResonance = Number(rnd(1.5, 3.5).toFixed(1));
        lfo1Shape = 'sine';
        lfo2Shape = 'drift';
        routings = [
          { id: `r1-${Date.now()}`, source: 'envAudio', target: 'video.meshDisplacement', amount: 0.55, bipolar: false },
          { id: `r2-${Date.now() + 1}`, source: 'lfo1', target: 'video.orbit3d', amount: 0.45, bipolar: true }
        ];
        break;
      }
      case 1: {
        // 2. INFINITE 3D MIRROR TUNNEL + CATHEDRAL SLOWED
        styleName = '🌀 3D INFINITE MIRROR TUNNEL';
        styleSub = 'Corridor Z infini + Reverb Cathédrale Slowed';
        baseVideo.tunnel3d = Number(rnd(0.62, 0.95).toFixed(2));
        baseVideo.orbit3d = Number(rnd(0.35, 0.72).toFixed(2));
        baseVideo.vaporwaveTint = Number(rnd(0.45, 0.90).toFixed(2));
        baseVideo.rgbShift = Number(rnd(0.15, 0.40).toFixed(2));
        baseAudio.tapeSpeed = Number(rnd(0.68, 0.82).toFixed(2));
        baseAudio.reverbWet = Number(rnd(0.55, 0.85).toFixed(2));
        baseAudio.delayTime = Number(rnd(0.22, 0.42).toFixed(2));
        baseAudio.filterCutoff = Math.round(rnd(1800, 4200));
        lfo1Shape = 'triangle';
        lfo2Shape = 'sine';
        routings = [
          { id: `r1-${Date.now()}`, source: 'lfo1', target: 'video.tunnel3d', amount: 0.4, bipolar: true },
          { id: `r2-${Date.now() + 1}`, source: 'envAudio', target: 'video.rgbShift', amount: 0.6, bipolar: false }
        ];
        break;
      }
      case 2: {
        // 3. LIQUID DATAMOSH P-FRAME MELT
        styleName = '🫠 LIQUID DATAMOSH MELT';
        styleSub = 'Compression P-Frame fondue + Basse sub-aquatique';
        baseVideo.datamosh = Number(rnd(0.68, 0.94).toFixed(2));
        baseVideo.chromaSmear = Number(rnd(0.40, 0.80).toFixed(2));
        baseVideo.feedback = Number(rnd(0.25, 0.55).toFixed(2));
        baseVideo.scanlines = 0.0;
        baseVideo.crtCurvature = 0.05;
        baseAudio.tapeSpeed = Number(rnd(0.75, 0.92).toFixed(2));
        baseAudio.filterCutoff = Math.round(rnd(1100, 2900));
        baseAudio.filterResonance = Number(rnd(1.8, 4.0).toFixed(1));
        baseAudio.drive = Number(rnd(0.0, 0.08).toFixed(2));
        lfo1Shape = 'drift';
        lfo2Shape = 'saw';
        routings = [
          { id: `r1-${Date.now()}`, source: 'envAudio', target: 'video.datamosh', amount: 0.65, bipolar: false },
          { id: `r2-${Date.now() + 1}`, source: 'lfo1', target: 'audio.filterCutoff', amount: 0.45, bipolar: true }
        ];
        break;
      }
      case 3: {
        // 4. CHOPPED & SCREWED 0.60x MALLSOFT
        styleName = '🌴 CHOPPED & SCREWED VAPORWAVE';
        styleSub = 'Ralenti extrême + Teinte Fuchsia/Cyan + Mall Reverb';
        baseVideo.vaporwaveTint = Number(rnd(0.78, 1.0).toFixed(2));
        baseVideo.crtCurvature = Number(rnd(0.35, 0.65).toFixed(2));
        baseVideo.apertureGrille = Number(rnd(0.45, 0.80).toFixed(2));
        baseVideo.scanlines = Number(rnd(0.35, 0.65).toFixed(2));
        baseVideo.chromaSmear = Number(rnd(0.30, 0.60).toFixed(2));
        baseAudio.tapeSpeed = Number(rnd(0.56, 0.72).toFixed(2));
        baseAudio.wowDepth = Number(rnd(0.18, 0.42).toFixed(2));
        baseAudio.reverbWet = Number(rnd(0.60, 0.88).toFixed(2));
        baseAudio.tapeTone = Number(rnd(0.65, 0.95).toFixed(2));
        baseAudio.filterCutoff = Math.round(rnd(1600, 3400));
        lfo1Shape = 'sine';
        lfo2Shape = 'drift';
        routings = [
          { id: `r1-${Date.now()}`, source: 'lfo1', target: 'video.vaporwaveTint', amount: 0.35, bipolar: true },
          { id: `r2-${Date.now() + 1}`, source: 'envAudio', target: 'video.luminance', amount: 0.5, bipolar: false }
        ];
        break;
      }
      case 4: {
        // 5. CYBERPUNK 8-BIT CIRCUIT SHORT & RING MOD
        styleName = '⚡ CYBERPUNK GLITCH & RING-MOD';
        styleSub = 'Décrochage H-Sync + Grain 8-bit doux + Ring Mod subtil';
        baseVideo.glitchIntensity = Number(rnd(0.58, 0.90).toFixed(2));
        baseVideo.rgbShift = Number(rnd(0.45, 0.85).toFixed(2));
        baseVideo.colorBleed = Number(rnd(0.40, 0.78).toFixed(2));
        baseVideo.vhsHeadSwitching = Number(rnd(0.35, 0.75).toFixed(2));
        baseAudio.bitcrush = Number(rnd(0.08, 0.24).toFixed(2));
        baseAudio.ringModMix = Number(rnd(0.08, 0.22).toFixed(2));
        baseAudio.ringModFreq = Math.round(rnd(110, 320));
        baseAudio.drive = Number(rnd(0.03, 0.11).toFixed(2));
        baseAudio.filterType = 'lowpass';
        baseAudio.filterCutoff = Math.round(rnd(2200, 5800));
        baseAudio.filterResonance = Number(rnd(1.8, 4.2).toFixed(1));
        lfo1Shape = 'random';
        lfo2Shape = 'square';
        routings = [
          { id: `r1-${Date.now()}`, source: 'lfo1', target: 'video.glitchIntensity', amount: 0.6, bipolar: true },
          { id: `r2-${Date.now() + 1}`, source: 'envAudio', target: 'video.rgbShift', amount: 0.7, bipolar: false }
        ];
        break;
      }
      case 5: {
        // 6. DAMAGED 1984 VHS CAMCORDER TAPE
        styleName = '📼 DAMAGED 1984 VHS CAMCORDER';
        styleSub = 'V-Hold déréglé + Bandes magnétiques froissées + Bruit RF';
        baseVideo.vHoldDrift = Number(rnd(0.08, 0.28).toFixed(2));
        baseVideo.vhsHeadSwitching = Number(rnd(0.55, 0.92).toFixed(2));
        baseVideo.noise = Number(rnd(0.22, 0.48).toFixed(2));
        baseVideo.chromaSmear = Number(rnd(0.50, 0.85).toFixed(2));
        baseVideo.crtCurvature = Number(rnd(0.30, 0.55).toFixed(2));
        baseAudio.wowDepth = Number(rnd(0.25, 0.55).toFixed(2));
        baseAudio.flutterDepth = Number(rnd(0.12, 0.35).toFixed(2));
        baseAudio.tapeDropouts = Number(rnd(0.18, 0.45).toFixed(2));
        baseAudio.tapeTone = Number(rnd(0.70, 0.98).toFixed(2));
        baseAudio.tapeHiss = Number(rnd(0.02, 0.05).toFixed(3));
        baseAudio.filterCutoff = Math.round(rnd(1800, 3200));
        lfo1Shape = 'drift';
        lfo2Shape = 'random';
        routings = [
          { id: `r1-${Date.now()}`, source: 'lfo1', target: 'audio.tapeSpeed', amount: 0.18, bipolar: true },
          { id: `r2-${Date.now() + 1}`, source: 'envAudio', target: 'video.vhsHeadSwitching', amount: 0.55, bipolar: false }
        ];
        break;
      }
      case 6: {
        // 7. SOLARIZED ACID PSYCHEDELIA
        styleName = '🌈 SOLARIZED ACID PSYCHEDELIA';
        styleSub = 'Inversion de luminance + Color Bleed + Filtre Acide Chaud';
        baseVideo.luminance = Number(rnd(0.68, 0.96).toFixed(2));
        baseVideo.colorBleed = Number(rnd(0.65, 0.95).toFixed(2));
        baseVideo.feedback = Number(rnd(0.45, 0.82).toFixed(2));
        baseVideo.orbit3d = Number(rnd(0.25, 0.55).toFixed(2));
        baseAudio.filterCutoff = Math.round(rnd(950, 3200));
        baseAudio.filterResonance = Number(rnd(3.0, 6.2).toFixed(1));
        baseAudio.drive = Number(rnd(0.04, 0.12).toFixed(2));
        baseAudio.reverbWet = Number(rnd(0.30, 0.55).toFixed(2));
        lfo1Shape = 'saw';
        lfo2Shape = 'triangle';
        routings = [
          { id: `r1-${Date.now()}`, source: 'lfo1', target: 'audio.filterCutoff', amount: 0.55, bipolar: true },
          { id: `r2-${Date.now() + 1}`, source: 'lfo2', target: 'video.luminance', amount: 0.5, bipolar: true },
          { id: `r3-${Date.now() + 2}`, source: 'envAudio', target: 'video.colorBleed', amount: 0.6, bipolar: false }
        ];
        break;
      }
      default: {
        // 8. 3D VORTEX + FULL AUDIO-REACTIVE KICK MATRIX
        styleName = '🚀 3D VORTEX // AUDIO-REACTIVE MATRIX';
        styleSub = 'Tunnel 3D + Relief Z + Orbit 100% pilotés par les basses';
        baseVideo.meshDisplacement = Number(rnd(0.45, 0.85).toFixed(2));
        baseVideo.tunnel3d = Number(rnd(0.42, 0.78).toFixed(2));
        baseVideo.orbit3d = Number(rnd(0.60, 0.95).toFixed(2));
        baseVideo.audioReact = Number(rnd(0.80, 1.0).toFixed(2));
        baseVideo.datamosh = Number(rnd(0.25, 0.55).toFixed(2));
        baseAudio.tapeSpeed = Number(rnd(0.88, 1.05).toFixed(2));
        baseAudio.drive = Number(rnd(0.0, 0.06).toFixed(2));
        baseAudio.reverbWet = Number(rnd(0.25, 0.50).toFixed(2));
        baseAudio.filterCutoff = Math.round(rnd(2800, 8500));
        lfo1Shape = 'sawDown';
        lfo2Shape = 'sine';
        routings = [
          { id: `r1-${Date.now()}`, source: 'envAudio', target: 'video.orbit3d', amount: 0.7, bipolar: false },
          { id: `r2-${Date.now() + 1}`, source: 'envAudio', target: 'video.tunnel3d', amount: 0.55, bipolar: false },
          { id: `r3-${Date.now() + 2}`, source: 'lfo1', target: 'video.meshDisplacement', amount: 0.45, bipolar: true }
        ];
        break;
      }
    }

    const randomTargets: Record<LfoTargetId, boolean> = {
      filterCutoff: styleIdx === 2 || styleIdx === 6,
      tapeSpeed: styleIdx === 5,
      drive: false,
      reverbWet: styleIdx === 1 || styleIdx === 3,
      glitchIntensity: styleIdx === 4,
      rgbShift: styleIdx === 1 || styleIdx === 4,
      scanlines: styleIdx === 3,
      meshDisplacement: styleIdx === 0 || styleIdx === 7,
      luminance: styleIdx === 6,
      colorBleed: styleIdx === 6
    };

    const rate1 = Number(rnd(0.25, 2.2).toFixed(2));
    const rate2 = Number(rnd(0.4, 3.2).toFixed(2));

    setModRoutings(routings);
    setLfoConfig((prev) => ({
      ...prev,
      enabled: true,
      shape: lfo1Shape,
      rate: rate1,
      depth: Number(rnd(0.35, 0.72).toFixed(2)),
      phaseSpread: Number(rnd(0.15, 0.75).toFixed(2)),
      targets: randomTargets,
      lfo1: {
        id: 'lfo1',
        enabled: true,
        shape: lfo1Shape,
        rate: rate1,
        syncDivision: pick(['free', '1/4', '1/2']),
        smooth: Number(rnd(0.0, 0.35).toFixed(2)),
        points: SHAPE_POINTS[lfo1Shape] || SHAPE_POINTS.sine
      },
      lfo2: {
        id: 'lfo2',
        enabled: true,
        shape: lfo2Shape,
        rate: rate2,
        syncDivision: pick(['free', '1/2', '1/8']),
        smooth: Number(rnd(0.0, 0.35).toFixed(2)),
        points: SHAPE_POINTS[lfo2Shape] || SHAPE_POINTS.triangle
      }
    }));

    setVideoParams(baseVideo);
    setAudioParams(baseAudio);
    setRandomStyleLabel(styleName);
    showToast(`🎲 RANDOM : ${styleName}`, styleSub);
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
      } else if (key === 'i') {
        e.preventDefault();
        handleSetLoopStart();
      } else if (key === 'o') {
        e.preventDefault();
        handleSetLoopEnd();
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
  }, [
    handlePlayToggle,
    handleToggleTapeFreeze,
    handleRandomize,
    handleApplyPreset,
    handleTakeSnapshot,
    handleTapTempo,
    handleSetLoopStart,
    handleSetLoopEnd,
    showToast
  ]);

  // Global Window Drag & Drop for Local Media Files (.mp4, .webm, .mp3) & Presets (.json)
  const handleWindowDragOver = (e: React.DragEvent) => {
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
  const isCurrentTrackCached = Boolean(
    currentTrack && (currentTrack.isLocal || cachedIds.includes(currentTrack.id))
  );

  return (
    <div
      onDragOver={handleWindowDragOver}
      onDragLeave={handleWindowDragLeave}
      onDrop={handleWindowDrop}
      onDoubleClick={() => {
        if (isVjProjectionMode) {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        }
      }}
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
            // Instant A/B Loop Jump when Loop In & Loop Out are active
            if (
              !isVjProjectionMode &&
              loopStart !== null &&
              loopEnd !== null &&
              loopEnd > loopStart + 0.15 &&
              t >= loopEnd
            ) {
              videoRef.current.currentTime = loopStart;
              setCurrentTime(loopStart);
              return;
            }
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
          if (!isVjProjectionMode && (liveSource === 'youtube' || liveSource === 'local')) {
            if (loopStart !== null && videoRef.current) {
              videoRef.current.currentTime = loopStart;
              videoRef.current.play().catch(() => {});
            } else {
              handleNextTrack();
            }
          }
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
        externalBassEnergy={externalBassEnergy}
        isTrackCached={isCurrentTrackCached}
        loopStart={loopStart}
        loopEnd={loopEnd}
        onSetLoopStart={!isVjProjectionMode ? handleSetLoopStart : undefined}
        onSetLoopEnd={!isVjProjectionMode ? handleSetLoopEnd : undefined}
        onClearLoop={!isVjProjectionMode ? handleClearLoop : undefined}
        showTimeline={!isVjProjectionMode && showTimeline && (isRackMinimized || isZenMode)}
        showVcrOsd={showVcrOsd}
        onToggleVcrOsd={!isVjProjectionMode ? () => setShowVcrOsd((prev) => !prev) : undefined}
        liveSource={liveSource}
        bpm={bpm}
        onPlayToggle={handlePlayToggle}
        onNext={handleNextTrack}
        onPrev={handlePrevTrack}
        onToggleTapeFreeze={handleToggleTapeFreeze}
        onCanvasReady={(c) => {
          canvasRef.current = c;
          (window as any).__circuitBendCanvas = c;
        }}
        title={displayTitle}
        duration={duration}
        currentTime={currentTime}
        onSeek={(val) => {
          if (videoRef.current) videoRef.current.currentTime = val;
        }}
      />

      {/* FULLSCREEN FILE DRAG & DROP OVERLAY */}
      {!isVjProjectionMode && isFileDragOver && (
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
      {!isVjProjectionMode && (
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
              onOpenVjWindow={handleOpenVjWindow}
              isVjWindowOpen={isVjWindowOpen}
              cachedTrackCount={cachedIds.length}
            />
          </div>
        </div>
      )}

      {/* FLOATING BOTTOM DOCK: KNOBS, SERUM MATRIX, AUDIO VISUALIZER & MASTER */}
      {!isVjProjectionMode && (
        <div className={`transition-opacity duration-300 ${isZenMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <RackControls
            videoParams={videoParams}
            audioParams={audioParams}
            modulatedVideoParams={modulatedVideoParams}
            modulatedAudioParams={modulatedAudioParams}
            activePresetId={activePresetId}
            randomStyleLabel={randomStyleLabel}
            analyser={audioEngineRef.current ? audioEngineRef.current.getAnalyser() : null}
            isTapeFreeze={isTapeFreeze}
            isRecording={isRecording}
            recordingDuration={recordingDuration}
            isRecordingWav={isRecordingWav}
            wavRecordingDuration={wavRecordingDuration}
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
            onToggleRecordWav={handleToggleRecordWav}
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
      )}

      {/* Interactive Web MIDI Configurator Modal */}
      {!isVjProjectionMode && (
        <MidiModal
          isOpen={isMidiModalOpen}
          onClose={() => setIsMidiModalOpen(false)}
          midiEngine={midiEngineRef.current}
        />
      )}

      {/* Interactive Audio Input Bridge Modal (PC System Loopback vs Soundcard/Mic) */}
      {!isVjProjectionMode && (
        <AudioInputModal
          isOpen={isAudioInputModalOpen}
          onClose={() => setIsAudioInputModalOpen(false)}
          onConnectSystemLoopback={handleConnectSystemLoopback}
          onConnectMicOrLineIn={handleConnectMicOrLineIn}
          activeMode={liveSource}
        />
      )}

      {/* FLOATING SIDE DRAWER: PLAYLIST, YT SEARCH & LOCAL FOLDER SCANNER */}
      {!isVjProjectionMode && (
        <PlaylistPanel
          isOpen={isPlaylistOpen}
          onClose={() => setIsPlaylistOpen(false)}
          items={playlist}
          currentIndex={currentIndex}
          playlistTitle={playlistTitle}
          isLoading={isLoading}
          error={error}
          cachedIds={cachedIds}
          activeDownloads={activeDownloads}
          cacheSizeMb={cacheSizeMb}
          onSelectTrack={(idx) => loadTrackAtIndex(idx)}
          onLoadUrl={(url) => appendPlaylistUrl(url)}
          onRemoveTrack={handleRemoveTrack}
          onAddItems={handleAddItems}
          onPrefetchTrack={handlePrefetchTrack}
          onPrefetchAll={handlePrefetchAll}
          onClearCache={handleClearCache}
        />
      )}

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
