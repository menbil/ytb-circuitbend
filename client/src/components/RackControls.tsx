import React, { useState } from 'react';
import { 
  Zap, 
  Tv, 
  Activity, 
  Sliders, 
  Volume2, 
  VolumeX, 
  ChevronDown, 
  ChevronUp, 
  Clock,
  Snowflake,
  Circle,
  Radio,
  Camera,
  Maximize2,
  Save,
  Trash2,
  Copy,
  FileDown,
  X,
  Check
} from 'lucide-react';
import { 
  VideoBendingParams, 
  AudioBendingParams, 
  Preset, 
  UserPreset,
  LfoConfig, 
  LfoTargetId,
  VideoParamKey,
  AudioParamKey 
} from '../types/index.js';
import { PRESETS } from '../presets.js';
import { HardwareKnob } from './HardwareKnob.js';
import { HardwareFader } from './HardwareFader.js';
import { AudioVisualizer } from './AudioVisualizer.js';

interface RackControlsProps {
  videoParams: VideoBendingParams;
  audioParams: AudioBendingParams;
  activePresetId: string;
  analyser: AnalyserNode | null;
  isTapeStopped?: boolean;
  isFreezeActive?: boolean;
  isTapeFreeze?: boolean;
  isRecording?: boolean;
  recordingDuration?: number;
  midiConnected?: boolean;
  showTimeline?: boolean;
  isZenMode?: boolean;
  userPresets?: UserPreset[];
  lfoConfig?: LfoConfig;
  onUpdateLfo?: (partial: Partial<LfoConfig>) => void;
  onToggleTimeline?: () => void;
  onToggleFreeze?: () => void;
  onToggleTapeFreeze?: () => void;
  onToggleRecord?: () => void;
  onToggleZen?: () => void;
  onTakeSnapshot?: () => void;
  onSavePreset?: (name: string) => void;
  onDeleteUserPreset?: (id: string) => void;
  onApplyUserPreset?: (preset: UserPreset) => void;
  onImportPresetJson?: (json: string) => boolean;
  onUpdateVideo: (params: Partial<VideoBendingParams>) => void;
  onUpdateAudio: (params: Partial<AudioBendingParams>) => void;
  onApplyPreset: (preset: Preset) => void;
  onRandomize: () => void;
  onTapeStop?: () => void;
  onOpenMidiModal?: () => void;
}

