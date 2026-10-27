import React, { useState, useEffect } from 'react';
import { X, Radio, Sliders, RefreshCw, Sparkles, Volume2, Video, Zap } from 'lucide-react';
import { MidiEngine, LAUNCH_CONTROL_PROFILE } from '../midi/MidiEngine.js';
import { MidiActivityEvent, MIDI_TARGET_CATALOG, MidiTarget } from '../midi/midiTypes.js';

interface MidiModalProps {
  isOpen: boolean;
  onClose: () => void;
  midiEngine: MidiEngine | null;
}

export const MidiModal: React.FC<MidiModalProps> = ({ isOpen, onClose, midiEngine }) => {
  const [lastActivity, setLastActivity] = useState<MidiActivityEvent | null>(null);
  const [learningTarget, setLearningTarget] = useState<MidiTarget | null>(null);
  const [bindings, setBindings] = useState<{ cc: Record<number, MidiTarget>; notes: Record<number, MidiTarget> }>({
    cc: { ...LAUNCH_CONTROL_PROFILE.ccMap },
    notes: { ...LAUNCH_CONTROL_PROFILE.noteMap }
  });
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'video' | 'audio' | 'action'>('all');
  const [isConnected, setIsConnected] = useState<boolean>(midiEngine ? midiEngine.getIsConnected() : false);
  const [deviceName, setDeviceName] = useState<string>(midiEngine ? midiEngine.getDeviceName() : 'No Device');
  const [midiError, setMidiError] = useState<string | null>(midiEngine ? midiEngine.getLastError() : null);

  useEffect(() => {
    if (!midiEngine) return;

    const refreshBindings = () => {
      setBindings(midiEngine.getAllBindings());
      setIsConnected(midiEngine.getIsConnected());
      setDeviceName(midiEngine.getDeviceName());
      setMidiError(midiEngine.getLastError());
    };
    refreshBindings();

    midiEngine.onStateChange((connected, name) => {
      setIsConnected(connected);
      setDeviceName(name);
      setMidiError(midiEngine.getLastError());
    });

    midiEngine.onActivity((event) => {
      setLastActivity(event);
      refreshBindings();
      if (midiEngine.getLearnTarget() === null) {
        setLearningTarget(null);
      }
    });
  }, [midiEngine, isOpen]);

  if (!isOpen) return null;

  const handleRescanMidi = async () => {
    if (!midiEngine) return;
    const ok = await midiEngine.connect();
    setIsConnected(ok);
    setDeviceName(midiEngine.getDeviceName());
    setMidiError(midiEngine.getLastError());
  };

  const handleStartLearn = (target: MidiTarget) => {
    if (!midiEngine) return;
    if (learningTarget === target) {
      midiEngine.setLearnTarget(null);
      setLearningTarget(null);
    } else {
      midiEngine.setLearnTarget(target);
      setLearningTarget(target);
    }
  };

  const handleApplyProfile = (profileId: 'launch-control' | 'launch-control-xl' | 'generic') => {
    if (!midiEngine) return;
    midiEngine.resetToProfile(profileId);
    setBindings(midiEngine.getAllBindings());
  };

  const SHORT_TARGET_LABELS: Record<string, string> = {
    'video.glitchIntensity': 'H-GLITCH',
    'video.rgbShift': 'RGB SHIFT',
    'video.datamosh': 'DATAMOSH',
    'video.feedback': 'FEEDBACK',
    'video.colorBleed': 'COLOR BLEED',
    'video.vaporwaveTint': 'VAPOR TINT',
    'video.scanlines': 'SCANLINES',
    'video.crtCurvature': 'CRT CURVE',
    'video.apertureGrille': 'PHOSPHOR',
    'video.vhsHeadSwitching': 'HEAD SWITCH',
    'video.vHoldDrift': 'V-HOLD',
    'video.meshDisplacement': '3D RELIEF',
    'video.chromaSmear': 'CHROMA SMEAR',
    'video.luminance': 'LUMINANCE',
    'video.audioReact': 'SIDECHAIN',
    'video.noise': 'RF NOISE',
    'audio.drive': 'TAPE DRIVE',
    'audio.bitcrush': 'BITCRUSH',
    'audio.filterCutoff': 'FILTER CUT',
    'audio.filterResonance': 'FILTER RES',
    'audio.tapeSpeed': 'TAPE SPEED',
    'audio.wowDepth': 'WOW DETUNE',
    'audio.flutterDepth': 'FLUTTER',
    'audio.reverbWet': 'MALL REVERB',
    'audio.tapeTone': 'TAPE TONE',
    'audio.tapeHiss': 'TAPE HISS',
    'audio.tapeDropouts': 'DROPOUTS',
    'audio.stutterSpeed': 'STUTTER SPD',
    'audio.ringModMix': 'RING MOD',
    'audio.ringModFreq': 'RING FREQ',
    'audio.masterVolume': 'MASTER VOL',
    'mod.morphAB': 'MORPH A↔B',
    'mod.macroX': 'PAD X',
    'mod.macroY': 'PAD Y',
    'mod.lfo1Rate': 'LFO 1 SPD',
    'mod.lfo2Rate': 'LFO 2 SPD',
    'mod.lfoDepth': 'LFO DEPTH',
    'action.playToggle': '▶ PLAY/PAUSE',
    'action.tapeFreeze': '❄ FREEZE',
    'action.randomize': '⚡ RANDOM',
    'action.resetClean': '↺ BYPASS',
    'action.snapshot': '📷 SNAP',
    'action.recordToggle': '● REC MP4',
    'action.tapTempo': '⏱ TAP BPM',
    'action.lfoToggle': '∿ LFO ON/OFF',
    'action.vcrOsdToggle': '📺 VCR OSD',
    'action.preset0': 'P1: BYPASS',
    'action.preset1': 'P2: MALL 84',
    'action.preset2': 'P3: VHS TAPE',
    'action.preset3': 'P4: NIGHTWAVE',
    'action.preset4': 'P5: 8-BIT',
    'action.nextTrack': '► PISTE SUIV',
    'action.prevTrack': '◄ PISTE PRÉC'
  };

  const handleAssignCcDirect = (cc: number, target: MidiTarget) => {
    if (!midiEngine) return;
    midiEngine.setBinding('cc', cc, target);
    setBindings(midiEngine.getAllBindings());
  };

  const handleAssignPadDirect = (padIndex: number, target: MidiTarget) => {
    if (!midiEngine) return;
    const ccNum = 73 + padIndex;
    const factoryNote1 = padIndex < 4 ? 9 + padIndex : 25 + (padIndex - 4);
    const userNote = 36 + padIndex;
    midiEngine.setBinding('cc', ccNum, target);
    midiEngine.setBinding('note', factoryNote1, target);
    midiEngine.setBinding('note', userNote, target);
    setBindings(midiEngine.getAllBindings());
  };

  // Find CC numbers mapped to a target
  const getMappedCodesForTarget = (targetId: MidiTarget): string[] => {
    const results: string[] = [];
    for (const [cc, tgt] of Object.entries(bindings.cc)) {
      if (tgt === targetId) results.push(`CC ${cc}`);
    }
    for (const [note, tgt] of Object.entries(bindings.notes)) {
      if (tgt === targetId) results.push(`Note ${note}`);
    }
    return results;
  };

  const filteredCatalog = MIDI_TARGET_CATALOG.filter(item => {
    if (selectedCategory === 'all') return true;
    return item.category === selectedCategory;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#12141a] border border-[#2a2f3a] shadow-[0_15px_40px_rgba(0,0,0,0.9)] rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-neutral-200 font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#242933] bg-[#161922]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-950/70 border border-cyan-700/60 text-cyan-400">
              <Sliders size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold font-mono text-white flex items-center gap-2">
                <span>CONFIGURATEUR WEB MIDI</span>
                <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-cyan-900/60 text-cyan-300 border border-cyan-700">
                  NOVATION & GENERIC
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                Affectation des commandes rotatives, faders et pads de votre contrôleur matériel
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Live Device & Activity Status Bar */}
        <div className="px-6 py-3 bg-[#0d0e12] border-b border-[#242933] flex flex-col gap-2 text-xs font-mono">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-neutral-400">Contrôleur :</span>
              <span className={`font-bold ${isConnected ? 'text-emerald-400' : 'text-rose-400'}`}>{deviceName}</span>
              <button
                type="button"
                onClick={handleRescanMidi}
                className="ml-2 px-2 py-0.5 rounded bg-cyan-950/90 hover:bg-cyan-900 text-cyan-300 border border-cyan-600/80 text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                title="Relancer la détection USB Web MIDI et demander l'autorisation au navigateur"
              >
                <RefreshCw size={10} />
                <span>RE-SCANNER USB MIDI</span>
              </button>
            </div>

            <div className="flex items-center gap-2 bg-[#171a22] px-3 py-1 rounded border border-[#2e3442]">
              <Radio size={12} className={lastActivity ? 'text-amber-400 animate-ping' : 'text-neutral-600'} />
              <span className="text-neutral-400">Signal reçu :</span>
              {lastActivity ? (
                <span className="text-amber-300 font-bold">
                  {lastActivity.type.toUpperCase()} #{lastActivity.paramNumber} (Val: {lastActivity.value})
                  {lastActivity.targetMapped && <span className="text-cyan-400 ml-1">→ {lastActivity.targetMapped}</span>}
                </span>
              ) : (
                <span className="text-neutral-500 italic">En attente d'un mouvement...</span>
              )}
            </div>
          </div>

          {!isConnected && (
            <div className="p-2 rounded bg-amber-950/50 border border-amber-600/60 text-amber-200 text-[10px] leading-relaxed">
              ⚠️ <strong>Si votre Launch Control n'est pas détecté sur le site déployé :</strong>
              <br />
              1. <strong>Sur Windows, le pilote USB MIDI est exclusif (mono-client)</strong> : fermez tout autre onglet ouvert sur <code>localhost:5173</code> ou tout logiciel audio (Ableton, Components) qui verrouille déjà le Launch Control, puis cliquez sur <strong>RE-SCANNER USB MIDI</strong>.
              <br />
              2. Vérifiez l'icône <strong>Cadenas / Paramètres de site</strong> à gauche de l'URL dans Chrome/Edge et autorisez <strong>Appareils MIDI</strong>.
              {midiError && <div className="text-rose-400 mt-1">Détail : {midiError}</div>}
            </div>
          )}
        </div>

        {/* Fast Profile Presets */}
        <div className="px-6 py-2.5 border-b border-[#242933] bg-[#141720] flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-mono text-neutral-400 font-bold uppercase tracking-wider">Presets d'usine :</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleApplyProfile('launch-control')}
              className="px-2.5 py-1 rounded font-mono text-[11px] bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/80 transition-colors flex items-center gap-1"
              title="Restaure le mapping optimisé du Launch Control (16 contrôles rotatifs + 8 pads + 4 flèches)"
            >
              <Sparkles size={11} />
              <span>Reset Launch Control (16 Contrôles + 8 Pads)</span>
            </button>

            <button
              onClick={() => handleApplyProfile('launch-control-xl')}
              className="px-2.5 py-1 rounded font-mono text-[11px] bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 transition-colors"
              title="Charge le mapping pour Launch Control XL (24 contrôles + 8 faders)"
            >
              <span>Launch Control XL</span>
            </button>

            <button
              onClick={() => handleApplyProfile('generic')}
              className="px-2.5 py-1 rounded font-mono text-[11px] bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 transition-colors"
              title="Mapping générique CC 1 à 8 et CC 16 à 23"
            >
              <span>Générique CC 1-8</span>
            </button>
          </div>
        </div>

        {/* Interactive Visual Novation Launch Control Hardware Map */}
        <div className="px-6 py-3 bg-[#0b0d12] border-b border-[#242933] font-mono">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
              🎛️ VUE MATÉRIELLE NOVATION LAUNCH CONTROL (Cliquez sur un contrôle pour changer sa cible)
            </span>
            <span className="text-[9px] text-neutral-500">
              Rangée 1 = Vidéo (CC 21-28) • Rangée 2 = Audio & Morph (CC 41-48) • Pads 1-8 • Flèches ▲▼◄►
            </span>
          </div>

          <div className="flex items-stretch gap-2.5">
            {/* Main 8-Column Grid (Row 1 Knobs, Row 2 Knobs, Row 3 Pads) */}
            <div className="flex-1 space-y-1.5">
              {/* Top Row: Knobs 1 to 8 (CC 21 to 28) */}
              <div className="grid grid-cols-8 gap-1">
                {[21, 22, 23, 24, 25, 26, 27, 28].map((cc, idx) => {
                  const target = bindings.cc[cc] || 'video.glitchIntensity';
                  const isActive = lastActivity?.type === 'cc' && lastActivity?.paramNumber === cc;
                  return (
                    <div
                      key={cc}
                      className={`p-1 rounded border flex flex-col items-center text-center transition-all ${
                        isActive
                          ? 'bg-purple-950/90 border-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.6)]'
                          : 'bg-[#141821] border-[#262c3a] hover:border-purple-500/60'
                      }`}
                    >
                      <span className="text-[8px] text-neutral-500">K{idx + 1} · CC{cc}</span>
                      <div className="w-4 h-4 my-0.5 rounded-full bg-black border border-purple-400/80 flex items-center justify-center">
                        <div className="w-1 h-1 rounded-full bg-purple-300" />
                      </div>
                      <select
                        value={target}
                        onChange={(e) => handleAssignCcDirect(cc, e.target.value as MidiTarget)}
                        className="w-full bg-transparent text-[8px] font-bold text-purple-300 text-center focus:outline-none cursor-pointer truncate"
                        title={`Knob ${idx + 1} (CC ${cc})`}
                      >
                        {MIDI_TARGET_CATALOG.filter((c) => c.category !== 'action').map((opt) => (
                          <option key={opt.id} value={opt.id} className="bg-[#12141a] text-neutral-200">
                            {SHORT_TARGET_LABELS[opt.id] || opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Row: Knobs 9 to 16 (CC 41 to 48) */}
              <div className="grid grid-cols-8 gap-1">
                {[41, 42, 43, 44, 45, 46, 47, 48].map((cc, idx) => {
                  const target = bindings.cc[cc] || 'audio.drive';
                  const isActive = lastActivity?.type === 'cc' && lastActivity?.paramNumber === cc;
                  return (
                    <div
                      key={cc}
                      className={`p-1 rounded border flex flex-col items-center text-center transition-all ${
                        isActive
                          ? 'bg-amber-950/90 border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.6)]'
                          : 'bg-[#141821] border-[#262c3a] hover:border-amber-500/60'
                      }`}
                    >
                      <span className="text-[8px] text-neutral-500">K{idx + 9} · CC{cc}</span>
                      <div className="w-4 h-4 my-0.5 rounded-full bg-black border border-amber-400/80 flex items-center justify-center">
                        <div className="w-1 h-1 rounded-full bg-amber-300" />
                      </div>
                      <select
                        value={target}
                        onChange={(e) => handleAssignCcDirect(cc, e.target.value as MidiTarget)}
                        className="w-full bg-transparent text-[8px] font-bold text-amber-300 text-center focus:outline-none cursor-pointer truncate"
                        title={`Knob ${idx + 9} (CC ${cc})`}
                      >
                        {MIDI_TARGET_CATALOG.filter((c) => c.category !== 'action').map((opt) => (
                          <option key={opt.id} value={opt.id} className="bg-[#12141a] text-neutral-200">
                            {SHORT_TARGET_LABELS[opt.id] || opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {/* Bottom 8 Pads (Pads 1 to 8) */}
              <div className="grid grid-cols-8 gap-1 pt-0.5">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((padIdx) => {
                  const cc = 73 + padIdx;
                  const note1 = padIdx < 4 ? 9 + padIdx : 25 + (padIdx - 4);
                  const noteUser = 36 + padIdx;
                  const target = bindings.notes[note1] || bindings.cc[cc] || 'action.playToggle';
                  const isActive =
                    (lastActivity?.type === 'cc' && lastActivity?.paramNumber === cc) ||
                    (lastActivity?.type === 'noteOn' &&
                      (lastActivity?.paramNumber === note1 || lastActivity?.paramNumber === noteUser));
                  return (
                    <div
                      key={padIdx}
                      className={`p-1 rounded border flex flex-col items-center justify-between transition-all ${
                        isActive
                          ? 'bg-emerald-950/90 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.7)]'
                          : 'bg-[#181c26] border-cyan-800/50 hover:border-cyan-400'
                      }`}
                    >
                      <span className="text-[7px] text-neutral-400 font-bold">PAD {padIdx + 1}</span>
                      <select
                        value={target}
                        onChange={(e) => handleAssignPadDirect(padIdx, e.target.value as MidiTarget)}
                        className="w-full bg-transparent text-[8px] font-bold text-cyan-300 text-center focus:outline-none cursor-pointer truncate mt-0.5"
                        title={`Pad ${padIdx + 1} (Note ${note1}/${noteUser} ou CC ${cc})`}
                      >
                        {MIDI_TARGET_CATALOG.filter((c) => c.category === 'action').map((opt) => (
                          <option key={opt.id} value={opt.id} className="bg-[#12141a] text-neutral-200">
                            {SHORT_TARGET_LABELS[opt.id] || opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: 4 Directional Arrow Buttons (CC 114, 115, 116, 117) */}
            <div className="w-24 flex flex-col justify-between gap-1 bg-[#12161f] border border-[#262c3a] rounded p-1.5">
              <span className="text-[7px] text-neutral-400 font-bold text-center uppercase">FLÈCHES DROITE</span>
              {[
                { cc: 114, icon: '▲', defaultTgt: 'action.tapTempo' as MidiTarget },
                { cc: 115, icon: '▼', defaultTgt: 'action.lfoToggle' as MidiTarget },
                { cc: 116, icon: '◄', defaultTgt: 'action.prevTrack' as MidiTarget },
                { cc: 117, icon: '►', defaultTgt: 'action.nextTrack' as MidiTarget }
              ].map(({ cc, icon, defaultTgt }) => {
                const target = bindings.cc[cc] || defaultTgt;
                const isActive = lastActivity?.type === 'cc' && lastActivity?.paramNumber === cc;
                return (
                  <div
                    key={cc}
                    className={`px-1 py-0.5 rounded border flex items-center gap-1 ${
                      isActive ? 'bg-amber-950 border-amber-400' : 'bg-black/60 border-neutral-800'
                    }`}
                  >
                    <span className="text-[9px] text-amber-400 font-bold">{icon}</span>
                    <select
                      value={target}
                      onChange={(e) => handleAssignCcDirect(cc, e.target.value as MidiTarget)}
                      className="w-full bg-transparent text-[7px] font-bold text-neutral-200 focus:outline-none cursor-pointer truncate"
                      title={`Bouton Flèche ${icon} (CC ${cc})`}
                    >
                      {MIDI_TARGET_CATALOG.filter((c) => c.category === 'action').map((opt) => (
                        <option key={opt.id} value={opt.id} className="bg-[#12141a] text-neutral-200">
                          {SHORT_TARGET_LABELS[opt.id] || opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="px-6 pt-3 flex items-center gap-2 border-b border-[#242933] bg-[#12141a]">
          {(['all', 'video', 'audio', 'action'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 font-mono text-xs font-bold rounded-t border-t border-x transition-colors ${
                selectedCategory === cat
                  ? 'bg-[#181c26] text-cyan-300 border-[#2a2f3a]'
                  : 'text-neutral-500 border-transparent hover:text-neutral-300'
              }`}
            >
              {cat === 'all' && 'Tous les paramètres'}
              {cat === 'video' && 'Vidéo Glitch'}
              {cat === 'audio' && 'Audio & Bandes'}
              {cat === 'action' && 'Actions & Pads'}
            </button>
          ))}
        </div>

        {/* Mapping Table */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2 bg-[#12141a]">
          {learningTarget && (
            <div className="p-3 mb-4 rounded-lg bg-cyan-950/90 border border-cyan-400 text-cyan-200 text-xs font-mono flex items-center justify-between animate-pulse">
              <div className="flex items-center gap-2">
                <RefreshCw size={14} className="animate-spin text-cyan-300" />
                <span>
                  <strong>MODE LEARN ACTIF :</strong> Actionnez une commande ou appuyez sur un pad pour assigner à : <strong>{learningTarget}</strong>
                </span>
              </div>
              <button
                onClick={() => handleStartLearn(learningTarget)}
                className="px-2 py-0.5 rounded bg-cyan-800 hover:bg-cyan-700 text-white font-bold text-[10px]"
              >
                Annuler
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filteredCatalog.map(item => {
              const mappedCodes = getMappedCodesForTarget(item.id);
              const isLearningThis = learningTarget === item.id;

              return (
                <div
                  key={item.id}
                  className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 transition-colors ${
                    isLearningThis
                      ? 'bg-cyan-950/60 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.4)]'
                      : mappedCodes.length > 0
                        ? 'bg-[#161a22] border-[#2c3342]'
                        : 'bg-[#12151c] border-[#1f242e] opacity-75'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    {item.category === 'video' && <Video size={14} className="text-purple-400 shrink-0" />}
                    {item.category === 'audio' && <Volume2 size={14} className="text-amber-400 shrink-0" />}
                    {item.category === 'action' && <Zap size={14} className="text-cyan-400 shrink-0" />}
                    
                    <div className="truncate">
                      <div className="text-xs font-bold text-neutral-200 truncate">{item.label}</div>
                      <div className="text-[10px] font-mono text-neutral-500 truncate">{item.id}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {mappedCodes.length > 0 ? (
                      <div className="flex gap-1 flex-wrap justify-end">
                        {mappedCodes.map(code => (
                          <span
                            key={code}
                            className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-700/80 shadow-[0_0_6px_rgba(6,182,212,0.3)]"
                          >
                            {code}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] font-mono text-neutral-600 italic">Non assigné</span>
                    )}

                    <button
                      onClick={() => handleStartLearn(item.id)}
                      className={`px-2 py-1 rounded font-mono text-[10px] font-bold transition-all border ${
                        isLearningThis
                          ? 'bg-cyan-400 text-black border-cyan-300 animate-pulse'
                          : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-neutral-600'
                      }`}
                      title="Cliquez puis tournez un bouton physique"
                    >
                      {isLearningThis ? 'LEARNING...' : 'LEARN'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#161922] border-t border-[#242933] flex items-center justify-between text-xs font-mono text-neutral-400">
          <div>
            Les réglages personnalisés sont automatiquement enregistrés sur votre navigateur.
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded font-bold bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_12px_rgba(6,182,212,0.4)] transition-transform hover:scale-105"
          >
            TERMINER
          </button>
        </div>

      </div>
    </div>
  );
};

