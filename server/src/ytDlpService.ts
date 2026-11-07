import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PlaylistItem, PlaylistResponse } from './types.js';

const execAsync = promisify(exec);

export interface YtAuthStatus {
  enabled: boolean;
  email: string | null;
  mode: 'none' | 'credentials' | 'oauth' | 'env' | 'browser';
  browser?: string | null;
  updatedAt: number | null;
}

export interface CacheStatus {
  cacheDir: string;
  cachedIds: string[];
  activeDownloads: string[];
  totalSizeMb: number;
  fileCount: number;
}

export class YtDlpService {
  private binaryCmd: string = 'yt-dlp';
  private isDirectBinary: boolean = true;
  private username: string = '';
  private password: string = '';
  private cookiesFilePath: string = path.join(os.tmpdir(), 'ytb-circuitbend-cookies.txt');
  private hasCookiesFile: boolean = false;
  private cookiesBrowser: string | null = null;
  private authMode: 'none' | 'credentials' | 'oauth' | 'env' | 'browser' = 'none';
  private updatedAt: number | null = null;
  private activeStreamProcess: ReturnType<typeof spawn> | null = null;
  private cacheDir: string;
  private activeCacheJobs: Map<string, Promise<string>> = new Map();
  private cacheQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue: boolean = false;

