import React, { useRef } from 'react';
import { Volume2, ListMusic, Video, Monitor, FolderOpen, Share2, Check } from 'lucide-react';
import { LiveInputSource } from '../types/index.js';

interface HeaderProps {
  audioContextState: string;
  onInitAudio: () => void;
  playlistCount: number;
  onTogglePlaylist: () => void;
  isPlaylistOpen: boolean;
  liveSource?: LiveInputSource;
  onSelectLiveSource?: (source: LiveInputSource) => void;
  onLoadLocalFile?: (file: File) => void;
  onShareUrl?: () => void;
  shareUrlCopied?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  audioContextState,
  onInitAudio,
  playlistCount,
  onTogglePlaylist,
  isPlaylistOpen,
  liveSource = 'youtube',
  onSelectLiveSource,
  onLoadLocalFile,
  onShareUrl,
  shareUrlCopied = false
}) => {
  const isAudioActive = audioContextState === 'running';
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <header className="w-full bg-rack-900 border-b border-neutral-800 px-4 py-2 shadow-xl relative z-30">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
        {/* Branding */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-black font-black text-lg shadow-[0_0_12px_rgba(255,157,0,0.4)] border border-amber-300">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-black text-base tracking-wider text-neutral-100 uppercase">
                CIRCUIT//BEND
              </h1>
              <span className="text-[9px] font-mono bg-neutral-800 text-amber-400 px-1.5 py-0.5 rounded border border-neutral-700 font-bold">
                TAPE & VAPORWAVE DSP
              </span>
            </div>
            <p className="text-[9px] font-mono text-neutral-500 hidden sm:block">
              REAL-TIME ANALOG GLITCH & MODULAR TAPE WARP STUDIO
            </p>
          </div>
        </div>

        {/* Center/Right Live Input Source Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          {onSelectLiveSource && (
            <div className="flex items-center bg-black/75 p-0.5 rounded-md border border-neutral-800 font-mono text-[10px]">
              <button
                type="button"
                onClick={() => onSelectLiveSource('youtube')}
                className={`px-2 py-1 rounded font-bold transition-all ${
                  liveSource === 'youtube'
                    ? 'bg-amber-500 text-black shadow-[0_0_8px_rgba(255,157,0,0.5)]'
                    : 'text-neutral-400 hover:text-white'
                }`}
                title="Flux YouTube / Playlist"
              >
                YT STREAM
              </button>
              <button
                type="button"
                onClick={() => onSelectLiveSource('webcam')}
                className={`px-2 py-1 rounded font-bold flex items-center gap-1 transition-all ${
                  liveSource === 'webcam'
                    ? 'bg-cyan-500 text-black shadow-[0_0_8px_rgba(6,182,212,0.6)]'
                    : 'text-neutral-400 hover:text-cyan-300'
                }`}
                title="Flux caméra en direct vers le moteur vidéo VHS/CRT"
              >
                <Video size={11} />
                <span>WEBCAM</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectLiveSource('screen')}
                className={`px-2 py-1 rounded font-bold flex items-center gap-1 transition-all ${
                  liveSource === 'screen'
                    ? 'bg-purple-500 text-white shadow-[0_0_8px_rgba(168,85,247,0.6)]'
                    : 'text-neutral-400 hover:text-purple-300'
                }`}
                title="Capture d'écran ou de fenêtre en temps réel"
              >
                <Monitor size={11} />
                <span>SCREEN</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`px-2 py-1 rounded font-bold flex items-center gap-1 transition-all ${
                  liveSource === 'local'
                    ? 'bg-emerald-500 text-black shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                    : 'text-neutral-400 hover:text-emerald-300'
                }`}
                title="Importer un média local (Vidéo, Audio ou Preset JSON)"
              >
                <FolderOpen size={11} />
                <span>MEDIA</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,audio/*,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && onLoadLocalFile) {
                    onLoadLocalFile(file);
                    e.target.value = '';
                  }
                }}
              />
            </div>
          )}

          {/* Share Patch URL Button */}
          {onShareUrl && (
            <button
              type="button"
              onClick={onShareUrl}
              className={`px-2.5 py-1 rounded font-mono text-[10px] font-bold flex items-center gap-1.5 border transition-all ${
                shareUrlCopied
                  ? 'bg-emerald-600 text-white border-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.6)]'
                  : 'bg-neutral-900 hover:bg-neutral-800 text-cyan-300 border-cyan-800/80'
              }`}
              title="Copier le lien direct contenant la configuration du patch (?patch=...)"
            >
              {shareUrlCopied ? <Check size={12} /> : <Share2 size={12} />}
              <span>{shareUrlCopied ? 'LIEN COPIÉ' : 'SHARE PATCH'}</span>
            </button>
          )}

          {/* LED Indicators */}
          <div className="hidden lg:flex items-center gap-2.5 bg-black/70 px-2.5 py-1 rounded border border-neutral-800 text-[10px] font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#00ff73]"></span>
              <span className="text-neutral-400">MAINS</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${
                isAudioActive ? 'bg-amber-400 shadow-[0_0_6px_#ff9d00]' : 'bg-rose-500 animate-ping'
              }`}></span>
              <span className={isAudioActive ? 'text-amber-400 font-bold' : 'text-rose-400'}>
                {audioContextState.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Audio Engine Enable button if suspended */}
          {!isAudioActive && (
            <button
              onClick={onInitAudio}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono font-bold rounded flex items-center gap-1.5 shadow-[0_0_10px_rgba(255,157,0,0.5)] animate-pulse"
            >
              <Volume2 size={13} />
              <span>ENABLE AUDIO</span>
            </button>
          )}

          {/* Floating Playlist Drawer Toggle Button */}
          <button
            onClick={onTogglePlaylist}
            className={`px-3 py-1.5 rounded-md font-mono text-xs font-bold flex items-center gap-2 border transition-all ${
              isPlaylistOpen
                ? 'bg-amber-500 text-black border-amber-400 shadow-[0_0_12px_rgba(255,157,0,0.4)]'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border-neutral-700'
            }`}
          >
            <ListMusic size={15} />
            <span>PLAYLIST</span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] ${
              isPlaylistOpen ? 'bg-black text-amber-400' : 'bg-neutral-700 text-neutral-300'
            }`}>
              {playlistCount}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
