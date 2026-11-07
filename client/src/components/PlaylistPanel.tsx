import React, { useState, useEffect } from 'react';
import { PlaylistItem } from '../types/index.js';
import {
  ListMusic,
  Plus,
  Play,
  Disc3,
  Clock,
  AlertCircle,
  RefreshCw,
  X,
  Trash2,
  Search,
  FolderOpen,
  HardDrive,
  DownloadCloud,
  Cookie
} from 'lucide-react';

interface PlaylistPanelProps {
  isOpen: boolean;
  onClose: () => void;
  items: PlaylistItem[];
  currentIndex: number;
  playlistTitle?: string;
  isLoading: boolean;
  error?: string | null;
  cachedIds?: string[];
  activeDownloads?: string[];
  cacheSizeMb?: number;
  onSelectTrack: (index: number) => void;
  onLoadUrl: (url: string) => void;
  onRemoveTrack?: (index: number) => void;
  onAddItems?: (items: PlaylistItem[], playFirst?: boolean) => void;
  onPrefetchTrack?: (id: string) => void;
  onPrefetchAll?: () => void;
  onClearCache?: () => void;
}

export const PlaylistPanel: React.FC<PlaylistPanelProps> = ({
  isOpen,
  onClose,
  items,
  currentIndex,
  isLoading,
  error,
  cachedIds = [],
  activeDownloads = [],
  cacheSizeMb = 0,
  onSelectTrack,
  onLoadUrl,
  onRemoveTrack,
  onAddItems,
  onPrefetchTrack,
  onPrefetchAll,
  onClearCache
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'search' | 'folder'>('queue');
  const [inputUrl, setInputUrl] = useState('');

  // YouTube Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaylistItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Local Folder Scanner State
  const [folderPathInput, setFolderPathInput] = useState('');
  const [scannedFolder, setScannedFolder] = useState<string>('');
  const [folderItems, setFolderItems] = useState<PlaylistItem[]>([]);
  const [folderShortcuts, setFolderShortcuts] = useState<{ label: string; path: string }[]>([]);
  const [isScanningFolder, setIsScanningFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  // Browser Cookies State (--cookies-from-browser)
  const [selectedBrowser, setSelectedBrowser] = useState<string>('none');

  useEffect(() => {
    if (isOpen && activeTab === 'folder' && folderShortcuts.length === 0) {
      handleScanFolder('');
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const cachedSet = new Set(cachedIds);
  const downloadingSet = new Set(activeDownloads);

  const handleSubmitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputUrl.trim()) {
      onLoadUrl(inputUrl.trim());
      setInputUrl('');
    }
  };

  const handleSearchYouTube = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const q = (customQuery ?? searchQuery).trim();
    if (!q) return;

    setIsSearching(true);
    setSearchError(null);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, limit: 10 })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la recherche YouTube');
      }
      setSearchResults(data.items || []);
    } catch (err: any) {
      setSearchError(err.message || 'Échec de la recherche YouTube.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleScanFolder = async (targetPath?: string) => {
    setIsScanningFolder(true);
    setFolderError(null);
    try {
      const res = await fetch('/api/library/scan-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: targetPath ?? folderPathInput })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Impossible de lire ce dossier.');
      }
      setScannedFolder(data.folderPath || '');
      setFolderPathInput(data.folderPath || '');
      setFolderItems(data.items || []);
      if (data.shortcuts) setFolderShortcuts(data.shortcuts);
    } catch (err: any) {
      setFolderError(err.message || 'Erreur lors du scan du dossier local.');
    } finally {
      setIsScanningFolder(false);
    }
  };

  const handleBrowserCookiesChange = async (browser: string) => {
    setSelectedBrowser(browser);
    try {
      await fetch('/api/yt-auth/browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ browser: browser === 'none' ? null : browser })
      });
    } catch {}
  };

  const formatDuration = (sec: number) => {
    if (!sec || isNaN(sec)) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const quickDemos = [
    {
      label: 'Ambient / Experimental Tape',
      url: 'https://www.youtube.com/watch?v=4RCrvRXUrs4&list=PLqftF03PwhxzYiafvN4C1AzQtDuPeeYqw'
    },
    { label: 'Synthwave Cassette', url: 'https://www.youtube.com/watch?v=4xDzrJKXOOY' },
    { label: 'Vaporwave Mall', url: 'https://www.youtube.com/watch?v=aQkPcPqTFL4' }
  ];

  const searchSuggestions = [
    '80s Kmart VHS Commercials',
    'Vaporwave Mallsoft Tape',
    'Sega Saturn Jungle OST',
    'Boards of Canada VHS'
  ];

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-neutral-950/95 backdrop-blur-md border-l border-neutral-800 shadow-2xl flex flex-col transition-all">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900/60">
        <div className="flex items-center gap-2">
          <ListMusic size={18} className="text-amber-500" />
          <h2 className="font-display font-bold text-sm tracking-wider text-neutral-100">
            STUDIO LIBRARY &amp; YOUTUBE ({items.length})
          </h2>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
          title="Fermer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Navigation Tabs: QUEUE | YT SEARCH | PC FOLDER */}
      <div className="grid grid-cols-3 gap-1 p-2 bg-black/60 border-b border-neutral-800 font-mono text-[10px]">
        <button
          type="button"
          onClick={() => setActiveTab('queue')}
          className={`py-1.5 px-2 rounded font-bold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'queue'
              ? 'bg-amber-500 text-black shadow-[0_0_8px_rgba(255,157,0,0.4)]'
              : 'bg-neutral-900 text-neutral-400 hover:text-white'
          }`}
        >
          <ListMusic size={12} />
          <span>FILE ({items.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('search')}
          className={`py-1.5 px-2 rounded font-bold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'search'
              ? 'bg-cyan-500 text-black shadow-[0_0_8px_rgba(6,182,212,0.4)]'
              : 'bg-neutral-900 text-neutral-400 hover:text-cyan-300'
          }`}
        >
          <Search size={12} />
          <span>RECHERCHE YT</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('folder')}
          className={`py-1.5 px-2 rounded font-bold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'folder'
              ? 'bg-emerald-500 text-black shadow-[0_0_8px_rgba(16,185,129,0.4)]'
              : 'bg-neutral-900 text-neutral-400 hover:text-emerald-300'
          }`}
        >
          <FolderOpen size={12} />
          <span>DOSSIER PC</span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: PLAYLIST QUEUE + URL INPUT + LOCAL DISK CACHE BAR              */}
      {/* ===================================================================== */}
      {activeTab === 'queue' && (
        <>
          <div className="p-3.5 border-b border-neutral-800/80 bg-neutral-900/30 space-y-2.5">
            <form onSubmit={handleSubmitUrl} className="flex gap-2">
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
              <div className="p-2 bg-red-950/60 border border-red-800 rounded flex items-start gap-2 text-[11px] font-mono text-red-300">
                <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                <span className="break-all">{error}</span>
              </div>
            )}

            {/* Quick Demo links */}
            <div className="flex items-center gap-1.5 flex-wrap">
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

            {/* Desktop Local Disk Cache Status & Browser Cookie Selector */}
            <div className="pt-2 border-t border-neutral-800/80 flex flex-col gap-1.5 font-mono text-[10px]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <HardDrive size={12} />
                  <span>
                    CACHE DISQUE : <strong>{cachedIds.length} pistes</strong> ({cacheSizeMb} MB)
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {onPrefetchAll && items.length > 0 && (
                    <button
                      type="button"
                      onClick={onPrefetchAll}
                      className="px-2 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/80 flex items-center gap-1 font-bold transition-colors"
                      title="Télécharger les prochaines pistes sur le disque local (Seek instantané & 1080p)"
                    >
                      <DownloadCloud size={11} />
                      <span>PRÉ-CACHER</span>
                    </button>
                  )}
                  {onClearCache && cachedIds.length > 0 && (
                    <button
                      type="button"
                      onClick={onClearCache}
                      className="px-1.5 py-0.5 rounded bg-neutral-900 hover:bg-rose-950 text-neutral-400 hover:text-rose-300 border border-neutral-800 transition-colors"
                      title="Vider le cache disque"
                    >
                      VIDER
                    </button>
                  )}
                </div>
              </div>

              {/* Optional Browser Cookies Auto-Extractor */}
              <div className="flex items-center justify-between text-neutral-400 pt-1">
                <span
                  className="flex items-center gap-1 text-[9px]"
                  title="Sur Windows, Chrome/Edge/Brave verrouillent leurs cookies avec DPAPI v127+. Le mode direct (Désactivé) ou Firefox fonctionne sans erreur."
                >
                  <Cookie size={10} className="text-amber-400" />
                  MODE EXTRACTION YT-DLP :
                </span>
                <select
                  value={selectedBrowser}
                  onChange={(e) => handleBrowserCookiesChange(e.target.value)}
                  className="bg-black border border-neutral-700 rounded px-1.5 py-0.5 text-[9px] text-amber-300 focus:outline-none focus:border-amber-500"
                >
                  <option value="none">Direct (Recommandé — Sans Cookies)</option>
                  <option value="firefox">Cookies Mozilla Firefox (18+)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Playlist Items List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-neutral-600 font-mono text-xs">
                <Disc3 size={32} className="mb-2 animate-spin-slow opacity-40" />
                <span>AUCUNE VIDÉO DANS LA FILE</span>
                <span className="text-[10px] mt-1 text-neutral-500">
                  Ajoutez un lien, cherchez sur YouTube ou scannez un dossier PC
                </span>
              </div>
            ) : (
              items.map((item, idx) => {
                const isActive = idx === currentIndex;
                const isCached = item.isLocal || cachedSet.has(item.id);
                const isDownloading = downloadingSet.has(item.id);

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
                        <span
                          className={`text-xs font-mono font-medium truncate ${
                            isActive ? 'text-amber-300 font-bold' : 'text-neutral-200'
                          }`}
                        >
                          {item.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-400 mt-1 flex-wrap">
                        {item.author && (
                          <span className="truncate max-w-[110px]">{item.author}</span>
                        )}
                        {item.duration > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Clock size={10} />
                            {formatDuration(item.duration)}
                          </span>
                        )}
                        {isCached ? (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-700/70 text-[8px] font-bold">
                            ⚡ DISK
                          </span>
                        ) : isDownloading ? (
                          <span className="px-1.5 py-0.2 rounded bg-cyan-950/90 text-cyan-300 border border-cyan-700/70 text-[8px] font-bold animate-pulse">
                            ⬇ CACHE...
                          </span>
                        ) : (
                          onPrefetchTrack && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onPrefetchTrack(item.id);
                              }}
                              className="px-1.5 py-0.2 rounded bg-neutral-800 hover:bg-emerald-900 text-neutral-400 hover:text-emerald-200 text-[8px] transition-colors"
                              title="Mettre en cache disque local"
                            >
                              + CACHE
                            </button>
                          )
                        )}
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
        </>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: BUILT-IN YOUTUBE SEARCH                                        */}
      {/* ===================================================================== */}
      {activeTab === 'search' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-3.5 border-b border-neutral-800 bg-neutral-900/30 space-y-2.5">
            <form onSubmit={(e) => handleSearchYouTube(e)} className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher sur YouTube (ex: VHS Commercial 1992)..."
                disabled={isSearching}
                autoFocus
                className="flex-1 bg-black/80 border border-neutral-700 focus:border-cyan-400 rounded px-3 py-1.5 text-xs font-mono text-neutral-200 placeholder:text-neutral-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isSearching || !searchQuery.trim()}
                className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-neutral-800 disabled:text-neutral-600 text-black font-mono font-bold text-xs rounded flex items-center gap-1.5 transition-all"
              >
                {isSearching ? (
                  <RefreshCw size={13} className="animate-spin" />
                ) : (
                  <Search size={13} />
                )}
                <span>{isSearching ? '...' : 'GO'}</span>
              </button>
            </form>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-mono text-neutral-500">IDÉES :</span>
              {searchSuggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => {
                    setSearchQuery(sug);
                    handleSearchYouTube(undefined, sug);
                  }}
                  className="text-[9px] font-mono bg-neutral-800 hover:bg-neutral-700 text-cyan-300 px-2 py-0.5 rounded border border-neutral-700 transition-colors"
                >
                  {sug}
                </button>
              ))}
            </div>

            {searchError && (
              <div className="p-2 bg-red-950/60 border border-red-800 rounded text-[11px] font-mono text-red-300">
                {searchError}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {isSearching ? (
              <div className="flex flex-col items-center justify-center h-48 text-cyan-400 font-mono text-xs gap-2">
                <RefreshCw size={24} className="animate-spin" />
                <span>RECHERCHE YOUTUBE VIA YT-DLP LOCAL...</span>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-neutral-600 font-mono text-xs text-center px-4">
                <Search size={28} className="mb-2 opacity-40" />
                <span>RECHERCHE YOUTUBE DIRECTE</span>
                <span className="text-[10px] mt-1 text-neutral-500">
                  Tapez un artiste, un titre ou une ambiance VHS sans quitter le studio
                </span>
              </div>
            ) : (
              searchResults.map((item) => (
                <div
                  key={item.id}
                  className="p-2 rounded-lg bg-black/60 border border-neutral-800 hover:border-cyan-500/60 flex items-center gap-3 transition-all"
                >
                  <div className="relative w-16 h-11 rounded bg-neutral-900 overflow-hidden shrink-0 border border-neutral-800">
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono text-neutral-200 font-bold truncate">
                      {item.title}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-400 mt-0.5">
                      {item.author && <span className="truncate max-w-[120px]">{item.author}</span>}
                      {item.duration > 0 && <span>{formatDuration(item.duration)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 font-mono text-[10px]">
                    <button
                      type="button"
                      onClick={() => {
                        if (onAddItems) {
                          onAddItems([item], true);
                          setActiveTab('queue');
                        }
                      }}
                      className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold flex items-center gap-1"
                      title="Jouer immédiatement"
                    >
                      <Play size={10} fill="black" />
                      <span>JOUER</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddItems && onAddItems([item], false)}
                      className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-cyan-300 border border-neutral-700 font-bold"
                      title="Ajouter à la file d'attente"
                    >
                      + FILE
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: LOCAL PC FOLDER SCANNER                                        */}
      {/* ===================================================================== */}
      {activeTab === 'folder' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-3.5 border-b border-neutral-800 bg-neutral-900/30 space-y-2.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleScanFolder(folderPathInput);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={folderPathInput}
                onChange={(e) => setFolderPathInput(e.target.value)}
                placeholder="Chemin du dossier PC (ex: C:\Users\...\Videos)"
                className="flex-1 bg-black/80 border border-neutral-700 focus:border-emerald-400 rounded px-3 py-1.5 text-xs font-mono text-neutral-200 placeholder:text-neutral-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isScanningFolder}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-mono font-bold text-xs rounded flex items-center gap-1"
              >
                <FolderOpen size={13} />
                <span>SCAN</span>
              </button>
            </form>

            {folderShortcuts.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] font-mono text-neutral-500">RACCOURCIS PC :</span>
                {folderShortcuts.map((sc) => (
                  <button
                    key={sc.label}
                    type="button"
                    onClick={() => handleScanFolder(sc.path)}
                    className="text-[9px] font-mono bg-neutral-800 hover:bg-neutral-700 text-emerald-300 px-2 py-0.5 rounded border border-neutral-700 transition-colors"
                  >
                    📁 {sc.label}
                  </button>
                ))}
              </div>
            )}

            {folderItems.length > 0 && onAddItems && (
              <div className="flex items-center justify-between pt-1 border-t border-neutral-800/80 font-mono text-[10px]">
                <span className="text-neutral-400 truncate max-w-[210px]" title={scannedFolder}>
                  {folderItems.length} fichiers trouvés
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onAddItems(folderItems, false);
                    setActiveTab('queue');
                  }}
                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  + TOUT AJOUTER À LA FILE ({folderItems.length})
                </button>
              </div>
            )}

            {folderError && (
              <div className="p-2 bg-red-950/60 border border-red-800 rounded text-[11px] font-mono text-red-300">
                {folderError}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {folderItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-neutral-600 font-mono text-xs text-center px-4">
                <FolderOpen size={28} className="mb-2 opacity-40" />
                <span>AUCUN MÉDIA TROUVÉ DANS CE DOSSIER</span>
                <span className="text-[10px] mt-1 text-neutral-500">
                  Formats supportés : .MP4, .MKV, .WEBM, .MOV, .MP3, .WAV, .FLAC, .OGG
                </span>
              </div>
            ) : (
              folderItems.map((item) => (
                <div
                  key={item.id}
                  className="p-2 rounded-lg bg-black/60 border border-neutral-800 hover:border-emerald-500/60 flex items-center justify-between gap-2 transition-all font-mono"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-neutral-200 font-bold truncate">{item.title}</div>
                    <div className="text-[10px] text-emerald-400/80 truncate">{item.author}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 text-[10px]">
                    <button
                      type="button"
                      onClick={() => {
                        if (onAddItems) {
                          onAddItems([item], true);
                          setActiveTab('queue');
                        }
                      }}
                      className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold flex items-center gap-1"
                    >
                      <Play size={10} fill="black" />
                      <span>JOUER</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddItems && onAddItems([item], false)}
                      className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-emerald-300 border border-neutral-700 font-bold"
                    >
                      + FILE
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
