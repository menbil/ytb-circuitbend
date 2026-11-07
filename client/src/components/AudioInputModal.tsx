import React, { useState, useEffect } from 'react';
import { Radio, MonitorSpeaker, Mic, X, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';

interface AudioInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectSystemLoopback: (keepCurrentVisual: boolean) => Promise<void>;
  onConnectMicOrLineIn: (deviceId?: string) => Promise<void>;
  activeMode?: string;
}

export const AudioInputModal: React.FC<AudioInputModalProps> = ({
  isOpen,
  onClose,
  onConnectSystemLoopback,
  onConnectMicOrLineIn,
  activeMode
}) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [keepVisual, setKeepVisual] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const refreshDevices = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const all = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = all.filter((d) => d.kind === 'audioinput');
      setDevices(audioInputs);
      if (audioInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(audioInputs[0].deviceId);
      }
    } catch {}
  };

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      refreshDevices();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLoopbackClick = async () => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      await onConnectSystemLoopback(keepVisual);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Capture du son système annulée.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMicClick = async () => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      await onConnectMicOrLineIn(selectedDeviceId || undefined);
      onClose();
    } catch (err: any) {
      const raw = err?.message || String(err);
      if (raw.toLowerCase().includes('permission') || raw.toLowerCase().includes('notallowed')) {
        setErrorMsg(
          'Accès Microphone refusé ("Permission denied"). Autorisez le Microphone via l’icône 🔒 à gauche de l’URL (localhost:5173) ET dans Paramètres Windows > Confidentialité > Microphone — ou utilisez le bouton "CAPTURER LE SON DU PC" ci-dessus qui fonctionne sans micro !'
        );
      } else {
        setErrorMsg(raw);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 font-mono text-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-neutral-950 border border-neutral-700 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-neutral-200">
        {/* Header */}
        <div className="px-5 py-3.5 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
            <Radio size={16} className="animate-pulse" />
            <span>MODE VISUALISEUR SPOTIFY &amp; VJ (AUDIO-RÉACTIF)</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white"
          >
            <X size={15} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* OPTION 1: SYSTEM LOOPBACK AUDIO (NO MIC PERMISSION NEEDED!) */}
          <div className="p-4 rounded-lg bg-gradient-to-br from-purple-950/50 to-neutral-900 border border-purple-500/60 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-purple-300 font-bold text-xs">
                <MonitorSpeaker size={16} className="text-purple-400 shrink-0" />
                <span>1. SYNCHRONISER SUR SPOTIFY / SON DU PC</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-600/70 text-[9px] font-bold shrink-0">
                VIDÉO 100% MUETTE
              </span>
            </div>

            <p className="text-[11px] text-neutral-300 leading-relaxed">
              Coupe automatiquement le son de la vidéo en cours pour éviter tout doublon, et utilise les basses/kicks de{' '}
              <strong className="text-amber-300">Spotify / Rekordbox / Ableton</strong> pour faire pulser la télé CRT 3D,
              les glitchs VHS et le modulateur <strong className="text-emerald-300">ENV AUDIO</strong> en rythme !
              <br />
              Dans la fenêtre qui s’ouvre, cochez bien{' '}
              <span className="underline text-purple-200 font-bold">« Partager l’audio du système »</span>.
            </p>

            <label className="flex items-center gap-2 cursor-pointer text-[11px] text-neutral-300 bg-black/50 px-3 py-1.5 rounded border border-neutral-800">
              <input
                type="checkbox"
                checked={keepVisual}
                onChange={(e) => setKeepVisual(e.target.checked)}
                className="accent-purple-500"
              />
              <span>
                Garder la vidéo YouTube/Locale actuelle à l’écran (en mode <strong>100% muet</strong>)
              </span>
            </label>

            <button
              type="button"
              disabled={isLoading}
              onClick={handleLoopbackClick}
              className="w-full py-2 px-4 rounded-md bg-purple-600 hover:bg-purple-500 text-white font-bold flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-all"
            >
              <MonitorSpeaker size={14} />
              <span>ACTIVER VISUALISEUR SUR LE SON DU PC (SPOTIFY)</span>
            </button>
          </div>

          {/* OPTION 2: SOUND CARD / LINE-IN / MICROPHONE */}
          <div className="p-4 rounded-lg bg-neutral-900/80 border border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-300 font-bold text-xs">
                <Mic size={15} className="text-rose-400 shrink-0" />
                <span>2. CARTE SON EXTERNE / LINE-IN / MICRO</span>
              </div>
              <button
                type="button"
                onClick={refreshDevices}
                className="text-[10px] text-neutral-400 hover:text-white flex items-center gap-1"
                title="Rafraîchir la liste des entrées audio"
              >
                <RefreshCw size={11} />
                <span>ACTUALISER</span>
              </button>
            </div>

            <div className="flex gap-2">
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="flex-1 bg-black border border-neutral-700 rounded px-2.5 py-1.5 text-[11px] text-neutral-200 focus:outline-none focus:border-rose-500"
              >
                {devices.length === 0 ? (
                  <option value="">Périphérique d’entrée par défaut</option>
                ) : (
                  devices.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Entrée Audio / Micro #${i + 1}`}
                    </option>
                  ))
                )}
              </select>

              <button
                type="button"
                disabled={isLoading}
                onClick={handleMicClick}
                className="px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1.5 shrink-0 transition-all"
              >
                <Mic size={13} />
                <span>ACTIVER ENTRÉE</span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-950/70 border border-red-700 text-red-200 flex items-start gap-2.5 text-[11px] leading-relaxed">
              <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <div>{errorMsg}</div>
            </div>
          )}

          {activeMode === 'systemAudio' && !errorMsg && (
            <div className="p-2.5 rounded bg-emerald-950/50 border border-emerald-700/70 text-emerald-300 flex items-center gap-2 text-[11px]">
              <CheckCircle2 size={14} />
              <span>Pont Audio Direct actuellement actif dans la chaîne DSP.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