  constructor(customCacheDir?: string) {
    const baseDataDir = process.env.CIRCUITBEND_DATA_DIR || path.resolve(process.cwd(), 'data');
    this.cacheDir = customCacheDir || path.join(baseDataDir, 'cache');
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    } catch {}
    this.detectExecutable();
    this.initFromEnv();
  }

  private initFromEnv() {
    const secretPaths = [
      path.resolve(process.cwd(), 'cookies.txt'),
      path.resolve(process.cwd(), '../cookies.txt'),
      '/etc/secrets/cookies.txt'
    ];
    for (const sp of secretPaths) {
      if (fs.existsSync(sp)) {
        try {
          const content = fs.readFileSync(sp, 'utf-8');
          if (content && content.trim()) {
            fs.writeFileSync(this.cookiesFilePath, content.trim() + '\n', 'utf-8');
            this.hasCookiesFile = true;
            this.authMode = 'env';
            this.updatedAt = Date.now();
            console.log(`[yt-dlp] Loaded YouTube cookies from file: ${sp}`);
            return;
          }
        } catch {}
      }
    }

    const envCookies = process.env.YOUTUBE_COOKIES || process.env.YT_COOKIES;
    if (envCookies && envCookies.trim()) {
      try {
        let raw = envCookies.trim();
        if (!raw.includes('\t') && !raw.startsWith('#')) {
          const decoded = Buffer.from(raw, 'base64').toString('utf-8');
          if (decoded.includes('.youtube.com') || decoded.startsWith('#')) {
            raw = decoded.trim();
          }
        }
        fs.writeFileSync(this.cookiesFilePath, raw + '\n', 'utf-8');
        this.hasCookiesFile = true;
        this.authMode = 'env';
        this.updatedAt = Date.now();
      } catch {}
    }
  }

  public setLoginCredentials(email: string, password: string) {
    this.username = email.trim();
    this.password = password.trim();
    this.cookiesBrowser = null;
    this.authMode = 'credentials';
    this.updatedAt = Date.now();
  }

  public setBrowserCookies(browser: string | null) {
    // Note: On Windows, Chrome/Edge/Brave v127+ lock cookies with App-Bound DPAPI encryption.
    // Only Firefox works reliably with --cookies-from-browser on Windows without DPAPI errors.
    const allowed = ['firefox'];
    if (browser && allowed.includes(browser.toLowerCase())) {
      this.cookiesBrowser = browser.toLowerCase();
      this.authMode = 'browser';
      this.updatedAt = Date.now();
    } else {
      this.cookiesBrowser = null;
      if (this.authMode === 'browser') {
        this.authMode = 'none';
      }
    }
  }

  public clearCredentials() {
    this.username = '';
    this.password = '';
    this.hasCookiesFile = false;
    this.cookiesBrowser = null;
    this.authMode = 'none';
    this.updatedAt = null;
    try {
      if (fs.existsSync(this.cookiesFilePath)) fs.unlinkSync(this.cookiesFilePath);
    } catch {}
  }

  public getAuthStatus(): YtAuthStatus {
    const enabled = Boolean(
      (this.username && this.password) || this.hasCookiesFile || this.cookiesBrowser
    );
    return {
      enabled,
      email: this.username ? this.username.replace(/(.{2}).+(@.+)/, '$1***$2') : null,
      mode: enabled ? this.authMode : 'none',
      browser: this.cookiesBrowser,
      updatedAt: this.updatedAt
    };
  }

  public getAuthArgs(): string[] {
    const args: string[] = [];
    if (this.cookiesBrowser) {
      args.push('--cookies-from-browser', this.cookiesBrowser);
    } else if (this.hasCookiesFile && fs.existsSync(this.cookiesFilePath)) {
      args.push('--cookies', this.cookiesFilePath);
    } else if (this.username && this.password) {
      args.push('--username', this.username, '--password', this.password);
    }
    return args;
  }

  public async detectExecutable() {
    // 1. Direct yt-dlp binary
    try {
      await execAsync('yt-dlp --version');
      this.binaryCmd = 'yt-dlp';
      this.isDirectBinary = true;
      return;
    } catch {}

    // 2. Python 3 module
    try {
      await execAsync('python3 -m yt_dlp --version');
      this.binaryCmd = 'python3';
      this.isDirectBinary = false;
      return;
    } catch {}

    // 3. Python standard
    try {
      await execAsync('python -m yt_dlp --version');
      this.binaryCmd = 'python';
      this.isDirectBinary = false;
      return;
    } catch {}

    // 4. Windows py launcher
    this.binaryCmd = 'py';
    this.isDirectBinary = false;
  }

  public async getExecutable(): Promise<string> {
    await this.detectExecutable();
    return this.isDirectBinary ? this.binaryCmd : `${this.binaryCmd} -m yt_dlp`;
  }

  // ============================================================================
  // DESKTOP LOCAL DISK CACHE (Sequential Queue + Instant HTTP Range Seek)
  // ============================================================================

  private sanitizeVideoId(idOrUrl: string): string {
    const match = idOrUrl.match(/(?:v=|youtu\.be\/|^)([a-zA-Z0-9_-]{6,15})/);
    const raw = match ? match[1] : idOrUrl;
    return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'track';
  }

  public getCachedFilePath(idOrUrl: string): string | null {
    const cleanId = this.sanitizeVideoId(idOrUrl);
    const filePath = path.join(this.cacheDir, `${cleanId}.mp4`);
    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.size > 32 * 1024) {
          return filePath;
        }
      }
    } catch {}
    return null;
  }

  public getCacheStatus(): CacheStatus {
    const cachedIds: string[] = [];
    let totalBytes = 0;

    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        for (const f of files) {
          if (f.endsWith('.mp4') && !f.endsWith('.part.mp4')) {
            const full = path.join(this.cacheDir, f);
            const stat = fs.statSync(full);
            if (stat.size > 32 * 1024) {
              cachedIds.push(path.basename(f, '.mp4'));
              totalBytes += stat.size;
            }
          }
        }
      }
    } catch {}

    return {
      cacheDir: this.cacheDir,
      cachedIds,
      activeDownloads: Array.from(this.activeCacheJobs.keys()),
      totalSizeMb: Math.round((totalBytes / (1024 * 1024)) * 10) / 10,
      fileCount: cachedIds.length
    };
  }

  public clearCache(): { removedFiles: number } {
    let removedFiles = 0;
    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        for (const f of files) {
          if (f.endsWith('.mp4') || f.endsWith('.part')) {
            try {
              fs.unlinkSync(path.join(this.cacheDir, f));
              removedFiles++;
            } catch {}
          }
        }
      }
    } catch {}
    return { removedFiles };
  }

  private async processNextInQueue() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;
    while (this.cacheQueue.length > 0) {
      const task = this.cacheQueue.shift();
      if (task) {
        try {
          await task();
        } catch {}
      }
    }
    this.isProcessingQueue = false;
  }

  /**
   * Downloads and caches a YouTube video to local disk (`data/cache/<videoId>.mp4`)
   * sequentially (1 at a time) using native JS runtime solving (`--js-runtimes node`)
   * without deprecated android_vr extractor flags that trigger 403.
   */
  public async cacheTrackToDisk(idOrUrl: string): Promise<string> {
    const existing = this.getCachedFilePath(idOrUrl);
    if (existing) return existing;

    const cleanId = this.sanitizeVideoId(idOrUrl);
    const activeJob = this.activeCacheJobs.get(cleanId);
    if (activeJob) return activeJob;

    await this.detectExecutable();

    let resolveOuter!: (val: string) => void;
    let rejectOuter!: (err: Error) => void;
    const jobPromise = new Promise<string>((res, rej) => {
      resolveOuter = res;
      rejectOuter = rej;
    });

    this.activeCacheJobs.set(cleanId, jobPromise);

    this.cacheQueue.push(async () => {
      const alreadyDone = this.getCachedFilePath(cleanId);
      if (alreadyDone) {
        this.activeCacheJobs.delete(cleanId);
        resolveOuter(alreadyDone);
        return;
      }

      try {
        if (!fs.existsSync(this.cacheDir)) {
          fs.mkdirSync(this.cacheDir, { recursive: true });
        }
      } catch {}

      const targetUrl = idOrUrl.startsWith('http')
        ? idOrUrl
        : `https://www.youtube.com/watch?v=${cleanId}`;

      const tempPath = path.join(this.cacheDir, `${cleanId}.part.mp4`);
      const finalPath = path.join(this.cacheDir, `${cleanId}.mp4`);

      const baseArgs = [
        '-f',
        '18/b[ext=mp4]/b/best[ext=mp4]/best',
        '--no-playlist',
        '--no-warnings',
        '--no-part',
        '--js-runtimes',
        'node',
        ...this.getAuthArgs(),
        '--retries',
        '5',
        '-o',
        tempPath,
        targetUrl
      ];

      const args = this.isDirectBinary ? baseArgs : ['-m', 'yt_dlp', ...baseArgs];
      console.log(`[Desktop Cache] Downloading ${cleanId} to local disk cache...`);

      await new Promise<void>((done) => {
        const proc = spawn(this.binaryCmd, args, { shell: false, windowsHide: true });
        let stderr = '';
        proc.stderr.on('data', (d) => {
          stderr += d.toString();
        });

        proc.on('close', (code) => {
          this.activeCacheJobs.delete(cleanId);
          if (code === 0 && fs.existsSync(tempPath)) {
            try {
              if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
              fs.renameSync(tempPath, finalPath);
              console.log(`[Desktop Cache] Cached ${cleanId} -> ${finalPath}`);
              resolveOuter(finalPath);
              return done();
            } catch (err: any) {
              rejectOuter(err);
              return done();
            }
          }
          try {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          } catch {}
          rejectOuter(new Error(`Cache download failed (${code}): ${stderr.slice(0, 300)}`));
          done();
        });

        proc.on('error', (err) => {
          this.activeCacheJobs.delete(cleanId);
          try {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          } catch {}
          rejectOuter(err);
          done();
        });
      });
    });

    this.processNextInQueue();
    return jobPromise;
  }

  // ============================================================================
  // BUILT-IN YOUTUBE SEARCH (`ytsearch`)
  // ============================================================================

  public async searchYouTube(query: string, limit: number = 10): Promise<PlaylistItem[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    const safeLimit = Math.max(1, Math.min(25, limit));
    const searchSpec = `ytsearch${safeLimit}:${cleanQuery}`;
    const res = await this.parseUrl(searchSpec, 'http://localhost:3001');
    return res.items;
  }

  /**
   * Parse a YouTube playlist, single video URL, or ytsearch query and return metadata
   */
  public async parseUrl(url: string, _baseUrl: string): Promise<PlaylistResponse> {
    await this.detectExecutable();

    return new Promise((resolve, reject) => {
      const baseArgs = [
        '--flat-playlist',
        '-J',
        '--no-warnings',
        '--no-check-certificates',
        '--js-runtimes',
        'node',
        ...this.getAuthArgs(),
        url
      ];

      const args = this.isDirectBinary ? baseArgs : ['-m', 'yt_dlp', ...baseArgs];

      console.log(`[yt-dlp] Fetching metadata for ${url} via ${this.binaryCmd}...`);

      const child = spawn(this.binaryCmd, args, { shell: false, windowsHide: true });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('close', (code) => {
        if (code !== 0 && !stdout) {
          if (this.cookiesBrowser && (stderr.includes('DPAPI') || stderr.toLowerCase().includes('cookie'))) {
            console.warn('[yt-dlp] Browser cookies failed (DPAPI lock), retrying without browser cookies...');
            this.setBrowserCookies(null);
            this.parseUrl(url, _baseUrl).then(resolve).catch(reject);
            return;
          }
          console.error('[yt-dlp] Error output:', stderr);
          return reject(
            new Error(`yt-dlp exited with code ${code}: ${stderr || 'Unknown error'}`)
          );
        }

        try {
          const jsonStartIndex = stdout.indexOf('{');
          if (jsonStartIndex === -1) {
            throw new Error(
              `No JSON output from yt-dlp. ExitCode: ${code}. Stderr: ${stderr.trim() || 'none'}. Stdout: ${stdout.trim() || 'none'}`
            );
          }
          const jsonStr = stdout.slice(jsonStartIndex);
          const data = JSON.parse(jsonStr);

          const items: PlaylistItem[] = [];
          const playlistTitle =
            data.title || (data._type === 'playlist' ? 'YouTube Playlist' : 'YouTube Video');

          if (data.entries && Array.isArray(data.entries)) {
            for (const entry of data.entries) {
              if (!entry || (!entry.id && !entry.url)) continue;
              const videoId =
                entry.id ||
                (entry.url
                  ? entry.url.replace(
                      /^.*(?:youtu.be\/|v\/|e\/|u\/\w+\/|embed\/|v=)([^#&?]*).*/,
                      '$1'
                    )
                  : '');

              let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
              if (entry.thumbnails && entry.thumbnails.length > 0) {
                thumbnail = entry.thumbnails[entry.thumbnails.length - 1].url;
              } else if (entry.thumbnail) {
                thumbnail = entry.thumbnail;
              }

              items.push({
                id: videoId,
                title: entry.title || 'Untitled Track',
                duration: entry.duration || 0,
                thumbnail,
                streamUrl: `/api/stream?id=${videoId}`,
                author: entry.uploader || entry.channel || entry.artist || ''
              });
            }
          } else {
            const videoId = data.id || 'video';
            let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
            if (data.thumbnails && data.thumbnails.length > 0) {
              thumbnail = data.thumbnails[data.thumbnails.length - 1].url;
            } else if (data.thumbnail) {
              thumbnail = data.thumbnail;
            }

            items.push({
              id: videoId,
              title: data.title || 'Untitled Track',
              duration: data.duration || 0,
              thumbnail,
              streamUrl: `/api/stream?id=${videoId}`,
              author: data.uploader || data.channel || data.artist || ''
            });
          }

          resolve({
            playlistTitle,
            items
          });
        } catch (err: any) {
          reject(new Error(`Failed to parse yt-dlp output: ${err.message}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Spawns a yt-dlp process to stream video & audio muxed directly into stdout
   */
  public createStreamProcess(idOrUrl: string) {
    const targetUrl = idOrUrl.startsWith('http')
      ? idOrUrl
      : `https://www.youtube.com/watch?v=${idOrUrl}`;

    const baseArgs = [
      '-f',
      '18/b[ext=mp4]/b/best[ext=mp4]/best',
      '--no-playlist',
      '--no-warnings',
      '--no-part',
      '--js-runtimes',
      'node',
      ...this.getAuthArgs(),
      '--retries',
      '10',
      '--fragment-retries',
      '10',
      '--socket-timeout',
      '30',
      '-o',
      '-',
      targetUrl
    ];

    const args = this.isDirectBinary ? baseArgs : ['-m', 'yt_dlp', ...baseArgs];

    if (this.activeStreamProcess) {
      try {
        this.activeStreamProcess.kill('SIGTERM');
      } catch {}
      this.activeStreamProcess = null;
    }

    console.log(`[yt-dlp] Spawning live stream for ${targetUrl} via ${this.binaryCmd}`);
    const proc = spawn(this.binaryCmd, args, { shell: false, windowsHide: true });
    this.activeStreamProcess = proc;
    proc.on('close', () => {
      if (this.activeStreamProcess === proc) {
        this.activeStreamProcess = null;
      }
    });
    return proc;
  }
}
