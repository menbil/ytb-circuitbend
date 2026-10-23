import React, { useState, useEffect } from 'react';
import { X, Radio, Sliders, RefreshCw, Check, Sparkles, Volume2, Video, Zap } from 'lucide-react';
import { MidiEngine } from '../midi/MidiEngine.js';
import { MidiActivityEvent, MIDI_TARGET_CATALOG, MidiTarget } from '../midi/midiTypes.js';

interface MidiModalProps {
  isOpen: boolean;
  onClose: () => void;
  midiEngine: MidiEngine | null;
}

export const MidiModal: React.FC<MidiModalProps> = ({ isOpen, onClose, midiEngine }) => {
  const [lastActivity, setLastActivity] = useState<MidiActivityEvent | null>(null);
  const [learningTarget, setLearningTarget] = useState<MidiTarget | null>(null);
  const [bindings, setBindings] = useState<{ cc: Record<number, MidiTarget>; notes: Record<number, MidiTarget> }>({ cc: {}, notes: {} });
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'video' | 'audio' | 'action'>('all');

  useEffect(() => {
    if (!midiEngine) return;

    const refreshBindings = () => {
      setBindings(midiEngine.getAllBindings());
    };
    refreshBindings();

    midiEngine.onActivity((event) => {
      setLastActivity(event);
      refreshBindings();
      if (midiEngine.getLearnTarget() === null) {
        setLearningTarget(null);
      }
    });
  }, [midiEngine]);

  if (!isOpen) return null;

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

  const isConnected = midiEngine ? midiEngine.getIsConnected() : false;
  const deviceName = midiEngine ? midiEngine.getDeviceName() : 'Aucun contrôleur';

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
      <div className="bg-[#12141a] border border-[#2a2f3a] shadow-[0_15px_40px_rgba(0,0,0,0.9)] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-neutral-200 font-sans">
        
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
                Affectation des potentiomètres, faders et pads de votre contrôleur matériel
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
        <div className="px-6 py-3 bg-[#0d0e12] border-b border-[#242933] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
            <span className="text-neutral-400">Contrôleur :</span>
            <span className={`font-bold ${isConnected ? 'text-emerald-400' : 'text-rose-400'}`}>{deviceName}</span>
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

        {/* Fast Profile Presets */}
        <div className="px-6 py-3 border-b border-[#242933] bg-[#141720] flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-mono text-neutral-400 font-bold uppercase tracking-wider">Presets d'usine :</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleApplyProfile('launch-control')}
              className="px-2.5 py-1 rounded font-mono text-[11px] bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/80 transition-colors flex items-center gap-1"
              title="Charge le mapping par défaut du Launch Control (16 potentiomètres CC 21-28 et CC 41-48 + 8 pads)"
            >
              <Sparkles size={11} />
              <span>Launch Control (16 Knobs)</span>
            </button>

            <button
              onClick={() => handleApplyProfile('launch-control-xl')}
              className="px-2.5 py-1 rounded font-mono text-[11px] bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 transition-colors"
              title="Charge le mapping pour Launch Control XL (24 potentiomètres + 8 faders)"
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
                  <strong>MODE LEARN ACTIF :</strong> Tournez un potentiomètre ou appuyez sur un pad pour assigner à : <strong>{learningTarget}</strong>
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

