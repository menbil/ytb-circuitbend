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
    if (process.env.YOUTUBE_USERNAME && process.env.YOUTUBE_PASSWORD) {
      this.username = process.env.YOUTUBE_USERNAME.trim();
      this.password = process.env.YOUTUBE_PASSWORD.trim();
      this.authMode = 'env';
      this.updatedAt = Date.now();
    }
    const envCookies = process.env.YOUTUBE_COOKIES || process.env.YT_COOKIES;
    if (envCookies && envCookies.trim()) {
      try {
        fs.writeFileSync(this.cookiesFilePath, envCookies.trim() + '\n', 'utf-8');
        this.hasCookiesFile = true;
        this.authMode = 'env';
        this.updatedAt = Date.now();
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

  /**
   * Parse a YouTube playlist or single video URL and return metadata
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
        '--extractor-args',
        'youtube:player_client=android',
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
      '18/b[height<=720]/best[height<=720]/best',
      '--no-playlist',
      '--no-warnings',
      '--no-part',
      '--js-runtimes',
      'node',
      '--extractor-args',
      'youtube:player_client=android',
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
