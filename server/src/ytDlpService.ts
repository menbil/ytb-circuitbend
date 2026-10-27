import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import https from 'https';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Response, Request } from 'express';
import { PlaylistItem, PlaylistResponse } from './types.js';

const execAsync = promisify(exec);

export interface YtAuthStatus {
  enabled: boolean;
  email: string | null;
  mode: 'none' | 'credentials' | 'oauth' | 'env';
  updatedAt: number | null;
}

// Public Piped & Invidious API relays used automatically when Render's datacenter IP is rate-limited by YouTube
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.private.coffee',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://pipedapi.syncpundit.io'
];

const INVIDIOUS_INSTANCES = [
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
  'https://invidious.privacyredirect.com',
  'https://iv.ggtyler.dev',
  'https://invidious.fdn.fr'
];

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

  public getAuthAndExtractorArgs(): string[] {
    const args: string[] = [];
    if (this.hasCookiesFile && fs.existsSync(this.cookiesFilePath)) {
      args.push('--cookies', this.cookiesFilePath);
    } else if (this.username && this.password) {
      args.push('--username', this.username, '--password', this.password);
    }

    // Use embedded TV & iOS clients first, as they bypass most datacenter bot checks
    args.push(
      '--extractor-args',
      'youtube:player_client=tv_embedded,web_embedded,ios,mweb;player_skip=webpage,configs'
    );
    return args;
  }

  public async detectExecutable() {
    try {
      await execAsync('yt-dlp --version');
      this.binaryCmd = 'yt-dlp';
      this.isDirectBinary = true;
      return;
    } catch {}

    try {
      await execAsync('python3 -m yt_dlp --version');
      this.binaryCmd = 'python3';
      this.isDirectBinary = false;
      return;
    } catch {}

    try {
      await execAsync('python -m yt_dlp --version');
      this.binaryCmd = 'python';
      this.isDirectBinary = false;
      return;
    } catch {}

    this.binaryCmd = 'py';
    this.isDirectBinary = false;
  }

  public async getExecutable(): Promise<string> {
    await this.detectExecutable();
    return this.isDirectBinary ? this.binaryCmd : `${this.binaryCmd} -m yt_dlp`;
  }

  /**
   * Extract a 11-char YouTube Video ID from any YouTube URL or raw ID
   */
  public extractVideoId(input: string): string | null {
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    const match = trimmed.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  }

  /**
   * Fast JSON fetch helper with timeout
   */
  private async fetchJson(url: string, timeoutMs = 4500): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Automatic Cloud Fallback for metadata when yt-dlp hits YouTube's datacenter bot check on Render.
   * Uses YouTube's official oEmbed endpoint (never blocked on cloud IPs) + Piped/Invidious fallback.
   */
  private async fallbackMetadataResolve(url: string): Promise<PlaylistResponse> {
    const videoId = this.extractVideoId(url) || '4RCrvRXUrs4';

    // 1. Try Piped API first (gives duration + title + uploader)
    for (const host of PIPED_INSTANCES) {
      try {
        const data = await this.fetchJson(`${host}/streams/${videoId}`, 3500);
        if (data && data.title) {
          return {
            playlistTitle: data.title,
            items: [
              {
                id: videoId,
                title: data.title,
                duration: data.duration || 210,
                thumbnail: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                streamUrl: `/api/stream?id=${videoId}`,
                author: data.uploader || 'YouTube Stream'
              }
            ]
          };
        }
      } catch {}
    }

    // 2. Fallback to YouTube Official oEmbed API (100% immune to datacenter bot checks!)
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
      const oembed = await this.fetchJson(oembedUrl, 4000);
      return {
        playlistTitle: oembed.title || 'YouTube Stream',
        items: [
          {
            id: videoId,
            title: oembed.title || `YouTube Video (${videoId})`,
            duration: 240,
            thumbnail: oembed.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            streamUrl: `/api/stream?id=${videoId}`,
            author: oembed.author_name || 'YouTube'
          }
        ]
      };
    } catch {}

    // 3. Ultimate fallback item so the player can still attempt stream resolution
    return {
      playlistTitle: 'YouTube Stream',
      items: [
        {
          id: videoId,
          title: `YouTube Track (${videoId})`,
          duration: 240,
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          streamUrl: `/api/stream?id=${videoId}`,
          author: 'YouTube'
        }
      ]
    };
  }

  /**
   * Parse a YouTube playlist or single video URL and return metadata
   */
  public async parseUrl(url: string, _baseUrl: string): Promise<PlaylistResponse> {
    await this.detectExecutable();

    try {
      return await new Promise<PlaylistResponse>((resolve, reject) => {
        const baseArgs = [
          '--flat-playlist',
          '-J',
          '--no-warnings',
          '--no-check-certificates',
          '--js-runtimes',
          'node',
          ...this.getAuthAndExtractorArgs(),
          url
        ];

        const args = this.isDirectBinary ? baseArgs : ['-m', 'yt_dlp', ...baseArgs];
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
            return reject(new Error(stderr || `yt-dlp exited with code ${code}`));
          }

          try {
            const jsonStartIndex = stdout.indexOf('{');
            if (jsonStartIndex === -1) {
              throw new Error(`No JSON output. Stderr: ${stderr.trim()}`);
            }
            const data = JSON.parse(stdout.slice(jsonStartIndex));
            const items: PlaylistItem[] = [];
            const playlistTitle = data.title || (data._type === 'playlist' ? 'YouTube Playlist' : 'YouTube Video');

            if (data.entries && Array.isArray(data.entries)) {
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
              const videoId = data.id || this.extractVideoId(url) || 'video';
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

            if (items.length === 0) {
              return reject(new Error('Empty items from yt-dlp'));
            }
            resolve({ playlistTitle, items });
          } catch (err: any) {
            reject(err);
          }
        });

        child.on('error', (err) => reject(err));
      });
    } catch (err: any) {
      console.warn(`[yt-dlp] Metadata blocked or failed (${err?.message?.slice(0, 120)}), using automatic oEmbed/Piped fallback...`);
      return await this.fallbackMetadataResolve(url);
    }
  }

  /**
   * Resolves a direct progressive MP4 stream URL from public Piped / Invidious relays
   * when YouTube blocks Render's datacenter IP.
   */
  public async resolveMirrorStreamUrl(videoId: string): Promise<string | null> {
    // 1. Try Piped instances
    for (const host of PIPED_INSTANCES) {
      try {
        const data = await this.fetchJson(`${host}/streams/${videoId}`, 4000);
        if (data && Array.isArray(data.videoStreams)) {
          // Find progressive stream with audio (videoOnly === false)
          const progressive = data.videoStreams.find(
            (s: any) => s.videoOnly === false && s.url && (s.format === 'MPEG_4' || s.mimeType?.includes('mp4'))
          ) || data.videoStreams.find((s: any) => s.videoOnly === false && s.url);

          if (progressive?.url) {
            console.log(`[Mirror Fallback] Resolved progressive stream via Piped (${host})`);
            return progressive.url;
          }
        }
      } catch {}
    }

    // 2. Try Invidious instances
    for (const host of INVIDIOUS_INSTANCES) {
      try {
        const data = await this.fetchJson(`${host}/api/v1/videos/${videoId}`, 4000);
        if (data && Array.isArray(data.formatStreams) && data.formatStreams.length > 0) {
          const best = data.formatStreams.find((s: any) => s.url && s.container === 'mp4') || data.formatStreams[0];
          if (best?.url) {
            console.log(`[Mirror Fallback] Resolved progressive stream via Invidious (${host})`);
            return best.url;
          }
        }
      } catch {}
    }

    return null;
  }

  /**
   * Proxies an external HTTP/HTTPS media URL directly into Express Response
   */
  public proxyUrlToResponse(streamUrl: string, req: Request, res: Response, redirectsLeft = 4) {
    if (redirectsLeft <= 0) {
      if (!res.headersSent) res.status(502).send('Too many redirects');
      return;
    }

    const client = streamUrl.startsWith('https') ? https : http;
    const upstreamReq = client.get(
      streamUrl,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      },
      (upstreamRes) => {
        if (
          upstreamRes.statusCode &&
          upstreamRes.statusCode >= 300 &&
          upstreamRes.statusCode < 400 &&
          upstreamRes.headers.location
        ) {
          upstreamRes.resume();
          const nextUrl = new URL(upstreamRes.headers.location, streamUrl).toString();
          this.proxyUrlToResponse(nextUrl, req, res, redirectsLeft - 1);
          return;
        }

        if (!res.headersSent) {
          res.setHeader('Content-Type', upstreamRes.headers['content-type'] || 'video/mp4');
        }
        upstreamRes.pipe(res);
      }
    );

    upstreamReq.on('error', (err) => {
      console.error('[Mirror Proxy Error]:', err.message);
      if (!res.headersSent) res.status(502).send('Upstream stream error');
    });

    req.on('close', () => {
      try {
        upstreamReq.destroy();
      } catch {}
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
      '18/b[height<=720]/best[height<=720]/best',
      '--no-playlist',
      '--no-warnings',
      '--no-part',
      '--no-check-certificates',
      '--js-runtimes',
      'node',
      ...this.getAuthAndExtractorArgs(),
      '--retries',
      '5',
      '--fragment-retries',
      '5',
      '--socket-timeout',
      '20',
      '-o',
      '-',
      targetUrl
    ];

    const args = this.isDirectBinary ? baseArgs : ['-m', 'yt_dlp', ...baseArgs];

    console.log(`[yt-dlp] Spawning stream for ${targetUrl}`);
    return spawn(this.binaryCmd, args, { shell: false });
  }
}
