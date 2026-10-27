import React, { useState, useEffect, useRef } from 'react';
import { PlaylistItem } from '../types/index.js';
import { ListMusic, Plus, Play, Disc3, Clock, AlertCircle, RefreshCw, X, Trash2, KeyRound, Upload, CheckCircle2 } from 'lucide-react';

interface PlaylistPanelProps {
  isOpen: boolean;
  onClose: () => void;
  items: PlaylistItem[];
  currentIndex: number;
  playlistTitle?: string;
  isLoading: boolean;
  error?: string | null;
  onSelectTrack: (index: number) => void;
  onLoadUrl: (url: string) => void;
  onRemoveTrack?: (index: number) => void;
}

export const PlaylistPanel: React.FC<PlaylistPanelProps> = ({
  isOpen,
  onClose,
  items,
  currentIndex,
  isLoading,
  error,
  onSelectTrack,
  onLoadUrl,
  onRemoveTrack
}) => {
  const [inputUrl, setInputUrl] = useState('');
  const [showAuthBox, setShowAuthBox] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authSource, setAuthSource] = useState<'env' | 'ui' | 'none'>('none');
  const [cookiesInput, setCookiesInput] = useState('');
  const [poTokenInput, setPoTokenInput] = useState('');
  const [authSaving, setAuthSaving] = useState(false);
  const [authFeedback, setAuthFeedback] = useState<string | null>(null);
  const cookieFileRef = useRef<HTMLInputElement | null>(null);

  // Fetch current optional YouTube/Google auth status when panel opens
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/yt-auth')
      .then((r) => r.json())
      .then((data) => {
        setAuthEnabled(Boolean(data?.enabled));
        setAuthSource(data?.source || 'none');
      })
      .catch(() => {});
  }, [isOpen]);

  // Auto-open the optional Google/YouTube auth panel if YouTube blocks the cloud IP
  useEffect(() => {
    if (error && (error.includes('not a bot') || error.includes('cookies') || error.includes('Sign in'))) {
      setShowAuthBox(true);
    }
  }, [error]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputUrl.trim()) {
      onLoadUrl(inputUrl.trim());
      setInputUrl('');
    }
  };

  const handleSaveAuth = async (customCookies?: string) => {
    const cookiesToUse = customCookies !== undefined ? customCookies : cookiesInput;
    if (!cookiesToUse.trim() && !poTokenInput.trim()) return;

    setAuthSaving(true);
    setAuthFeedback(null);
    try {
      const res = await fetch('/api/yt-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cookies: cookiesToUse.trim(),
          poToken: poTokenInput.trim()
        })
      });
      const data = await res.json();
      if (res.ok && data?.status?.enabled) {
        setAuthEnabled(true);
        setAuthSource(data.status.source || 'ui');
        setAuthFeedback('Session Google / YouTube activée ! Relancez votre lien vidéo.');
        try {
          localStorage.setItem(
            'ytb_circuitbend_yt_auth',
            JSON.stringify({ cookies: cookiesToUse.trim(), poToken: poTokenInput.trim() })
          );
        } catch {}
      } else {
        setAuthFeedback(data?.error || 'Erreur lors de l’activation.');
      }
    } catch (err: any) {
      setAuthFeedback(err?.message || 'Erreur réseau.');
    } finally {
      setAuthSaving(false);
    }
  };

  const handleClearAuth = async () => {
    setAuthSaving(true);
    setAuthFeedback(null);
    try {
      await fetch('/api/yt-auth', { method: 'DELETE' });
      setAuthEnabled(false);
      setAuthSource('none');
      setCookiesInput('');
      setPoTokenInput('');
      try {
        localStorage.removeItem('ytb_circuitbend_yt_auth');
      } catch {}
      setAuthFeedback('Session désactivée (mode sans compte actif).');
    } catch {} finally {
      setAuthSaving(false);
    }
  };

  const handleCookieFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      setCookiesInput(text);
      handleSaveAuth(text);
    };
    reader.readAsText(file);
  };

  const formatDuration = (sec: number) => {
    if (!sec || isNaN(sec)) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const quickDemos = [
    { label: 'Ambient / Experimental Tape', url: 'https://www.youtube.com/watch?v=4RCrvRXUrs4&list=PLqftF03PwhxzYiafvN4C1AzQtDuPeeYqw' },
    { label: 'Synthwave Cassette', url: 'https://www.youtube.com/watch?v=4xDzrJKXOOY' },
    { label: 'Vaporwave Mall', url: 'https://www.youtube.com/watch?v=aQkPcPqTFL4' }
  ];

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-neutral-950/95 backdrop-blur-md border-l border-neutral-800 shadow-2xl flex flex-col transition-all">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-900/60">
        <div className="flex items-center gap-2">
          <ListMusic size={18} className="text-amber-500" />
          <h2 className="font-display font-bold text-sm tracking-wider text-neutral-100">
            PLAYLIST QUEUE ({items.length})
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAuthBox((prev) => !prev)}
            className={`px-2.5 py-1 rounded-md font-mono text-[10px] font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
              authEnabled
                ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                : showAuthBox
                ? 'bg-amber-500 text-black border-amber-400'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-neutral-700'
            }`}
            title="Connexion Google / YouTube optionnelle (pour contourner le blocage anti-bot sur Render)"
          >
            <KeyRound size={12} />
            <span>{authEnabled ? 'GOOGLE YT : CONNECTÉ' : 'CONNEXION GOOGLE / YT (OPTION)'}</span>
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
            title="Fermer"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Optional Google / YouTube Credentials Box (for Render Cloud IP Bot Bypass) */}
      {showAuthBox && (
        <div className="p-3.5 border-b border-amber-500/40 bg-[#12151e] font-mono text-xs space-y-2.5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
              <KeyRound size={13} />
              SESSION GOOGLE / YOUTUBE (OPTIONNEL)
            </span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
              authEnabled ? 'bg-emerald-950 text-emerald-300 border border-emerald-600' : 'bg-neutral-800 text-neutral-400'
            }`}>
              {authEnabled ? `ACTIF (${authSource.toUpperCase()})` : 'MODE SANS COMPTE'}
            </span>
          </div>

          <p className="text-[10px] text-neutral-400 leading-relaxed">
            En local, aucune connexion n'est nécessaire. Sur un serveur cloud (<strong>Render.com</strong>), YouTube bloque parfois les IP de datacenter (<em>"Sign in to confirm you're not a bot"</em>). Connectez votre session Google/YouTube via un fichier <code>cookies.txt</code> (extension <em>Get cookies.txt LOCALLY</em>) ou en collant votre cookie de session :
          </p>

          <div className="flex items-center gap-2">
            <input
              ref={cookieFileRef}
              type="file"
              accept=".txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCookieFileUpload(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => cookieFileRef.current?.click()}
              className="px-2.5 py-1.5 rounded bg-cyan-950/90 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/70 text-[10px] font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Upload size={12} />
              <span>IMPORTER FICHIER COOKIES.TXT</span>
            </button>

            {authEnabled && (
              <button
                type="button"
                onClick={handleClearAuth}
                disabled={authSaving}
                className="px-2.5 py-1.5 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-700 text-[10px] font-bold cursor-pointer"
              >
                DÉSACTIVER
              </button>
            )}
          </div>

          <textarea
            value={cookiesInput}
            onChange={(e) => setCookiesInput(e.target.value)}
            rows={3}
            placeholder="Ou collez ici le contenu de votre cookies.txt (ou la ligne Cookie: SID=...; __Secure-1PSID=... d'un onglet YouTube connecté à Google)..."
            className="w-full bg-black/80 border border-neutral-700 focus:border-amber-500 rounded p-2 text-[10px] text-neutral-200 placeholder:text-neutral-600 focus:outline-none"
          />

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={poTokenInput}
              onChange={(e) => setPoTokenInput(e.target.value)}
              placeholder="PO Token Google (Optionnel)"
              className="flex-1 bg-black/80 border border-neutral-700 focus:border-amber-500 rounded px-2 py-1 text-[10px] text-neutral-200 placeholder:text-neutral-600 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => handleSaveAuth()}
              disabled={authSaving || (!cookiesInput.trim() && !poTokenInput.trim())}
              className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-800 disabled:text-neutral-600 text-black font-bold text-[10px] cursor-pointer"
            >
              {authSaving ? 'ENREGISTREMENT...' : 'ACTIVER'}
            </button>
          </div>

          {authFeedback && (
            <div className="p-2 rounded bg-emerald-950/60 border border-emerald-700 text-emerald-300 text-[10px] flex items-center gap-1.5">
              <CheckCircle2 size={12} className="shrink-0" />
              <span>{authFeedback}</span>
            </div>
          )}
        </div>
      )}

      {/* URL Input Form */}
      <div className="p-4 border-b border-neutral-800/80 bg-neutral-900/30">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Coller un lien vidéo ou playlist YouTube..."
            disabled={isLoading}
            className="flex-1 bg-black/80 border border-neutral-700 focus:border-amber-500 rounded px-3 py-1.5 text-xs font-mono text-neutral-200 placeholder:text-neutral-600 focus:outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading || !inputUrl.trim()}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-800 disabled:text-neutral-600 text-black font-mono font-bold text-xs rounded flex items-center gap-1.5 transition-all shadow-[0_0_8px_rgba(255,157,0,0.3)]"
          >
            {isLoading ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
            <span>{isLoading ? 'AJOUT...' : 'AJOUTER'}</span>
          </button>
        </form>

        {error && (
          <div className="mt-2.5 p-2 bg-red-950/60 border border-red-800 rounded flex items-start gap-2 text-[11px] font-mono text-red-300">
            <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
            <span className="break-all">{error}</span>
          </div>
        )}

        {/* Quick Demo links */}
        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          <span className="text-[9px] font-mono text-neutral-500">EXEMPLES :</span>
          {quickDemos.map((demo) => (
            <button
              key={demo.label}
              type="button"
              onClick={() => onLoadUrl(demo.url)}
              className="text-[10px] font-mono bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-2 py-0.5 rounded border border-neutral-700 transition-colors"
            >
              {demo.label}
            </button>
          ))}
        </div>
      </div>

      {/* Playlist Items List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-neutral-600 font-mono text-xs">
            <Disc3 size={32} className="mb-2 animate-spin-slow opacity-40" />
            <span>AUCUNE VIDÉO DANS LA FILE</span>
            <span className="text-[10px] mt-1 text-neutral-500">Ajoutez un lien YouTube ci-dessus</span>
          </div>
        ) : (
          items.map((item, idx) => {
            const isActive = idx === currentIndex;
            return (
              <div
                key={`${item.id}-${idx}`}
                onClick={() => onSelectTrack(idx)}
                className={`p-2.5 rounded-lg flex items-center gap-3 cursor-pointer transition-all border group ${
                  isActive
                    ? 'bg-amber-500/15 border-amber-500/70 shadow-[0_0_12px_rgba(255,157,0,0.2)]'
                    : 'bg-black/50 border-neutral-800/80 hover:bg-neutral-800/60 hover:border-neutral-700'
                }`}
              >
                {/* Thumbnail */}
                <div className="relative w-16 h-11 rounded bg-neutral-900 overflow-hidden shrink-0 border border-neutral-800">
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {isActive && (
                    <div className="absolute inset-0 bg-amber-500/30 flex items-center justify-center">
                      <Play size={14} fill="white" className="text-white" />
                    </div>
                  )}
                </div>

                {/* Track Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0"></span>
                    )}
                    <span className={`text-xs font-mono font-medium truncate ${isActive ? 'text-amber-300 font-bold' : 'text-neutral-200'}`}>
                      {item.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-400 mt-1">
                    {item.author && <span className="truncate max-w-[120px]">{item.author}</span>}
                    <span className="flex items-center gap-0.5">
                      <Clock size={10} />
                      {formatDuration(item.duration)}
                    </span>
                  </div>
                </div>

                {/* Remove button */}
                {onRemoveTrack && items.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveTrack(idx);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-red-400 transition-opacity"
                    title="Supprimer de la file"
                  >
                    <Trash2 size={13} />
                  </button>
                )}

                {/* Track index badge */}
                <div className="text-[10px] font-mono text-neutral-500">
                  #{(idx + 1).toString().padStart(2, '0')}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
