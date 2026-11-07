import fs from 'fs';
import path from 'path';
import os from 'os';
import { PlaylistItem } from './types.js';

export interface DesktopPaths {
  rootDir: string;
  cacheDir: string;
  exportsDir: string;
  mediaDir: string;
  presetsFile: string;
  playlistFile: string;
}

const SUPPORTED_MEDIA_EXTENSIONS = new Set([
  '.mp4',
  '.webm',
  '.mkv',
  '.mov',
  '.avi',
  '.m4v',
  '.mp3',
  '.wav',
  '.flac',
  '.ogg',
  '.m4a'
]);

export class LocalLibraryService {
  private paths: DesktopPaths;

  constructor(customRootDir?: string) {
    const baseDir =
      customRootDir ||
      process.env.CIRCUITBEND_DATA_DIR ||
      path.resolve(process.cwd(), 'data');

    this.paths = {
      rootDir: baseDir,
      cacheDir: path.join(baseDir, 'cache'),
      exportsDir: path.join(baseDir, 'exports'),
      mediaDir: path.join(baseDir, 'media'),
      presetsFile: path.join(baseDir, 'presets.json'),
      playlistFile: path.join(baseDir, 'playlist.json')
    };

    this.ensureDirectories();
  }

  public ensureDirectories() {
    for (const dir of [
      this.paths.rootDir,
      this.paths.cacheDir,
      this.paths.exportsDir,
      this.paths.mediaDir
    ]) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      } catch (err) {
        console.warn(`[LocalLibrary] Could not create directory ${dir}:`, err);
      }
    }
  }

  public getPaths(): DesktopPaths {
    return this.paths;
  }

  // --- PRESETS PERSISTENCE ON DISK ---
  public loadPresets(): any[] {
    try {
      if (fs.existsSync(this.paths.presetsFile)) {
        const raw = fs.readFileSync(this.paths.presetsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.warn('[LocalLibrary] Error reading presets.json:', err);
    }
    return [];
  }

  public savePresets(presets: any[]): boolean {
    try {
      this.ensureDirectories();
      fs.writeFileSync(this.paths.presetsFile, JSON.stringify(presets, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('[LocalLibrary] Error saving presets.json:', err);
      return false;
    }
  }

  // --- PLAYLIST PERSISTENCE ON DISK ---
  public loadPlaylist(): { playlistTitle: string; items: PlaylistItem[] } | null {
    try {
      if (fs.existsSync(this.paths.playlistFile)) {
        const raw = fs.readFileSync(this.paths.playlistFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.items)) {
          return {
            playlistTitle: parsed.playlistTitle || 'LOCAL DESKTOP QUEUE',
            items: parsed.items
          };
        }
      }
    } catch (err) {
      console.warn('[LocalLibrary] Error reading playlist.json:', err);
    }
    return null;
  }

  public savePlaylist(playlistTitle: string, items: PlaylistItem[]): boolean {
    try {
      this.ensureDirectories();
      // Filter out temporary blob: URLs that cannot persist across sessions
      const persistableItems = items.filter(
        (item) => !item.streamUrl || !item.streamUrl.startsWith('blob:')
      );
      fs.writeFileSync(
        this.paths.playlistFile,
        JSON.stringify({ playlistTitle, items: persistableItems, updatedAt: Date.now() }, null, 2),
        'utf-8'
      );
      return true;
    } catch (err) {
      console.error('[LocalLibrary] Error saving playlist.json:', err);
      return false;
    }
  }

  // --- SCAN PC FOLDER FOR VIDEO / AUDIO FILES ---
  public scanLocalFolder(folderInput?: string): {
    folderPath: string;
    items: PlaylistItem[];
    shortcuts: { label: string; path: string }[];
  } {
    const homeDir = os.homedir();
    const shortcuts = [
      { label: 'Studio Media', path: this.paths.mediaDir },
      { label: 'Studio Exports', path: this.paths.exportsDir },
      { label: 'Cache YouTube', path: this.paths.cacheDir },
      { label: 'Vidéos PC', path: path.join(homeDir, 'Videos') },
      { label: 'Musique PC', path: path.join(homeDir, 'Music') },
      { label: 'Téléchargements', path: path.join(homeDir, 'Downloads') }
    ].filter((s) => {
      try {
        return fs.existsSync(s.path);
      } catch {
        return false;
      }
    });

    const resolvedFolder = folderInput && folderInput.trim()
      ? path.resolve(folderInput.trim())
      : this.paths.mediaDir;

    if (!fs.existsSync(resolvedFolder)) {
      throw new Error(`Le dossier "${resolvedFolder}" est introuvable sur ce PC.`);
    }

    const stat = fs.statSync(resolvedFolder);
    if (!stat.isDirectory()) {
      throw new Error(`Le chemin "${resolvedFolder}" n'est pas un dossier.`);
    }

    const entries = fs.readdirSync(resolvedFolder, { withFileTypes: true });
    const items: PlaylistItem[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_MEDIA_EXTENSIONS.has(ext)) continue;

      const fullPath = path.join(resolvedFolder, entry.name);
      let fileSizeMb = 0;
      try {
        const fStat = fs.statSync(fullPath);
        fileSizeMb = Math.round((fStat.size / (1024 * 1024)) * 10) / 10;
      } catch {}

      const isAudio = ['.mp3', '.wav', '.flac', '.ogg', '.m4a'].includes(ext);
      const baseName = path.basename(entry.name, ext);

      items.push({
        id: `local-${Buffer.from(fullPath).toString('base64url').slice(0, 24)}`,
        title: baseName,
        duration: 0,
        thumbnail: isAudio
          ? 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=320&q=80'
          : 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=320&q=80',
        streamUrl: `/api/local-media?path=${encodeURIComponent(fullPath)}`,
        author: `LOCAL DISK (${ext.replace('.', '').toUpperCase()} • ${fileSizeMb} MB)`,
        isLocal: true
      });
    }

    return {
      folderPath: resolvedFolder,
      items,
      shortcuts
    };
  }
}

