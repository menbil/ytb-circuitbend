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
  mode: 'none' | 'credentials' | 'oauth' | 'env';
  updatedAt: number | null;
}

export class YtDlpService {
  private binaryCmd: string = 'yt-dlp';
  private isDirectBinary: boolean = true;
  private username: string = '';
  private password: string = '';
  private cookiesFilePath: string = path.join(os.tmpdir(), 'ytb-circuitbend-cookies.txt');
  private hasCookiesFile: boolean = false;
  private authMode: 'none' | 'credentials' | 'oauth' | 'env' = 'none';
  private updatedAt: number | null = null;

  constructor() {
    this.detectExecutable();
    this.initFromEnv();
  }

  private initFromEnv() {
    // 1. Check Render Secret Files (/etc/secrets/cookies.txt) or local cookies.txt
    const secretPaths = [
      '/etc/secrets/cookies.txt',
      path.resolve(process.cwd(), 'cookies.txt'),
      path.resolve(process.cwd(), '../cookies.txt')
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
            console.log(`[yt-dlp] Loaded YouTube cookies from secret file: ${sp}`);
            return;
          }
        } catch {}
      }
    }

    // 2. Check YOUTUBE_COOKIES env var (supports raw Netscape text or single-line Base64)
    const envCookies = process.env.YOUTUBE_COOKIES || process.env.YT_COOKIES;
    if (envCookies && envCookies.trim()) {
      try {
        let raw = envCookies.trim();
        if (!raw.includes('\t') && !raw.startsWith('#')) {
          // Decode single-line Base64 if encoded
          const decoded = Buffer.from(raw, 'base64').toString('utf-8');
          if (decoded.includes('.youtube.com') || decoded.startsWith('#')) {
            raw = decoded.trim();
          }
        }
        fs.writeFileSync(this.cookiesFilePath, raw + '\n', 'utf-8');
        this.hasCookiesFile = true;
        this.authMode = 'env';
        this.updatedAt = Date.now();
        console.log('[yt-dlp] Loaded YouTube cookies from YOUTUBE_COOKIES env var.');
      } catch {}
    }
  }

  public setLoginCredentials(email: string, password: string) {
    this.username = email.trim();
    this.password = password.trim();
    this.authMode = 'credentials';
    this.updatedAt = Date.now();
  }

  public clearCredentials() {
    this.username = '';
    this.password = '';
    this.hasCookiesFile = false;
    this.authMode = 'none';
    this.updatedAt = null;
    try {
      if (fs.existsSync(this.cookiesFilePath)) fs.unlinkSync(this.cookiesFilePath);
    } catch {}
  }

  public getAuthStatus(): YtAuthStatus {
    const enabled = Boolean((this.username && this.password) || this.hasCookiesFile);
    return {
      enabled,
      email: this.username ? this.username.replace(/(.{2}).+(@.+)/, '$1***$2') : null,
      mode: enabled ? this.authMode : 'none',
      updatedAt: this.updatedAt
    };
  }

  public getExtractorClientArg(): string {
    if (this.hasCookiesFile && fs.existsSync(this.cookiesFilePath)) {
      return 'youtube:player_client=default,web,android_vr,mweb';
    }
    return 'youtube:player_client=android_vr,android,default';
  }

  public getAuthArgs(): string[] {
    const args: string[] = [];
    if (this.hasCookiesFile && fs.existsSync(this.cookiesFilePath)) {
      args.push('--cookies', this.cookiesFilePath);
    } else if (this.username && this.password) {
      args.push('--username', this.username, '--password', this.password);
    }
    return args;
  }

  public async detectExecutable() {
    // 1. Direct yt-dlp binary (standard in Linux / Render PATH)
    try {
      await execAsync('yt-dlp --version');
      this.binaryCmd = 'yt-dlp';
      this.isDirectBinary = true;
      console.log('[yt-dlp] Using direct binary: yt-dlp');
      return;
    } catch {}

    // 2. Python 3 module (Linux / Ubuntu standard)
    try {
      await execAsync('python3 -m yt_dlp --version');
      this.binaryCmd = 'python3';
      this.isDirectBinary = false;
      console.log('[yt-dlp] Using: python3 -m yt_dlp');
      return;
    } catch {}

    // 3. Python standard
    try {
      await execAsync('python -m yt_dlp --version');
      this.binaryCmd = 'python';
      this.isDirectBinary = false;
      console.log('[yt-dlp] Using: python -m yt_dlp');
      return;
    } catch {}

    // 4. Windows py launcher
    this.binaryCmd = 'py';
    this.isDirectBinary = false;
    console.log('[yt-dlp] Fallback to: py -m yt_dlp');
  }

  public async getExecutable(): Promise<string> {
    await this.detectExecutable();
    return this.isDirectBinary ? this.binaryCmd : `${this.binaryCmd} -m yt_dlp`;
  }

  private prefetchInProgress: Set<string> = new Set();
  private cachedTracksOrder: string[] = [];

  public getCachedStreamPath(videoId: string): string | null {
    const safeId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeId) return null;
    const filePath = path.join(os.tmpdir(), `ytb-cache-${safeId}.mp4`);
    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.size > 32768) {
          return filePath;
        }
      }
    } catch {}
    return null;
  }

  public prefetchTrack(videoId: string): void {
    const safeId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeId || this.prefetchInProgress.has(safeId) || this.getCachedStreamPath(safeId)) {
      return;
    }

    this.prefetchInProgress.add(safeId);
    const tempPath = path.join(os.tmpdir(), `ytb-cache-${safeId}.part.mp4`);
    const finalPath = path.join(os.tmpdir(), `ytb-cache-${safeId}.mp4`);
    const targetUrl = `https://www.youtube.com/watch?v=${safeId}`;

    const baseArgs = [
      '-f',
      '18/b[ext=mp4]/b/best[ext=mp4]/best',
      '--no-playlist',
      '--no-warnings',
      '--no-part',
      '--js-runtimes',
      'node',
      '--remote-components',
      'ejs:github',
      '--extractor-args',
      this.getExtractorClientArg(),
      ...this.getAuthArgs(),
      '-o',
      tempPath,
      targetUrl
    ];

    const args = this.isDirectBinary ? baseArgs : ['-m', 'yt_dlp', ...baseArgs];
    console.log(`[yt-dlp] Background prefetching track ${safeId} for seamless transition...`);

    const child = spawn(this.binaryCmd, args, { shell: false });
    child.on('close', (code) => {
      this.prefetchInProgress.delete(safeId);
      if (code === 0 && fs.existsSync(tempPath)) {
        try {
          fs.renameSync(tempPath, finalPath);
          this.cachedTracksOrder = this.cachedTracksOrder.filter((id) => id !== safeId);
          this.cachedTracksOrder.push(safeId);
          // Keep at most 5 cached videos in tmpdir
          while (this.cachedTracksOrder.length > 5) {
            const oldest = this.cachedTracksOrder.shift();
            if (oldest) {
              fs.promises.unlink(path.join(os.tmpdir(), `ytb-cache-${oldest}.mp4`)).catch(() => {});
            }
          }
          console.log(`[yt-dlp] Prefetch ready for ${safeId}`);
        } catch {
          fs.promises.unlink(tempPath).catch(() => {});
        }
      } else {
        fs.promises.unlink(tempPath).catch(() => {});
      }
    });
    child.on('error', () => {
      this.prefetchInProgress.delete(safeId);
      fs.promises.unlink(tempPath).catch(() => {});
    });
  }

  /**
   * Parse a YouTube playlist or single video URL and return metadata
   */
  public async parseUrl(url: string, _baseUrl: string): Promise<PlaylistResponse> {
    // Fast-path (~50ms, 0% CPU) for single video URLs (without list= parameter) so adding a track never stutters active playback
    const isPlaylistUrl = /[?&]list=([^&#]+)/.test(url);
    const singleVideoMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|v\/))([a-zA-Z0-9_-]{11})/);
    if (!isPlaylistUrl && singleVideoMatch && singleVideoMatch[1]) {
      const videoId = singleVideoMatch[1];
      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`
        );
        if (oembedRes.ok) {
          const meta: any = await oembedRes.json();
          // Trigger background prefetch so when user switches to this track (or current track ends) it starts in 0ms
          setTimeout(() => this.prefetchTrack(videoId), 200);
          return {
            playlistTitle: meta.title || 'YouTube Video',
            items: [
              {
                id: videoId,
                title: meta.title || 'Untitled Track',
                duration: 0,
                thumbnail: meta.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                streamUrl: `/api/stream?id=${videoId}`,
                author: meta.author_name || ''
              }
            ]
          };
        }
      } catch {}
    }

    await this.detectExecutable();

    return new Promise((resolve, reject) => {
      const baseArgs = [
        '--flat-playlist',
        '-J',
        '--no-warnings',
        '--no-check-certificates',
        '--js-runtimes',
        'node',
        '--remote-components',
        'ejs:github',
        '--extractor-args',
        this.getExtractorClientArg(),
        ...this.getAuthArgs(),
        url
      ];

      const args = this.isDirectBinary ? baseArgs : ['-m', 'yt_dlp', ...baseArgs];

      console.log(`[yt-dlp] Fetching metadata for ${url} via ${this.binaryCmd}...`);

      const child = spawn(this.binaryCmd, args, { shell: false });
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
          console.error('[yt-dlp] Error output:', stderr);
          return reject(new Error(`yt-dlp exited with code ${code}: ${stderr || 'Unknown error'}`));
        }

        try {
          const jsonStartIndex = stdout.indexOf('{');
          if (jsonStartIndex === -1) {
            throw new Error(`No JSON output from yt-dlp. ExitCode: ${code}. Stderr: ${stderr.trim() || 'none'}. Stdout: ${stdout.trim() || 'none'}`);
          }
          const jsonStr = stdout.slice(jsonStartIndex);
          const data = JSON.parse(jsonStr);

          const items: PlaylistItem[] = [];
          const playlistTitle = data.title || (data._type === 'playlist' ? 'YouTube Playlist' : 'YouTube Video');

          if (data.entries && Array.isArray(data.entries)) {
            // It's a playlist
            for (const entry of data.entries) {
              if (!entry || (!entry.id && !entry.url)) continue;
              const videoId = entry.id || (entry.url ? entry.url.replace(/^.*(?:youtu.be\/|v\/|e\/|u\/\w+\/|embed\/|v=)([^#&?]*).*/, '$1') : '');

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
            // Single video
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
   * Spawns a yt-dlp process to stream video & audio muxed directly into stdout without shell escaping issues
   */
  public createStreamProcess(idOrUrl: string) {
    const targetUrl = idOrUrl.startsWith('http')
      ? idOrUrl
      : `https://www.youtube.com/watch?v=${idOrUrl}`;

    // Real-time progressive stream without chunk delays to prevent playback stalls
    const baseArgs = [
      '-f',
      '18/b[ext=mp4]/b/best[ext=mp4]/best',
      '--no-playlist',
      '--no-warnings',
      '--no-part',
      '--js-runtimes',
      'node',
      '--remote-components',
      'ejs:github',
      '--extractor-args',
      this.getExtractorClientArg(),
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

    console.log(`[yt-dlp] Spawning stream for ${targetUrl} via ${this.binaryCmd} (shell=false)`);
    return spawn(this.binaryCmd, args, { shell: false });
  }
}
