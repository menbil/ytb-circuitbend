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
  AudioParamKey 
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
import { Minimize2 } from 'lucide-react';

export const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const audioEngineRef = useRef<AudioCircuitEngine | null>(null);

  // Playlist State
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [playlistTitle, setPlaylistTitle] = useState<string>('VAPORWAVE QUEUE');
  const [isPlaylistOpen, setIsPlaylistOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Playback State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isTapeFreeze, setIsTapeFreeze] = useState<boolean>(false);
  const [showTimeline, setShowTimeline] = useState<boolean>(true);
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
  const [midiDeviceName, setMidiDeviceName] = useState<string | null>(null);
  const midiEngineRef = useRef<MidiEngine | null>(null);
  const [isMidiModalOpen, setIsMidiModalOpen] = useState<boolean>(false);
  const actionHandlersRef = useRef<{
    playToggle?: () => void;
    tapeFreeze?: () => void;
    randomize?: () => void;
    nextTrack?: () => void;
    prevTrack?: () => void;
    applyPreset?: (p: Preset) => void;
  }>({});

  // Preset & Parameter States (Start transparently on Direct Bypass)
  const defaultPreset = PRESETS.find((p) => p.id === 'clean') || PRESETS[0];
  const [videoParams, setVideoParams] = useState<VideoBendingParams>(defaultPreset.video);
  const [audioParams, setAudioParams] = useState<AudioBendingParams>(defaultPreset.audio);
  const [activePresetId, setActivePresetId] = useState<string>(defaultPreset.id);

  // User Saved Presets State (Persisted in localStorage)
  const [userPresets, setUserPresets] = useState<UserPreset[]>(() => {
    try {
      const saved = localStorage.getItem('ytb_circuitbend_user_presets');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Zen Mode & Snapshot States
  const [isZenMode, setIsZenMode] = useState<boolean>(false);
  const [snapshotFlash, setSnapshotFlash] = useState<boolean>(false);

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

  // LFO Continuous Modulation Loop across Multi-Target Matrix
  useEffect(() => {
    if (!lfoConfig.enabled) return;
    let animId: number;

    const evalWave = (phase: number, shape: LfoShape): number => {
      const p = ((phase % 1.0) + 1.0) % 1.0;
      switch (shape) {
        case 'sine':
          return (Math.sin(p * Math.PI * 2) + 1) / 2;
        case 'triangle':
          return Math.abs(p * 2 - 1);
        case 'saw':
          return p;
        case 'sawDown':
          return 1.0 - p;
        case 'square':
          return p < 0.5 ? 1.0 : 0.0;
        case 'random':
          return lfoRandomValRef.current;
        case 'drift':
          return lfoDriftCurrentRef.current;
        default:
          return (Math.sin(p * Math.PI * 2) + 1) / 2;
      }
    };

    const loop = () => {
      const now = performance.now() / 1000;
      const basePhase = (now * lfoConfig.rate) % 1.0;

      // Update S&H Random step
      const step = Math.floor(now * lfoConfig.rate);
      if (step !== lastLfoStepRef.current) {
        lastLfoStepRef.current = step;
        lfoRandomValRef.current = Math.random();
        lfoDriftTargetRef.current = Math.random();
      }

      // Smooth organic wandering drift
      lfoDriftCurrentRef.current += (lfoDriftTargetRef.current - lfoDriftCurrentRef.current) * 0.04;

      const { targets, phaseSpread, depth, shape, customVideoEnabled, customVideoTarget, customAudioEnabled, customAudioTarget } = lfoConfig;

      // Apply modulation across video destinations
      setVideoParams((prev) => {
        let changed = false;
        const next = { ...prev };
        let idx = 0;

        const getAmt = (scale = 1.0) => {
          const targetPhase = basePhase + (idx++) * (phaseSpread * 0.22);
          return evalWave(targetPhase, shape) * depth * scale;
        };

        if (targets.glitchIntensity) { next.glitchIntensity = getAmt(0.85); changed = true; }
        if (targets.rgbShift) { next.rgbShift = getAmt(0.75); changed = true; }
        if (targets.scanlines) { next.scanlines = 0.15 + getAmt(0.65); changed = true; }
        if (targets.meshDisplacement) { next.meshDisplacement = getAmt(0.75); changed = true; }
        if (targets.luminance) { next.luminance = getAmt(0.70); changed = true; }
        if (targets.colorBleed) { next.colorBleed = getAmt(0.80); changed = true; }

        // Dynamic custom assignable video slot
        if (customVideoEnabled && customVideoTarget) {
          const amt = getAmt(1.0);
          if (customVideoTarget === 'crtCurvature') next.crtCurvature = amt * 0.35;
          else if (customVideoTarget === 'vHoldDrift') next.vHoldDrift = amt * 0.25;
          else if (customVideoTarget === 'vhsHeadSwitching') next.vhsHeadSwitching = amt * 0.75;
          else if (customVideoTarget === 'feedback') next.feedback = amt * 0.65;
          else if (customVideoTarget === 'noise') next.noise = amt * 0.45;
          else if (customVideoTarget === 'vaporwaveTint') next.vaporwaveTint = 0.2 + amt * 0.75;
          else if (customVideoTarget === 'apertureGrille') next.apertureGrille = amt * 0.65;
          else if (customVideoTarget === 'chromaSmear') next.chromaSmear = amt * 0.65;
          else if (customVideoTarget === 'audioReact') next.audioReact = amt * 0.85;
          else (next as any)[customVideoTarget] = amt * 0.8;
          changed = true;
        }

        return changed ? next : prev;
      });

      // Apply modulation across audio destinations with musical, controlled ranges
      setAudioParams((prev) => {
        let changed = false;
        const next = { ...prev };
        let idx = 6; // Phase offset audio from video

        const getAmt = (scale = 1.0) => {
          const targetPhase = basePhase + (idx++) * (phaseSpread * 0.22);
          return evalWave(targetPhase, shape) * depth * scale;
        };

        // Musical filter sweep: keeps fundamental frequencies intact (2200Hz -> 8500Hz)
        if (targets.filterCutoff) { next.filterCutoff = Math.round(2200 + getAmt(1.0) * 6300); changed = true; }
        // Subtle analog saturation breathing
        if (targets.drive) { next.drive = Number((0.04 + getAmt(0.18)).toFixed(2)); changed = true; }
        // Gentle organic tape wow (±0.035 drift around normal speed instead of violent octave shifts)
        if (targets.tapeSpeed) { next.tapeSpeed = Number((0.92 + (getAmt(1.0) - 0.5) * 0.07).toFixed(3)); changed = true; }
        // Lush mallsoft ambience breathing
        if (targets.reverbWet) { next.reverbWet = Number((0.15 + getAmt(0.32)).toFixed(2)); changed = true; }

        // Dynamic custom assignable audio slot - carefully scaled for pleasant tone
        if (customAudioEnabled && customAudioTarget) {
          const amt = getAmt(1.0);
          if (customAudioTarget === 'bitcrush') next.bitcrush = Number((amt * 0.08).toFixed(2));
          else if (customAudioTarget === 'filterResonance') next.filterResonance = Number((0.8 + amt * 1.5).toFixed(1));
          else if (customAudioTarget === 'wowRate') next.wowRate = Number((0.5 + amt * 1.0).toFixed(1));
          else if (customAudioTarget === 'wowDepth') next.wowDepth = Number((0.04 + amt * 0.14).toFixed(2));
          else if (customAudioTarget === 'flutterRate') next.flutterRate = Number((6.0 + amt * 4.0).toFixed(1));
          else if (customAudioTarget === 'flutterDepth') next.flutterDepth = Number((0.02 + amt * 0.08).toFixed(2));
          else if (customAudioTarget === 'tapeTone') next.tapeTone = Number((0.15 + amt * 0.35).toFixed(2));
          else if (customAudioTarget === 'tapeHiss') next.tapeHiss = Number((0.005 + amt * 0.015).toFixed(3));
          else if (customAudioTarget === 'tapeDropouts') next.tapeDropouts = Number((amt * 0.08).toFixed(2));
          else if (customAudioTarget === 'stutterSpeed') next.stutterSpeed = Number((0.08 + amt * 0.12).toFixed(2));
          else (next as any)[customAudioTarget] = amt * 0.3;
          changed = true;
        }

        return changed ? next : prev;
      });

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [lfoConfig]);

  // Initialize Web MIDI Engine (Novation Launch Control, XL, Generic & MIDI Learn)
  useEffect(() => {
    const engine = new MidiEngine();
    midiEngineRef.current = engine;

    engine.onStateChange((connected, name) => {
      setMidiConnected(connected);
      setMidiDeviceName(name);
    });

    engine.init((target: MidiTarget, normalized: number, isTrigger: boolean) => {
      // 1. Video parameters
      if (target.startsWith('video.')) {
        const key = target.replace('video.', '') as keyof VideoBendingParams;
        setActivePresetId('custom');
        setVideoParams(prev => ({ ...prev, [key]: normalized }));
      }
      // 2. Audio parameters
      else if (target.startsWith('audio.')) {
        const key = target.replace('audio.', '');
        setActivePresetId('custom');
        if (key === 'filterCutoff') {
          // Logarithmic sweep 80Hz -> 18000Hz for natural musical feel
          const hz = Math.round(80 * Math.pow(18000 / 80, normalized));
          setAudioParams(prev => ({ ...prev, filterCutoff: hz }));
        } else if (key === 'filterResonance') {
          setAudioParams(prev => ({ ...prev, filterResonance: 0.1 + normalized * 18.0 }));
        } else if (key === 'tapeSpeed') {
          setAudioParams(prev => ({ ...prev, tapeSpeed: 0.5 + normalized * 1.0 }));
        } else if (key === 'stutterSpeed') {
          setAudioParams(prev => ({ ...prev, stutterSpeed: 0.05 + normalized * 0.30 }));
        } else {
          setAudioParams(prev => ({ ...prev, [key]: normalized }));
        }
      }
      // 3. Action triggers (Pads / Buttons)
      else if (target.startsWith('action.') && isTrigger) {
        const h = actionHandlersRef.current;
        if (target === 'action.playToggle' && h.playToggle) h.playToggle();
        else if (target === 'action.tapeFreeze' && h.tapeFreeze) h.tapeFreeze();
        else if (target === 'action.randomize' && h.randomize) h.randomize();
        else if (target === 'action.nextTrack' && h.nextTrack) h.nextTrack();
        else if (target === 'action.prevTrack' && h.prevTrack) h.prevTrack();
        else if (target === 'action.preset0' && h.applyPreset) h.applyPreset(PRESETS[0]);
        else if (target === 'action.preset1' && h.applyPreset) h.applyPreset(PRESETS[1]);
        else if (target === 'action.preset2' && h.applyPreset) h.applyPreset(PRESETS[2]);
        else if (target === 'action.preset3' && h.applyPreset) h.applyPreset(PRESETS[3]);
      }
    });
  }, []);

  // Initialize Web Audio Engine
  useEffect(() => {
    const engine = new AudioCircuitEngine();
    audioEngineRef.current = engine;

    return () => {
      engine.dispose();
      audioEngineRef.current = null;
    };
  }, []);

  // Sync Audio Parameters to Engine
  useEffect(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.updateParams(audioParams);
    }
  }, [audioParams]);

  // Connect video element to Web Audio
  const handleEnsureAudioWired = useCallback(() => {
    if (!videoRef.current || !audioEngineRef.current) return;
    audioEngineRef.current.init(videoRef.current);
    audioEngineRef.current.resume();
    setAudioState(audioEngineRef.current.getContextState());
  }, []);

  // Reference to prevent React StrictMode double-mounting initial demo
  const initialLoadRef = useRef<boolean>(false);

  // Load Initial Default Track / Playlist (Strictly once)
  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    appendPlaylistUrl('https://www.youtube.com/watch?v=4RCrvRXUrs4&list=PLqftF03PwhxzYiafvN4C1AzQtDuPeeYqw');
  }, []);

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
        const existingIds = new Set(prev.map(i => i.id));
        const newItems = data.items.filter((i: PlaylistItem) => !existingIds.has(i.id));

        if (newItems.length === 0) {
          // Track is already in playlist, just switch to it without duplicating!
          const existingIdx = prev.findIndex(i => i.id === data.items[0]?.id);
          if (existingIdx !== -1) {
            setTimeout(() => loadTrackAtIndex(existingIdx, prev), 30);
          }
          return prev;
        }

        const merged = [...prev, ...newItems];
        const targetIdx = prev.length;
        setTimeout(() => loadTrackAtIndex(targetIdx < merged.length ? targetIdx : 0, merged), 50);
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
    setCurrentIndex(index);
    const track = list[index];

    // Seed duration from metadata so it never shows Infinity:NaN
    if (track?.duration && track.duration > 0) {
      setDuration(track.duration);
    }

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

    if (isTapeFreeze) {
      // If tape was stopped & frozen, resume the tape motor smoothly
      handleToggleTapeFreeze();
      return;
    }

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

  // Unified Tape Stop & Buffer Freeze:
  // Decelerates playback motor with realistic tape inertia & locks the granular audio buffer and video frame
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
        const videoStream = canvasRef.current.captureStream(30);
        const audioDest = audioEngineRef.current ? audioEngineRef.current.getMediaStreamDestination() : null;
        const tracks = [
          ...videoStream.getVideoTracks(),
          ...(audioDest ? audioDest.stream.getAudioTracks() : [])
        ];
        const combinedStream = new MediaStream(tracks);

        let mimeType = 'video/webm;codecs=vp9,opus';
        if (typeof MediaRecorder !== 'undefined') {
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm;codecs=vp8,opus';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = 'video/webm';
            }
          }
        }

        const recorder = new MediaRecorder(combinedStream, { mimeType });
        recordedChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: mimeType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = `vaporwave-circuitbend-${Date.now()}.webm`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 200);
        };

        recorder.start(500);
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
    // If selecting Direct Bypass, also bypass LFO modulation for true pure pass-through
    if (preset.id === 'clean') {
      setLfoConfig((prev) => ({ ...prev, enabled: false }));
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
      lfo: { ...lfoConfig }
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
          lfo: parsed.lfo
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

    // Controlled, aesthetic VHS / CRT video bending
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
      luminance: Number(rnd(0.05, 0.35).toFixed(2))
    };

    // Musical, pleasant tape / lo-fi audio parameters (warm, clear, non-chaotic)
    const randomAudio: AudioBendingParams = {
      ...audioParams,
      // Slowed & reverb / cassette sweet-spot (0.82x - 0.98x, or 1.0x transparent)
      tapeSpeed: Math.random() > 0.35 ? Number(rnd(0.82, 0.96).toFixed(2)) : 1.0,
      // Tasteful analog cassette pitch drift (subtle and musical, not sea-sick)
      wowRate: Number(rnd(0.4, 1.2).toFixed(1)),
      wowDepth: Number(rnd(0.03, 0.14).toFixed(2)),
      // Fine tape head flutter
      flutterRate: Number(rnd(6.0, 9.5).toFixed(1)),
      flutterDepth: Number(rnd(0.01, 0.06).toFixed(2)),
      tapeTone: Number(rnd(0.15, 0.42).toFixed(2)),
      tapeHiss: Number(rnd(0.003, 0.015).toFixed(3)),
      tapeDropouts: Math.random() > 0.5 ? Number(rnd(0.02, 0.08).toFixed(2)) : 0.0,
      stutterSpeed: Number(rnd(0.08, 0.18).toFixed(2)),
      // Lush, dreamy mallsoft ambience
      reverbWet: Number(rnd(0.15, 0.38).toFixed(2)),
      // Subtle vintage sampler warmth
      bitcrush: Math.random() > 0.65 ? Number(rnd(0.01, 0.04).toFixed(2)) : 0.0,
      drive: Number(rnd(0.04, 0.16).toFixed(2)),
      // Warm lowpass: preserves melody, voice, and deep bass (3500Hz -> 9000Hz)
      filterCutoff: Math.round(rnd(3500, 9200)),
      filterResonance: Number(rnd(0.8, 1.8).toFixed(1)),
      filterType: 'lowpass'
    };

    // Smooth, musical wave shapes (favoring sine, triangle, and organic drift)
    const musicalShapes: LfoShape[] = ['sine', 'triangle', 'drift', 'sine', 'drift', 'triangle'];
    const randomShape = musicalShapes[Math.floor(Math.random() * musicalShapes.length)];

    // Target selection: select 1-2 focused audio modulations and 1-2 focused video modulations
    const randomTargets: Record<LfoTargetId, boolean> = {
      filterCutoff: false,
      tapeSpeed: false, // keep pitch stable on random by default unless user dials it
      drive: false,
      reverbWet: false,
      glitchIntensity: false,
      rgbShift: false,
      scanlines: false,
      meshDisplacement: false,
      luminance: false,
      colorBleed: false
    };

    // Audio modulators (filter sweep, subtle drive saturation, or reverb space breathing)
    const audioChoices: LfoTargetId[] = ['filterCutoff', 'reverbWet', 'drive'];
    const chosenAudio = audioChoices[Math.floor(Math.random() * audioChoices.length)];
    randomTargets[chosenAudio] = true;

    // Video modulators (scanlines, rgbShift, luminance, or 3d relief)
    const videoChoices: LfoTargetId[] = ['rgbShift', 'scanlines', 'luminance', 'meshDisplacement', 'glitchIntensity'];
    const numVideo = Math.floor(rnd(1, 3));
    const shuffledVideo = [...videoChoices].sort(() => 0.5 - Math.random());
    for (let i = 0; i < numVideo; i++) {
      randomTargets[shuffledVideo[i]] = true;
    }

    const audioSlotKeys: AudioParamKey[] = ['reverbWet', 'filterCutoff', 'tapeTone', 'drive', 'wowDepth', 'flutterDepth'];
    const randomAudioTarget = audioSlotKeys[Math.floor(Math.random() * audioSlotKeys.length)];

    const videoSlotKeys: VideoParamKey[] = ['feedback', 'chromaSmear', 'vaporwaveTint', 'crtCurvature', 'noise'];
    const randomVideoTarget = videoSlotKeys[Math.floor(Math.random() * videoSlotKeys.length)];

    setLfoConfig({
      enabled: true,
      shape: randomShape,
      rate: Number(rnd(0.20, 1.10).toFixed(2)),      // Slow, hypnotic, breathing tempo
      depth: Number(rnd(0.30, 0.58).toFixed(2)),     // Musical depth, never extreme
      phaseSpread: Number(rnd(0.20, 0.60).toFixed(2)),// Tasteful polyrhythm
      targets: randomTargets,
      customAudioTarget: randomAudioTarget,
      customAudioEnabled: Math.random() > 0.5,
      customVideoTarget: randomVideoTarget,
      customVideoEnabled: Math.random() > 0.4
    });

    setVideoParams(randomVideo);
    setAudioParams(randomAudio);
    if (audioEngineRef.current) {
      audioEngineRef.current.updateParams(randomAudio);
    }
  };

  // Synchronize latest action handlers for MIDI Engine dispatch
  actionHandlersRef.current = {
    playToggle: handlePlayToggle,
    tapeFreeze: handleToggleTapeFreeze,
    randomize: handleRandomize,
    nextTrack: handleNextTrack,
    prevTrack: handlePrevTrack,
    applyPreset: handleApplyPreset
  };

  // Studio & Live Performance Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not trigger shortcuts when user is typing in forms/inputs
      const target = e.target as HTMLElement;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }

      const key = e.key.toLowerCase();

      // Space -> Play / Pause
      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayToggle();
      }
      // T or F -> Unified Tape Stop & Buffer Freeze
      else if (key === 't' || key === 'f') {
        e.preventDefault();
        handleToggleTapeFreeze();
      }
      // R -> RANDOM musical macro
      else if (key === 'r') {
        e.preventDefault();
        handleRandomize();
      }
      // L -> Toggle LFO Matrix on/off
      else if (key === 'l') {
        e.preventDefault();
        setLfoConfig((prev) => ({ ...prev, enabled: !prev.enabled }));
      }
      // S -> Snapshot HD (if not browser save Ctrl+S / Cmd+S)
      else if (key === 's' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleTakeSnapshot();
      }
      // Z -> Zen Mode Toggle
      else if (key === 'z') {
        e.preventDefault();
        setIsZenMode((prev) => !prev);
      }
      // Escape -> Exit Zen Mode & Close Drawer
      else if (e.key === 'Escape') {
        setIsZenMode(false);
        setIsPlaylistOpen(false);
      }
      // 1-8 -> Preset Quick Recall
      else if (e.key >= '1' && e.key <= '8') {
        const idx = parseInt(e.key, 10) - 1;
        if (PRESETS[idx]) {
          e.preventDefault();
          handleApplyPreset(PRESETS[idx]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayToggle, handleToggleTapeFreeze, handleRandomize, handleApplyPreset, handleTakeSnapshot]);

  const currentTrack = playlist[currentIndex];

  return (
    <div className="h-screen w-screen overflow-hidden relative select-none bg-black text-neutral-300">
      {/* Hidden Native Video Element for decoding frames */}
      <video
        ref={(el) => {
          videoRef.current = el;
          if (el && el !== videoEl) setVideoEl(el);
        }}
        crossOrigin="anonymous"
        playsInline
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', opacity: 0.001, zIndex: 0 }}
        onLoadedData={() => {
          if (videoRef.current) {
            console.log('[Video Frame Stream]: Dimensions', videoRef.current.videoWidth, 'x', videoRef.current.videoHeight, 'ReadyState:', videoRef.current.readyState);
          }
        }}
        onTimeUpdate={() => {
          if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
        }}
        onDurationChange={() => {
          if (videoRef.current) {
            const dur = videoRef.current.duration;
            if (Number.isFinite(dur) && dur > 0) {
              setDuration(dur);
            }
          }
        }}
        onEnded={handleNextTrack}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {/* FULLSCREEN IMMERSIVE VIDEO BACKGROUND (Click anywhere to Play/Pause) */}
      <VideoViewport
        videoElement={videoEl || videoRef.current}
        videoParams={videoParams}
        isPlaying={isPlaying}
        isTapeFreeze={isTapeFreeze}
        audioEngine={audioEngineRef.current}
        showTimeline={showTimeline}
        onPlayToggle={handlePlayToggle}
        onNext={handleNextTrack}
        onPrev={handlePrevTrack}
        onToggleTapeFreeze={handleToggleTapeFreeze}
        onCanvasReady={(c) => { canvasRef.current = c; }}
        title={currentTrack?.title || 'STANDBY - FEED READY'}
        duration={duration}
        currentTime={currentTime}
        onSeek={(val) => {
          if (videoRef.current) videoRef.current.currentTime = val;
        }}
      />

      {/* FLOATING MINIMAL HEADER (Top) - Fades out in Zen Mode */}
      <div className={`absolute top-0 left-0 right-0 z-30 pointer-events-none transition-opacity duration-300 ${isZenMode ? 'opacity-0' : 'opacity-100'}`}>
        <div className="pointer-events-auto">
          <Header
            audioContextState={audioState}
            onInitAudio={handleEnsureAudioWired}
            playlistCount={playlist.length}
            isPlaylistOpen={isPlaylistOpen}
            onTogglePlaylist={() => setIsPlaylistOpen(!isPlaylistOpen)}
          />
        </div>
      </div>

      {/* FLOATING BOTTOM DOCK: KNOBS, AUDIO VISUALIZER & MASTER (No scroll!) - Fades out in Zen Mode */}
      <div className={`transition-opacity duration-300 ${isZenMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <RackControls
          videoParams={videoParams}
          audioParams={audioParams}
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
          onToggleTimeline={() => setShowTimeline((prev) => !prev)}
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
          onOpenMidiModal={() => setIsMidiModalOpen(true)}
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

      {/* Snapshot Shutter White Flash */}
      {snapshotFlash && (
        <div className="fixed inset-0 z-50 bg-white/80 pointer-events-none animate-pulse transition-opacity duration-200" />
      )}
    </div>
  );
};

export default App;