export const RackControls: React.FC<RackControlsProps> = ({
  videoParams,
  audioParams,
  activePresetId,
  analyser,
  isTapeStopped = false,
  isFreezeActive = false,
  isTapeFreeze,
  isRecording = false,
  recordingDuration = 0,
  midiConnected = false,
  showTimeline = true,
  isZenMode = false,
  userPresets = [],
  lfoConfig,
  onUpdateLfo,
  onToggleTimeline,
  onToggleFreeze,
  onToggleTapeFreeze,
  onToggleRecord,
  onToggleZen,
  onTakeSnapshot,
  onSavePreset,
  onDeleteUserPreset,
  onApplyUserPreset,
  onImportPresetJson,
  onUpdateVideo,
  onUpdateAudio,
  onApplyPreset,
  onRandomize,
  onTapeStop,
  onOpenMidiModal
}) => {
  const isStoppedAndFrozen = isTapeFreeze ?? (isTapeStopped || isFreezeActive);
  const handleTapeFreezeAction = onToggleTapeFreeze || onTapeStop || onToggleFreeze;

  // Two unified, crystal-clear categories: 'video' vs 'audio'
  const [activeCategory, setActiveCategory] = useState<'video' | 'audio'>('video');
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSparking, setIsSparking] = useState(false);
  const [isLfoOpen, setIsLfoOpen] = useState(false);

  // User Preset Management Modal State
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [importJsonText, setImportJsonText] = useState('');
  const [showImportArea, setShowImportArea] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const handleRandomize = () => {
    setIsSparking(true);
    onRandomize();
    setTimeout(() => setIsSparking(false), 300);
  };

  const handleCopyCurrentJson = () => {
    const patch = {
      name: `CircuitBend Patch (${new Date().toLocaleTimeString()})`,
      video: videoParams,
      audio: audioParams,
      lfo: lfoConfig
    };
    navigator.clipboard.writeText(JSON.stringify(patch, null, 2)).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSavePreset && newPresetName.trim()) {
      onSavePreset(newPresetName.trim());
      setNewPresetName('');
      setShowSaveModal(false);
    }
  };

  const handleImportSubmit = () => {
    if (onImportPresetJson && importJsonText.trim()) {
      const ok = onImportPresetJson(importJsonText.trim());
      if (ok) {
        setImportJsonText('');
        setShowImportArea(false);
        setShowSaveModal(false);
      }
    }
  };

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[96%] max-w-6xl bg-neutral-950/85 backdrop-blur-xl border border-neutral-700/60 rounded-xl shadow-[0_10px_35px_rgba(0,0,0,0.8)] overflow-hidden transition-all duration-200">
      {/* FLOATING TOP BAR: PRESETS + CATEGORY TOGGLE + MACRO ACTIONS */}
      <div className="px-3 py-1.5 bg-black/60 border-b border-neutral-800 flex items-center justify-between gap-2 flex-wrap">
        {/* Preset Selector */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-mono font-bold text-neutral-400 mr-1 flex items-center gap-1">
            <Sliders size={11} className="text-amber-500" />
            PRESETS:
          </span>
          {PRESETS.map((preset, pIdx) => {
            const isActive = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => onApplyPreset(preset)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all border ${
                  isActive
                    ? 'bg-amber-500 text-black border-amber-400 shadow-[0_0_10px_rgba(255,157,0,0.5)]'
                    : 'bg-neutral-900/80 text-neutral-300 border-neutral-700/80 hover:bg-neutral-800 hover:text-white'
                }`}
                title={`${preset.description} [Touche ${pIdx + 1}]`}
              >
                {preset.name}
              </button>
            );
          })}

          {/* User Saved Presets */}
          {userPresets.map((up) => {
            const isActive = activePresetId === up.id;
            return (
              <div key={up.id} className="relative group flex items-center">
                <button
                  onClick={() => onApplyUserPreset && onApplyUserPreset(up)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all border flex items-center gap-1 ${
                    isActive
                      ? 'bg-purple-600 text-white border-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.6)]'
                      : 'bg-purple-950/40 text-purple-300 border-purple-800/80 hover:bg-purple-900/60 hover:text-white'
                  }`}
                  title={`Preset Utilisateur: ${up.name}`}
                >
                  <span className="text-[8px] px-1 bg-purple-500/30 text-purple-200 rounded font-semibold">USER</span>
                  <span>{up.name}</span>
                </button>
                {onDeleteUserPreset && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Supprimer le preset "${up.name}" ?`)) {
                        onDeleteUserPreset(up.id);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 ml-0.5 p-0.5 text-neutral-500 hover:text-rose-400 transition-opacity"
                    title="Supprimer"
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            );
          })}

          {/* Save / Export Patch Button */}
          <button
            onClick={() => setShowSaveModal(true)}
            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all border border-dashed border-amber-500/50 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 hover:border-amber-400 flex items-center gap-1 shadow-sm"
            title="Sauvegarder ou exporter votre patch actuel"
          >
            <Save size={10} />
            <span>+ SAVE</span>
          </button>
        </div>

        {/* Right side actions: SNAP, REC, LFO, FREEZE, Tape Stop, Randomize, ZEN, Minimize Toggle */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Snapshot Photo HD */}
          {onTakeSnapshot && (
            <button
              onClick={onTakeSnapshot}
              className="px-2 py-0.5 rounded font-mono text-[10px] font-bold flex items-center gap-1 transition-all border bg-neutral-900/90 text-neutral-300 border-neutral-700/80 hover:bg-neutral-800 hover:text-white"
              title="Prendre une photo instantanée HD du flux vidéo [Touche S]"
            >
              <Camera size={11} className="text-cyan-400" />
              <span>SNAP</span>
            </button>
          )}

          {/* Direct Stream Session Recorder */}
          {onToggleRecord && (
            <button
              onClick={onToggleRecord}
              className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold flex items-center gap-1 transition-all border ${
                isRecording
                  ? 'bg-rose-600 text-white border-rose-300 shadow-[0_0_12px_#ff0033] animate-pulse'
                  : 'bg-neutral-900/90 text-neutral-300 border-neutral-700/80 hover:bg-neutral-800 hover:text-white'
              }`}
              title={isRecording ? 'Arrêter et exporter l’enregistrement vidéo' : 'Enregistrer la session en direct (WebM)'}
            >
              <Circle size={8} fill={isRecording ? '#ffffff' : '#ef4444'} className={isRecording ? 'animate-ping' : ''} />
              <span>{isRecording ? `REC ${Math.floor(recordingDuration / 60).toString().padStart(2, '0')}:${(recordingDuration % 60).toString().padStart(2, '0')}` : 'REC'}</span>
            </button>
          )}

          {/* LFO Macro Automator Toggle Button */}
          {lfoConfig && onUpdateLfo && (
            <button
              onClick={() => setIsLfoOpen(!isLfoOpen)}
              className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold flex items-center gap-1 transition-all border ${
                lfoConfig.enabled
                  ? 'bg-purple-600 text-white border-purple-300 shadow-[0_0_12px_#a855f7] animate-pulse'
                  : (isLfoOpen ? 'bg-purple-950 text-purple-300 border-purple-600' : 'bg-neutral-900/90 text-purple-400 border-purple-800/80 hover:bg-purple-950/60')
              }`}
              title="Générateur d’oscillations continues (LFO Automator) [Touche L]"
            >
              <span className="text-xs">∿</span>
              <span>{lfoConfig.enabled ? 'LFO ON' : 'LFO'}</span>
            </button>
          )}

          {/* Unified Tape Stop / Freeze */}
          {handleTapeFreezeAction && (
            <button
              onClick={handleTapeFreezeAction}
              className={`px-2.5 py-0.5 rounded font-mono text-[10px] font-bold flex items-center gap-1.5 transition-all border ${
                isStoppedAndFrozen
                  ? 'bg-gradient-to-r from-rose-600 to-cyan-600 text-white border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.7)] animate-pulse'
                  : 'bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-600/80 shadow-[0_0_8px_rgba(244,63,94,0.3)]'
              }`}
              title={
                isStoppedAndFrozen
                  ? 'Relancer le moteur de bande et le flux [Touche T ou F]'
                  : 'Arrêt de bande & Gel de la vidéo (Tape Stop & Freeze) [Touche T ou F]'
              }
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isStoppedAndFrozen ? 'bg-cyan-300 animate-ping' : 'bg-rose-500 animate-pulse'
                }`}
              />
              <Snowflake size={11} className={isStoppedAndFrozen ? 'animate-spin text-cyan-200' : 'text-rose-400'} />
              <span>{isStoppedAndFrozen ? 'RESUME // DÉGELER' : 'TAPE STOP // FREEZE'}</span>
            </button>
          )}

          {/* MIDI Controller Badge & Settings Trigger */}
          <button
            onClick={onOpenMidiModal}
            className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold flex items-center gap-1.5 transition-all border ${
              midiConnected
                ? 'bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 border-emerald-600/80 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                : 'bg-neutral-900/90 hover:bg-neutral-800 text-neutral-400 border-neutral-700'
            }`}
            title="Ouvrir le configurateur MIDI (Novation Launch Control, Learn & Diagnostic)"
          >
            <Radio size={9} className={midiConnected ? 'text-emerald-400 animate-pulse' : 'text-neutral-500'} />
            <span>MIDI</span>
            {midiConnected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          </button>

          {/* RANDOM Button */}
          <button
            onClick={handleRandomize}
            className={`px-2.5 py-0.5 rounded font-mono text-[10px] font-bold flex items-center gap-1 transition-all border ${
              isSparking
                ? 'bg-red-500 text-white border-red-300 shadow-[0_0_15px_#ff0033]'
                : 'bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white border-red-500 shadow-[0_0_10px_rgba(255,42,75,0.4)]'
            }`}
            title="Randomisation musicale et visuelle [Touche R]"
          >
            <Zap size={11} className={isSparking ? 'animate-spin' : ''} />
            <span>RANDOM</span>
          </button>

          {/* Mode Zen Toggle Button */}
          {onToggleZen && (
            <button
              onClick={onToggleZen}
              className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold flex items-center gap-1 transition-all border ${
                isZenMode
                  ? 'bg-amber-500 text-black border-amber-300 shadow-[0_0_10px_rgba(255,157,0,0.5)]'
                  : 'bg-neutral-900/90 text-neutral-400 border-neutral-700/80 hover:text-white hover:bg-neutral-800'
              }`}
              title="Mode Plein Écran Immersif / Zen [Touche Z ou Échap]"
            >
              <Maximize2 size={11} />
              <span>ZEN</span>
            </button>
          )}

          {/* Minimize / Expand Dock Button */}
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors border border-neutral-700"
            title={isMinimized ? 'Déplier les contrôles' : 'Replier le dock'}
          >
            {isMinimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* LFO MODULATION MATRIX PANEL (Visible when LFO button is clicked) */}
      {isLfoOpen && lfoConfig && onUpdateLfo && (
        <div className="px-4 py-2.5 bg-gradient-to-r from-purple-950/75 via-neutral-950/95 to-purple-950/75 border-b border-purple-800/60 font-mono text-xs shadow-inner">
          {/* Top Controls: LFO State, Waveform, Rate, Depth, Phase Spread */}
          <div className="flex items-center justify-between gap-3 flex-wrap pb-2 border-b border-purple-900/50">
            <div className="flex items-center gap-2">
              <span className="font-bold text-purple-300 flex items-center gap-1.5 tracking-wider">
                <span className="text-base animate-pulse">∿</span> LFO MATRIX ROUTER :
              </span>
              <button
                onClick={() => onUpdateLfo({ enabled: !lfoConfig.enabled })}
                className={`px-2.5 py-0.5 rounded text-[11px] font-bold border transition-all ${
                  lfoConfig.enabled
                    ? 'bg-purple-600 text-white border-purple-300 shadow-[0_0_12px_#a855f7]'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:text-white'
                }`}
              >
                {lfoConfig.enabled ? '● LFO ACTIF' : '○ BYPASS'}
              </button>
            </div>

            {/* Expanded Waveform Selector */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-neutral-400 text-[10px]">WAVE:</span>
              {[
                { id: 'sine', label: '∿ SINE' },
                { id: 'triangle', label: '/\\ TRI' },
                { id: 'saw', label: '⩘ SAW' },
                { id: 'sawDown', label: '⩗ SAW-DN' },
                { id: 'square', label: '⊓ SQUARE' },
                { id: 'random', label: '⚂ S&H' },
                { id: 'drift', label: '〰 DRIFT' }
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => onUpdateLfo({ shape: id as any })}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all ${
                    lfoConfig.shape === id
                      ? 'bg-purple-600 text-white border-purple-400 shadow-[0_0_8px_#c084fc]'
                      : 'bg-black/60 text-neutral-400 border-neutral-800 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Rate, Depth & Polyrhythmic Spread Sliders */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-400 text-[10px]">RATE:</span>
                <input
                  type="range"
                  min="0.1"
                  max="5.0"
                  step="0.1"
                  value={lfoConfig.rate}
                  onChange={(e) => onUpdateLfo({ rate: parseFloat(e.target.value) })}
                  className="w-16 accent-purple-500 cursor-pointer"
                />
                <span className="text-purple-300 text-[10px] w-8">{lfoConfig.rate.toFixed(1)}Hz</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-neutral-400 text-[10px]">DEPTH:</span>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={lfoConfig.depth}
                  onChange={(e) => onUpdateLfo({ depth: parseFloat(e.target.value) })}
                  className="w-16 accent-purple-500 cursor-pointer"
                />
                <span className="text-purple-300 text-[10px] w-8">{Math.round(lfoConfig.depth * 100)}%</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-neutral-400 text-[10px]" title="Décalage de phase polyrythmique entre les cibles">SPREAD:</span>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={lfoConfig.phaseSpread ?? 0.35}
                  onChange={(e) => onUpdateLfo({ phaseSpread: parseFloat(e.target.value) })}
                  className="w-14 accent-purple-400 cursor-pointer"
                />
                <span className="text-purple-300 text-[10px] w-7">{Math.round((lfoConfig.phaseSpread ?? 0.35) * 100)}%</span>
              </div>
            </div>
          </div>

          {/* Matrix Targets Grid & Dedicated Custom Slots */}
          <div className="pt-2 flex flex-col gap-2">
            {/* Audio Destinations Row */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold text-amber-400/80 mr-1 flex items-center gap-1">
                  AUDIO:
                </span>
                {[
                  { id: 'filterCutoff' as LfoTargetId, label: 'FILTER' },
                  { id: 'tapeSpeed' as LfoTargetId, label: 'TAPE SPD' },
                  { id: 'drive' as LfoTargetId, label: 'DRIVE' },
                  { id: 'reverbWet' as LfoTargetId, label: 'REVERB' }
                ].map(({ id, label }) => {
                  const isActive = !!lfoConfig.targets[id];
                  return (
                    <button
                      key={id}
                      onClick={() => onUpdateLfo({ targets: { ...lfoConfig.targets, [id]: !isActive } })}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all flex items-center gap-1 ${
                        isActive
                          ? 'bg-amber-500/20 text-amber-300 border-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                          : 'bg-black/50 text-neutral-500 border-neutral-800 hover:text-neutral-300 hover:border-neutral-700'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-amber-400 animate-pulse' : 'bg-neutral-600'}`}></span>
                      {label}
                    </button>
                  );
                })}

                {/* DEDICATED ASSIGNABLE AUDIO SLOT */}
                <div className="flex items-center gap-1 ml-2 bg-neutral-900/80 border border-amber-600/60 rounded px-1.5 py-0.5">
                  <button
                    onClick={() => onUpdateLfo({ customAudioEnabled: !lfoConfig.customAudioEnabled })}
                    className={`px-1 rounded text-[9px] font-bold border transition-all flex items-center gap-1 ${
                      lfoConfig.customAudioEnabled
                        ? 'bg-amber-500 text-black border-amber-300 font-bold'
                        : 'bg-black/60 text-neutral-400 border-neutral-700 hover:text-white'
                    }`}
                    title="Activer/désactiver le slot audio personnalisé"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${lfoConfig.customAudioEnabled ? 'bg-black' : 'bg-neutral-600'}`}></span>
                    SLOT:
                  </button>
                  <select
                    value={lfoConfig.customAudioTarget || 'bitcrush'}
                    onChange={(e) => onUpdateLfo({ customAudioTarget: e.target.value as AudioParamKey, customAudioEnabled: true })}
                    className="bg-black text-amber-200 text-[10px] font-mono rounded px-1 py-0.5 border border-amber-700/60 focus:outline-none"
                  >
                    <option value="bitcrush">Bitcrush</option>
                    <option value="filterCutoff">Filter Cutoff</option>
                    <option value="filterResonance">Filter Res (Q)</option>
                    <option value="drive">Drive Saturation</option>
                    <option value="tapeSpeed">Tape Speed / Pitch</option>
                    <option value="reverbWet">Mall Reverb</option>
                    <option value="wowRate">Wow Rate</option>
                    <option value="wowDepth">Wow Depth</option>
                    <option value="flutterRate">Flutter Rate</option>
                    <option value="flutterDepth">Flutter Depth</option>
                    <option value="tapeTone">Tape Tone (Head Bump)</option>
                    <option value="tapeHiss">Tape Hiss Floor</option>
                    <option value="tapeDropouts">Tape Dropouts</option>
                    <option value="stutterSpeed">Freeze Slice Speed</option>
                  </select>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onUpdateLfo({
                    targets: {
                      ...lfoConfig.targets,
                      filterCutoff: true,
                      tapeSpeed: true,
                      drive: true,
                      reverbWet: true
                    },
                    customAudioEnabled: true
                  })}
                  className="px-1.5 py-0.5 rounded text-[9px] bg-neutral-900 text-neutral-400 hover:text-amber-300 border border-neutral-800 transition-colors"
                >
                  +TOUT AUDIO
                </button>
                <button
                  onClick={() => onUpdateLfo({
                    targets: {
                      ...lfoConfig.targets,
                      glitchIntensity: true,
                      rgbShift: true,
                      scanlines: true,
                      meshDisplacement: true,
                      luminance: true,
                      colorBleed: true
                    },
                    customVideoEnabled: true
                  })}
                  className="px-1.5 py-0.5 rounded text-[9px] bg-neutral-900 text-neutral-400 hover:text-cyan-300 border border-neutral-800 transition-colors"
                >
                  +TOUT VIDÉO
                </button>
                <button
                  onClick={() => onUpdateLfo({
                    targets: {
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
                    },
                    customAudioEnabled: false,
                    customVideoEnabled: false
                  })}
                  className="px-1.5 py-0.5 rounded text-[9px] bg-neutral-900 text-neutral-500 hover:text-rose-400 border border-neutral-800 transition-colors"
                >
                  CLEAR
                </button>
              </div>
            </div>

            {/* Video Destinations Row */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-purple-900/30">
              <span className="text-[10px] font-bold text-cyan-400/80 mr-1 flex items-center gap-1">
                VIDEO:
              </span>
              {[
                { id: 'glitchIntensity' as LfoTargetId, label: 'H-GLITCH' },
                { id: 'rgbShift' as LfoTargetId, label: 'RGB SHIFT' },
                { id: 'scanlines' as LfoTargetId, label: 'SCANLINES' },
                { id: 'meshDisplacement' as LfoTargetId, label: '3D RELIEF' },
                { id: 'luminance' as LfoTargetId, label: 'LUMINANCE' },
                { id: 'colorBleed' as LfoTargetId, label: 'CHROMA' }
              ].map(({ id, label }) => {
                const isActive = !!lfoConfig.targets[id];
                return (
                  <button
                    key={id}
                    onClick={() => onUpdateLfo({ targets: { ...lfoConfig.targets, [id]: !isActive } })}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all flex items-center gap-1 ${
                      isActive
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]'
                        : 'bg-black/50 text-neutral-500 border-neutral-800 hover:text-neutral-300 hover:border-neutral-700'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-cyan-400 animate-pulse' : 'bg-neutral-600'}`}></span>
                    {label}
                  </button>
                );
              })}

              {/* DEDICATED ASSIGNABLE VIDEO SLOT */}
              <div className="flex items-center gap-1 ml-2 bg-neutral-900/80 border border-cyan-600/60 rounded px-1.5 py-0.5">
                <button
                  onClick={() => onUpdateLfo({ customVideoEnabled: !lfoConfig.customVideoEnabled })}
                  className={`px-1 rounded text-[9px] font-bold border transition-all flex items-center gap-1 ${
                    lfoConfig.customVideoEnabled
                      ? 'bg-cyan-400 text-black border-cyan-200 font-bold'
                      : 'bg-black/60 text-neutral-400 border-neutral-700 hover:text-white'
                  }`}
                  title="Activer/désactiver le slot vidéo personnalisé"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${lfoConfig.customVideoEnabled ? 'bg-black' : 'bg-neutral-600'}`}></span>
                  SLOT:
                </button>
                <select
                  value={lfoConfig.customVideoTarget || 'feedback'}
                  onChange={(e) => onUpdateLfo({ customVideoTarget: e.target.value as VideoParamKey, customVideoEnabled: true })}
                  className="bg-black text-cyan-200 text-[10px] font-mono rounded px-1 py-0.5 border border-cyan-700/60 focus:outline-none"
                >
                  <option value="feedback">Feedback Ghost</option>
                  <option value="noise">RF Static Noise</option>
                  <option value="vaporwaveTint">Vaporwave Tint</option>
                  <option value="crtCurvature">CRT Curvature</option>
                  <option value="apertureGrille">Aperture Grille</option>
                  <option value="vhsHeadSwitching">VHS Head Switching</option>
                  <option value="vHoldDrift">V-Hold Drift Roll</option>
                  <option value="chromaSmear">Chroma Beam Smear</option>
                  <option value="audioReact">Sidechain Audio React</option>
                  <option value="glitchIntensity">H-Sync Glitch</option>
                  <option value="rgbShift">RGB Shift</option>
                  <option value="scanlines">Scanlines</option>
                  <option value="meshDisplacement">3D Relief Topo</option>
                  <option value="luminance">Luminance</option>
                  <option value="colorBleed">Chroma Bleed</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DOCK EXPANDED BODY (Hidden when minimized) */}
      {!isMinimized && (
        <div className="p-3 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
          {/* LEFT 9 COLS: REGROUPED AUDIO & VIDEO MODULES */}
          <div className="lg:col-span-9 flex flex-col justify-between">
            {/* Clear Two-World Category Switcher */}
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setActiveCategory('video')}
                className={`px-3 py-1 rounded-md text-xs font-mono font-bold flex items-center gap-1.5 transition-colors border ${
                  activeCategory === 'video'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                    : 'bg-neutral-900/60 border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                <Tv size={13} />
                <span>🎬 EFFETS VIDÉO & SHADERS</span>
              </button>

              <button
                onClick={() => setActiveCategory('audio')}
                className={`px-3 py-1 rounded-md text-xs font-mono font-bold flex items-center gap-1.5 transition-colors border ${
                  activeCategory === 'audio'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                    : 'bg-neutral-900/60 border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                <Activity size={13} />
                <span>🎵 EFFETS AUDIO & TAPE DSP</span>
              </button>
            </div>

            {/* CATEGORY 1: ALL VIDEO SHADER CONTROLS */}
            {activeCategory === 'video' && (
              <div className="bg-black/40 border border-neutral-800/80 rounded-lg p-2 flex flex-col gap-2">
                {/* Row 1: VHS, CRT Tube & Vaporwave Aesthetics */}
                <div className="flex items-center justify-between border-b border-neutral-800/60 pb-1.5 px-1">
                  <span className="text-[9px] font-mono text-cyan-400 font-bold">1. CRT TUBE & VHS PHYSICS :</span>
                  <div className="grid grid-cols-7 gap-2 flex-1 max-w-2xl justify-items-center">
                    <HardwareKnob
                      label="CRT CURVATURE"
                      value={videoParams.crtCurvature}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="electric"
                      onChange={(v) => onUpdateVideo({ crtCurvature: v })}
                    />
                    <HardwareKnob
                      label="VAPORWAVE TINT"
                      value={videoParams.vaporwaveTint}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="crimson"
                      onChange={(v) => onUpdateVideo({ vaporwaveTint: v })}
                    />
                    <HardwareKnob
                      label="LUMINANCE"
                      value={videoParams.luminance || 0.0}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="phosphor"
                      onChange={(v) => onUpdateVideo({ luminance: v })}
                    />
                    <HardwareKnob
                      label="PHOSPHOR MASK"
                      value={videoParams.apertureGrille}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="phosphor"
                      onChange={(v) => onUpdateVideo({ apertureGrille: v })}
                    />
                    <HardwareKnob
                      label="CHROMA SMEAR"
                      value={videoParams.chromaSmear || 0.0}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="electric"
                      onChange={(v) => onUpdateVideo({ chromaSmear: v })}
                    />
                    <HardwareKnob
                      label="HEAD SWITCHING"
                      value={videoParams.vhsHeadSwitching}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="amber"
                      onChange={(v) => onUpdateVideo({ vhsHeadSwitching: v })}
                    />
                    <HardwareKnob
                      label="V-HOLD DRIFT"
                      value={videoParams.vHoldDrift}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="amber"
                      onChange={(v) => onUpdateVideo({ vHoldDrift: v })}
                    />
                  </div>
                </div>

                {/* Row 2: Glitch, Chromatic Aberration & Circuit Corruption */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-[9px] font-mono text-cyan-400 font-bold">2. GLITCH & CORRUPTION :</span>
                  <div className="grid grid-cols-8 gap-2 flex-1 max-w-3xl justify-items-center">
                    <HardwareKnob
                      label="H-SYNC LOSS"
                      value={videoParams.glitchIntensity}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="amber"
                      onChange={(v) => onUpdateVideo({ glitchIntensity: v })}
                    />
                    <HardwareKnob
                      label="RGB SHIFT"
                      value={videoParams.rgbShift}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="crimson"
                      onChange={(v) => onUpdateVideo({ rgbShift: v })}
                    />
                    <HardwareKnob
                      label="SCANLINES"
                      value={videoParams.scanlines}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="amber"
                      onChange={(v) => onUpdateVideo({ scanlines: v })}
                    />
                    <HardwareKnob
                      label="COLOR BLEED"
                      value={videoParams.colorBleed}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="electric"
                      onChange={(v) => onUpdateVideo({ colorBleed: v })}
                    />
                    <HardwareKnob
                      label="CAP. FEEDBACK"
                      value={videoParams.feedback}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="amber"
                      onChange={(v) => onUpdateVideo({ feedback: v })}
                    />
                    <HardwareKnob
                      label="RF NOISE"
                      value={videoParams.noise}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="phosphor"
                      onChange={(v) => onUpdateVideo({ noise: v })}
                    />
                    <HardwareKnob
                      label="3D RELIEF"
                      value={videoParams.meshDisplacement || 0.0}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="crimson"
                      onChange={(v) => onUpdateVideo({ meshDisplacement: v })}
                    />
                    <HardwareKnob
                      label="SIDECHAIN KICK"
                      value={videoParams.audioReact || 0.0}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="electric"
                      onChange={(v) => onUpdateVideo({ audioReact: v })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* CATEGORY 2: ALL AUDIO DSP CONTROLS */}
            {activeCategory === 'audio' && (
              <div className="bg-black/40 border border-neutral-800/80 rounded-lg p-2 flex flex-col gap-2">
                {/* Row 1: Tape Deck, Wow/Flutter & Mall Reverb */}
                <div className="flex items-center justify-between border-b border-neutral-800/60 pb-1.5 px-1">
                  <span className="text-[9px] font-mono text-amber-400 font-bold">1. TAPE & REVERB :</span>
                  <div className="grid grid-cols-7 gap-2 flex-1 max-w-2xl justify-items-center">
                    <HardwareKnob
                      label="TAPE SPEED"
                      value={audioParams.tapeSpeed}
                      min={0.5}
                      max={1.1}
                      step={0.01}
                      unit="x"
                      color="amber"
                      onChange={(v) => onUpdateAudio({ tapeSpeed: v })}
                    />
                    <HardwareKnob
                      label="WOW RATE"
                      value={audioParams.wowRate}
                      min={0.4}
                      max={2.5}
                      step={0.1}
                      unit="Hz"
                      color="amber"
                      onChange={(v) => onUpdateAudio({ wowRate: v })}
                    />
                    <HardwareKnob
                      label="WOW DEPTH"
                      value={audioParams.wowDepth}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="amber"
                      onChange={(v) => onUpdateAudio({ wowDepth: v })}
                    />
                    <HardwareKnob
                      label="FLUTTER RATE"
                      value={audioParams.flutterRate}
                      min={5.0}
                      max={15.0}
                      step={0.5}
                      unit="Hz"
                      color="electric"
                      onChange={(v) => onUpdateAudio({ flutterRate: v })}
                    />
                    <HardwareKnob
                      label="FLUTTER DEPTH"
                      value={audioParams.flutterDepth}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="electric"
                      onChange={(v) => onUpdateAudio({ flutterDepth: v })}
                    />
                    <HardwareKnob
                      label="TAPE TONE"
                      value={audioParams.tapeTone}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="crimson"
                      onChange={(v) => onUpdateAudio({ tapeTone: v })}
                    />
                    <HardwareKnob
                      label="MALL REVERB"
                      value={audioParams.reverbWet}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="phosphor"
                      onChange={(v) => onUpdateAudio({ reverbWet: v })}
                    />
                  </div>
                </div>

                {/* Row 2: Distortion, Filter, Noise Floor & Granular Stutter */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-[9px] font-mono text-amber-400 font-bold">2. DRIVE & IMPERFECTIONS :</span>
                  <div className="grid grid-cols-7 gap-2 flex-1 max-w-2xl justify-items-center">
                    <HardwareKnob
                      label="BITCRUSH"
                      value={audioParams.bitcrush}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="crimson"
                      onChange={(v) => onUpdateAudio({ bitcrush: v })}
                    />
                    <HardwareKnob
                      label="SMOOTH DRIVE"
                      value={audioParams.drive}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="amber"
                      onChange={(v) => onUpdateAudio({ drive: v })}
                    />
                    <HardwareKnob
                      label="CUTOFF"
                      value={audioParams.filterCutoff}
                      min={80}
                      max={16000}
                      step={50}
                      unit="Hz"
                      color="phosphor"
                      formatValue={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${Math.round(v)}`}
                      onChange={(v) => onUpdateAudio({ filterCutoff: v })}
                    />
                    <HardwareKnob
                      label="RESONANCE Q"
                      value={audioParams.filterResonance}
                      min={0.2}
                      max={24.0}
                      step={0.2}
                      color="phosphor"
                      onChange={(v) => onUpdateAudio({ filterResonance: v })}
                    />
                    <HardwareKnob
                      label="TAPE HISS"
                      value={audioParams.tapeHiss}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="amber"
                      onChange={(v) => onUpdateAudio({ tapeHiss: v })}
                    />
                    <HardwareKnob
                      label="TAPE DROPOUT"
                      value={audioParams.tapeDropouts || 0.0}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      color="crimson"
                      onChange={(v) => onUpdateAudio({ tapeDropouts: v })}
                    />
                    <HardwareKnob
                      label="STUTTER SIZE"
                      value={audioParams.stutterSpeed || 0.12}
                      min={0.04}
                      max={0.40}
                      step={0.01}
                      unit="s"
                      formatValue={(v) => `${Math.round(v * 1000)}ms`}
                      color="electric"
                      onChange={(v) => onUpdateAudio({ stutterSpeed: v })}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT 3 COLS: OSCILLOSCOPE, TIMELINE TOGGLE & MASTER */}
          <div className="lg:col-span-3 border-t lg:border-t-0 lg:border-l border-neutral-800 lg:pl-3 flex flex-col justify-between gap-1.5">
            <AudioVisualizer analyser={analyser} mode="oscilloscope" />

            <div className="flex items-center justify-between gap-3 pt-1">
              <HardwareFader
                label="MASTER"
                value={audioParams.masterVolume}
                min={0.0}
                max={1.0}
                step={0.01}
                height={60}
                onChange={(v) => onUpdateAudio({ masterVolume: v })}
              />

              <div className="flex flex-col gap-1 flex-1 font-mono text-[9px]">
                {/* Timeline Visibility Toggle Option */}
                {onToggleTimeline && (
                  <button
                    type="button"
                    onClick={onToggleTimeline}
                    className={`flex items-center justify-between px-2 py-0.5 rounded border transition-all ${
                      showTimeline
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/60 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                        : 'bg-black/70 text-neutral-500 border-neutral-800 hover:text-neutral-300'
                    }`}
                    title="Afficher ou masquer la barre temporelle sur la vidéo"
                  >
                    <span className="flex items-center gap-1 font-bold">
                      <Clock size={10} className={showTimeline ? 'text-amber-400' : 'text-neutral-500'} />
                      TIMELINE
                    </span>
                    <span className={showTimeline ? 'text-amber-400 font-bold' : 'text-neutral-500'}>
                      {showTimeline ? 'ON (AUTO)' : 'OFF'}
                    </span>
                  </button>
                )}

                {/* Pitch Lock Button */}
                <button
                  type="button"
                  onClick={() => onUpdateAudio({ pitchLock: !audioParams.pitchLock })}
                  className={`flex items-center justify-between px-2 py-0.5 rounded border transition-all ${
                    audioParams.pitchLock
                      ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                      : 'bg-black/70 text-neutral-400 border-neutral-800 hover:text-white hover:border-neutral-700'
                  }`}
                  title="Activer la préservation de la tonalité ou le détunage analogique"
                >
                  <span className="font-bold flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${audioParams.pitchLock ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                    PITCH
                  </span>
                  <span className={audioParams.pitchLock ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    {audioParams.pitchLock ? 'LOCKED' : 'DETUNE'}
                  </span>
                </button>

                {/* Mute Button */}
                <button
                  onClick={() => onUpdateAudio({ isMuted: !audioParams.isMuted })}
                  className={`py-0.5 px-2 rounded font-mono text-[10px] font-bold flex items-center justify-center gap-1 border transition-all ${
                    audioParams.isMuted
                      ? 'bg-rose-600 text-white border-rose-400'
                      : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700'
                  }`}
                >
                  {audioParams.isMuted ? <VolumeX size={11} /> : <Volume2 size={11} />}
                  <span>{audioParams.isMuted ? 'MUTED' : 'MUTE'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SAVE / EXPORT / IMPORT PATCH MODAL */}
      {showSaveModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 font-mono text-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSaveModal(false);
          }}
        >
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl p-5 max-w-md w-full flex flex-col gap-4 text-neutral-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
              <span className="font-bold text-amber-400 flex items-center gap-2 text-sm">
                <Save size={15} /> GESTION DU PATCH (PRESET)
              </span>
              <button 
                onClick={() => setShowSaveModal(false)}
                className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-800"
              >
                <X size={15} />
              </button>
            </div>

            {/* Save to LocalStorage Section */}
            <form onSubmit={handleSaveSubmit} className="flex flex-col gap-2">
              <label className="text-[11px] text-neutral-400">
                Sauvegarder les réglages actuels en Preset local :
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Ex: 1989 Sunset Mall"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  className="flex-1 bg-black border border-neutral-700 rounded px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!newPresetName.trim()}
                  className="px-3 py-1.5 rounded font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black transition-all"
                >
                  ENREGISTRER
                </button>
              </div>
            </form>

            {/* Quick Share: Copy JSON */}
            <div className="border-t border-neutral-800 pt-3 flex items-center justify-between">
              <span className="text-[11px] text-neutral-400">Partager le patch :</span>
              <button
                type="button"
                onClick={handleCopyCurrentJson}
                className={`px-3 py-1 rounded border flex items-center gap-1.5 font-bold transition-all ${
                  copySuccess
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border-neutral-600'
                }`}
              >
                {copySuccess ? <Check size={12} /> : <Copy size={12} />}
                <span>{copySuccess ? 'COPIÉ DANS LE PRESSE-PAPIER !' : 'COPIER JSON'}</span>
              </button>
            </div>

            {/* Import JSON Section */}
            <div className="border-t border-neutral-800 pt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowImportArea(!showImportArea)}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 font-bold text-left"
              >
                <FileDown size={12} />
                <span>{showImportArea ? 'Masquer l’importateur JSON' : 'Importer un patch depuis un code JSON'}</span>
              </button>

              {showImportArea && (
                <div className="flex flex-col gap-2 mt-1">
                  <textarea
                    rows={4}
                    placeholder="Collez ici le JSON de votre preset..."
                    value={importJsonText}
                    onChange={(e) => setImportJsonText(e.target.value)}
                    className="w-full bg-black border border-neutral-700 rounded p-2 text-[10px] font-mono text-cyan-300 focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={handleImportSubmit}
                    disabled={!importJsonText.trim()}
                    className="self-end px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold transition-all text-[11px]"
                  >
                    CHARGER LE PATCH
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
