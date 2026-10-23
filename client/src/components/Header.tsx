import React from 'react';
import { Volume2, ListMusic } from 'lucide-react';

interface HeaderProps {
  audioContextState: string;
  onInitAudio: () => void;
  playlistCount: number;
  onTogglePlaylist: () => void;
  isPlaylistOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  audioContextState,
  onInitAudio,
  playlistCount,
  onTogglePlaylist,
  isPlaylistOpen
}) => {
  const isAudioActive = audioContextState === 'running';

  return (
    <header className="w-full bg-rack-900 border-b border-neutral-800 px-4 py-2.5 shadow-xl relative z-30">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
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
              REAL-TIME ANALOG GLITCH & TAPE CASSETTE WARP ENGINE
            </p>
          </div>
        </div>

        {/* Right Controls: Audio State, Playlist Toggle Button */}
        <div className="flex items-center gap-3">
          {/* LED Indicators */}
          <div className="hidden md:flex items-center gap-2.5 bg-black/70 px-2.5 py-1 rounded border border-neutral-800 text-[10px] font-mono">
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
