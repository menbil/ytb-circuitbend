import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { YtDlpService } from './ytDlpService.js';
import { LocalLibraryService } from './localLibraryService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const candidatePaths = [
  path.resolve(process.cwd(), '../client/dist'),
  path.resolve(process.cwd(), 'client/dist'),
  path.resolve(__dirname, '../../client/dist'),
  path.resolve(__dirname, '../client/dist')
];
const clientDistPath =
  candidatePaths.find((p) => fs.existsSync(path.join(p, 'index.html'))) || candidatePaths[0];
const hasClientDist = fs.existsSync(path.join(clientDistPath, 'index.html'));

export const localLibrary = new LocalLibraryService();
export const ytDlp = new YtDlpService(localLibrary.getPaths().cacheDir);
export const app = express();

// Enable CORS and explicit Permissions-Policy for Web MIDI, Camera, Microphone & Screen Capture
app.use((_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'midi=*, camera=*, microphone=*, display-capture=*, autoplay=*'
  );
  res.setHeader('Feature-Policy', "midi 'self' *; camera 'self' *; microphone 'self' *");
  next();
});

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Range'],
    exposedHeaders: [
      'Content-Range',
      'Content-Length',
      'Accept-Ranges',
      'X-CircuitBend-Cache',
      'X-Export-Path'
    ]
  })
);

app.use(express.json({ limit: '15mb' }));
app.use('/api/convert-mp4', express.raw({ type: () => true, limit: '1024mb' }));
app.use('/api/export-wav', express.raw({ type: () => true, limit: '512mb' }));

/**
 * Helper to stream a local file with full HTTP Range (206 Partial Content) support
 * Enables instant timeline scrubbing, A/B looping, and zero-latency replay.
 */
function serveFileWithRange(
  req: Request,
  res: Response,
  filePath: string,
  contentType: string = 'video/mp4',
  extraHeaders: Record<string, string> = {}
) {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return res.status(404).send('File not found on disk.');
  }

  const fileSize = stat.size;
  const range = req.headers.range;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', contentType);
  for (const [k, v] of Object.entries(extraHeaders)) {
    res.setHeader(k, v);
  }

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
      return res.end();
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);

    const fileStream = fs.createReadStream(filePath, { start, end });
    fileStream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
    fileStream.pipe(res);
  } else {
    res.status(200);
    res.setHeader('Content-Length', fileSize);
    const fileStream = fs.createReadStream(filePath);
    fileStream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
    fileStream.pipe(res);
  }
}

function getMimeTypeForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp4':
    case '.m4v':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/quicktime';
    case '.mkv':
      return 'video/x-matroska';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.flac':
      return 'audio/flac';
    case '.ogg':
      return 'audio/ogg';
    case '.m4a':
      return 'audio/mp4';
    default:
      return 'application/octet-stream';
  }
}

function formatExportTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}h${pad(d.getMinutes())}m${pad(d.getSeconds())}s`;
}

/**
 * POST /api/convert-mp4
 * Converts recorded browser streams to H.264 / AAC MP4 AND saves a copy in `data/exports/`
 */
app.post('/api/convert-mp4', async (req: Request, res: Response) => {
  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'Fichier vidéo binaire vide ou invalide.' });
  }

  const timestamp = formatExportTimestamp();
  const tempId = `cb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inputPath = path.join(os.tmpdir(), `${tempId}.bin`);
  const exportsDir = localLibrary.getPaths().exportsDir;
  const outputPath = path.join(exportsDir, `circuitbend-video_${timestamp}.mp4`);

  try {
    localLibrary.ensureDirectories();
    await fs.promises.writeFile(inputPath, req.body);

    console.log(`[Desktop MP4 Export] Starting FFmpeg conversion (${req.body.length} bytes) -> ${outputPath}`);

    const ffmpegArgs = [
      '-y',
      '-nostdin',
      '-err_detect', 'ignore_err',
      '-fflags', '+genpts+discardcorrupt',
      '-avoid_negative_ts', 'make_zero',
      '-i', inputPath,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'ultrafast',
      '-crf', '20',
      '-r', '30',
      '-fps_mode', 'cfr',
      '-maxrate', '12M',
      '-bufsize', '24M',
      '-c:a', 'aac',
      '-b:a', '256k',
      '-af', 'aresample=async=1000:first_pts=0',
      '-movflags', '+faststart',
      outputPath
    ];

    const proc = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    // Desktop mode: generous 5-minute watchdog for long live recordings
    const watchdogTimer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {}
    }, 300_000);

    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(watchdogTimer);
      fs.promises.unlink(inputPath).catch(() => {});

      if (code !== 0 || !fs.existsSync(outputPath)) {
        console.error('[FFmpeg Error]:', stderr);
        return res.status(500).json({ error: 'Échec de conversion FFmpeg vers MP4.', details: stderr });
      }

      console.log(`[Desktop MP4 Export] Saved to disk: ${outputPath}`);

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('X-Export-Path', outputPath);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${path.basename(outputPath)}"`
      );

      const readStream = fs.createReadStream(outputPath);
      readStream.pipe(res);
    });

    proc.on('error', (err) => {
      clearTimeout(watchdogTimer);
      fs.promises.unlink(inputPath).catch(() => {});
      res.status(500).json({ error: 'FFmpeg introuvable ou erreur processus.', details: err.message });
    });
  } catch (err: any) {
    fs.promises.unlink(inputPath).catch(() => {});
    res.status(500).json({ error: 'Erreur écriture fichier export.', details: err.message });
  }
});

/**
 * POST /api/export-wav
 * Converts recorded circuit-bent audio stream into Studio Lossless 24-bit 48kHz .WAV
 * and saves it permanently to `data/exports/` on disk for DAWs (Ableton, FL Studio, Logic).
 */
app.post('/api/export-wav', async (req: Request, res: Response) => {
  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'Flux audio binaire vide ou invalide.' });
  }

  const timestamp = formatExportTimestamp();
  const tempId = `cb-aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inputPath = path.join(os.tmpdir(), `${tempId}.bin`);
  const exportsDir = localLibrary.getPaths().exportsDir;
  const outputPath = path.join(exportsDir, `circuitbend-stem_${timestamp}.wav`);

  try {
    localLibrary.ensureDirectories();

    // Check if the buffer is already a valid RIFF WAVE header
    const isAlreadyWav =
      req.body.length > 12 &&
      req.body.subarray(0, 4).toString('ascii') === 'RIFF' &&
      req.body.subarray(8, 12).toString('ascii') === 'WAVE';

    if (isAlreadyWav) {
      await fs.promises.writeFile(outputPath, req.body);
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('X-Export-Path', outputPath);
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(outputPath)}"`);
      return fs.createReadStream(outputPath).pipe(res);
    }

    await fs.promises.writeFile(inputPath, req.body);

    const ffmpegArgs = [
      '-y',
      '-nostdin',
      '-i', inputPath,
      '-vn',
      '-c:a', 'pcm_s24le',
      '-ar', '48000',
      '-ac', '2',
      outputPath
    ];

    const proc = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('close', (code) => {
      fs.promises.unlink(inputPath).catch(() => {});

      if (code !== 0 || !fs.existsSync(outputPath)) {
        return res.status(500).json({ error: 'Échec export WAV via FFmpeg.', details: stderr });
      }

      console.log(`[Desktop WAV Export] Saved 24-bit WAV stem: ${outputPath}`);
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('X-Export-Path', outputPath);
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(outputPath)}"`);
      fs.createReadStream(outputPath).pipe(res);
    });

    proc.on('error', (err) => {
      fs.promises.unlink(inputPath).catch(() => {});
      res.status(500).json({ error: 'FFmpeg introuvable pour conversion WAV.', details: err.message });
    });
  } catch (err: any) {
    fs.promises.unlink(inputPath).catch(() => {});
    res.status(500).json({ error: 'Erreur lors de la création du WAV.', details: err.message });
  }
});

// Serve React static build in production if available
if (hasClientDist) {
  app.use(express.static(clientDistPath));
} else {
  app.get('/', (_req: Request, res: Response) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>⚡ CIRCUIT//BEND — DESKTOP LOCAL ENGINE</title>
      <style>
        body {
          background-color: #0a0b0d;
          color: #cbd5e1;
          font-family: 'Courier New', monospace;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
        }
        .card {
          background: #15171c;
          border: 2px solid #2a2f3a;
          border-radius: 8px;
          padding: 32px;
          max-width: 540px;
          text-align: center;
          box-shadow: 0 10px 25px rgba(0,0,0,0.8);
        }
        h1 { color: #ff9d00; margin-top: 0; font-size: 20px; }
        p { font-size: 13px; line-height: 1.6; color: #94a3b8; }
        .btn {
          display: inline-block;
          margin-top: 20px;
          padding: 12px 24px;
          background: #ff9d00;
          color: #000;
          text-decoration: none;
          font-weight: bold;
          border-radius: 4px;
          box-shadow: 0 0 15px rgba(255, 157, 0, 0.4);
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>⚡ CIRCUIT//BEND DESKTOP ENGINE ONLINE</h1>
        <p>Moteur 100% Local Desktop actif (Cache Disque 1080p, Range Seek, Recherche YT, WAV 24-bit).</p>
        <a class="btn" href="http://localhost:5173">👉 ACCÉDER AU STUDIO (PORT 5173)</a>
      </div>
    </body>
    </html>
  `);
  });
}

// Health check & Desktop info endpoint
app.get('/api/health', async (_req: Request, res: Response) => {
  const exe = await ytDlp.getExecutable();
  res.json({
    status: 'ok',
    mode: 'desktop-local',
    engine: 'ytb-circuitbend-backend',
    ytDlpCmd: exe,
    ytAuth: ytDlp.getAuthStatus(),
    cache: ytDlp.getCacheStatus(),
    paths: localLibrary.getPaths()
  });
});

// ============================================================================
// YOUTUBE AUTH & BROWSER COOKIES (`--cookies-from-browser`)
// ============================================================================
app.get('/api/yt-auth', (_req: Request, res: Response) => {
  res.json(ytDlp.getAuthStatus());
});

app.post('/api/yt-auth', (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !email.trim() || !password || !password.trim()) {
    return res
      .status(400)
      .json({ error: 'Veuillez renseigner votre adresse e-mail Google et votre mot de passe.' });
  }
  try {
    ytDlp.setLoginCredentials(email, password);
    res.json({ ok: true, status: ytDlp.getAuthStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erreur lors de la connexion.' });
  }
});

app.post('/api/yt-auth/browser', (req: Request, res: Response) => {
  const { browser } = req.body || {};
  ytDlp.setBrowserCookies(browser || null);
  res.json({ ok: true, status: ytDlp.getAuthStatus() });
});

app.delete('/api/yt-auth', (_req: Request, res: Response) => {
  ytDlp.clearCredentials();
  res.json({ ok: true, status: ytDlp.getAuthStatus() });
});

// ============================================================================
// DESKTOP CACHE ENDPOINTS (Instant Seek & Offline Playback)
// ============================================================================
app.get('/api/cache/status', (_req: Request, res: Response) => {
  res.json(ytDlp.getCacheStatus());
});

app.post('/api/cache/prefetch', async (req: Request, res: Response) => {
  const { id, ids } = req.body || {};
  const list: string[] = Array.isArray(ids) ? ids : id ? [id] : [];
  if (list.length === 0) {
    return res.status(400).json({ error: 'Missing "id" or "ids" to prefetch.' });
  }

  // Trigger background caching without blocking the HTTP response
  for (const trackId of list.slice(0, 5)) {
    if (trackId && !trackId.startsWith('local-')) {
      ytDlp.cacheTrackToDisk(trackId).catch((err) => {
        console.warn(`[Desktop Cache Prefetch] ${trackId}:`, err.message);
      });
    }
  }

  res.json({
    ok: true,
    queued: list.slice(0, 5),
    cache: ytDlp.getCacheStatus()
  });
});

app.delete('/api/cache', (_req: Request, res: Response) => {
  const result = ytDlp.clearCache();
  res.json({ ok: true, ...result, cache: ytDlp.getCacheStatus() });
});

// ============================================================================
// BUILT-IN YOUTUBE SEARCH (`POST /api/search`)
// ============================================================================
app.post('/api/search', async (req: Request, res: Response) => {
  const { query, limit } = req.body || {};
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'Missing or invalid "query" parameter.' });
  }

  try {
    const items = await ytDlp.searchYouTube(query.trim(), limit || 10);
    res.json({ query: query.trim(), items });
  } catch (err: any) {
    console.error('[API /api/search] Error:', err.message);
    res.status(500).json({
      error: 'Échec de la recherche YouTube locale.',
      details: err.message
    });
  }
});

// ============================================================================
// PERSISTENT LOCAL LIBRARY (Presets, Playlists & Local Folder Scanner)
// ============================================================================
app.get('/api/library/presets', (_req: Request, res: Response) => {
  res.json({ presets: localLibrary.loadPresets(), path: localLibrary.getPaths().presetsFile });
});

app.post('/api/library/presets', (req: Request, res: Response) => {
  const { presets } = req.body || {};
  if (!Array.isArray(presets)) {
    return res.status(400).json({ error: 'Invalid "presets" array.' });
  }
  const ok = localLibrary.savePresets(presets);
  res.json({ ok, count: presets.length, path: localLibrary.getPaths().presetsFile });
});

app.get('/api/library/playlist', (_req: Request, res: Response) => {
  const saved = localLibrary.loadPlaylist();
  res.json({
    saved: saved || null,
    path: localLibrary.getPaths().playlistFile
  });
});

app.post('/api/library/playlist', (req: Request, res: Response) => {
  const { playlistTitle, items } = req.body || {};
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Invalid "items" array.' });
  }
  const ok = localLibrary.savePlaylist(playlistTitle || 'DESKTOP QUEUE', items);
  res.json({ ok, count: items.length, path: localLibrary.getPaths().playlistFile });
});

app.post('/api/library/scan-folder', (req: Request, res: Response) => {
  const { folderPath } = req.body || {};
  try {
    const result = localLibrary.scanLocalFolder(folderPath);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Impossible de scanner ce dossier.' });
  }
});

app.get('/api/local-media', (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).send('Missing "path" query parameter.');
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return res.status(404).send('Local media file not found on disk.');
  }

  const mime = getMimeTypeForFile(resolved);
  return serveFileWithRange(req, res, resolved, mime, {
    'X-CircuitBend-Cache': 'LOCAL-DISK'
  });
});

/**
 * POST /api/playlist
 */
app.post('/api/playlist', async (req: Request, res: Response) => {
  const { url } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "url" parameter in request body.' });
  }

  try {
    const protocol = req.protocol;
    const host = req.get('host') || `localhost:3001`;
    const baseUrl = `${protocol}://${host}`;

    const playlistData = await ytDlp.parseUrl(url, baseUrl);

    if (playlistData.items.length === 0) {
      return res.status(404).json({ error: 'No streamable items found for this URL.' });
    }

    res.json(playlistData);
  } catch (err: any) {
    console.error('[API /api/playlist] Error:', err.message);
    res.status(500).json({
      error: 'Failed to extract playlist or video metadata.',
      details: err.message
    });
  }
});

/**
 * GET /api/stream?id=...
 * In Desktop Mode:
 * 1) If the video is already in `data/cache/<id>.mp4`, serves it with full HTTP Range (206 Partial Content) for instant seeking & looping!
 * 2) Otherwise streams live via yt-dlp AND caches it in the background for subsequent seeks/replays.
 */
app.get('/api/stream', (req: Request, res: Response) => {
  const videoId = req.query.id as string;

  if (!videoId) {
    return res.status(400).send('Missing "id" query parameter.');
  }

  // 1. Check local disk cache first
  const cachedFile = ytDlp.getCachedFilePath(videoId);
  if (cachedFile) {
    console.log(`[Stream] Serving ${videoId} from LOCAL DISK CACHE (Range enabled): ${cachedFile}`);
    return serveFileWithRange(req, res, cachedFile, 'video/mp4', {
      'X-CircuitBend-Cache': 'HIT'
    });
  }

  console.log(`[Stream] Live streaming ${videoId} (tee-caching to disk)...`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, X-CircuitBend-Cache');
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Accept-Ranges', 'none');
  res.setHeader('X-CircuitBend-Cache', 'LIVE-CACHING');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Connection', 'keep-alive');

  const streamProcess = ytDlp.createStreamProcess(videoId);

  // Tee live stdout stream into local disk cache file simultaneously (zero duplicate download!)
  const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'track';
  const cacheDir = localLibrary.getPaths().cacheDir;
  const tempStreamCachePath = path.join(cacheDir, `${cleanId}.stream.part`);
  const finalCachePath = path.join(cacheDir, `${cleanId}.mp4`);
  let cacheWriteStream: fs.WriteStream | null = null;
  try {
    localLibrary.ensureDirectories();
    cacheWriteStream = fs.createWriteStream(tempStreamCachePath);
    streamProcess.stdout.pipe(cacheWriteStream);
  } catch {}

  streamProcess.stdout.on('error', (err: any) => {
    if (err.code !== 'EPIPE' && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      console.warn('[Stream stdout error]:', err.message);
    }
  });

  res.on('error', (err: any) => {
    console.warn('[Response error]:', err.message);
  });

  streamProcess.stdout.pipe(res);

  streamProcess.stderr.on('data', (data: any) => {
    const msg = data.toString();
    if (msg.includes('ERROR:')) {
      console.error(`[yt-dlp stream error]: ${msg}`);
    }
  });

  streamProcess.on('close', (code) => {
    if (cacheWriteStream) {
      cacheWriteStream.end(() => {
        if (code === 0 && fs.existsSync(tempStreamCachePath)) {
          try {
            const stat = fs.statSync(tempStreamCachePath);
            if (stat.size > 64 * 1024) {
              if (fs.existsSync(finalCachePath)) fs.unlinkSync(finalCachePath);
              fs.renameSync(tempStreamCachePath, finalCachePath);
              console.log(`[Desktop Cache] Saved live stream ${cleanId} to disk cache -> ${finalCachePath}`);
              return;
            }
          } catch {}
        }
        fs.promises.unlink(tempStreamCachePath).catch(() => {});
      });
    }
  });

  streamProcess.on('error', (err: any) => {
    console.error('[Stream Process Error]:', err);
    if (cacheWriteStream) cacheWriteStream.destroy();
    fs.promises.unlink(tempStreamCachePath).catch(() => {});
    if (!res.headersSent) {
      res.status(500).send('Stream process encountered an error.');
    }
  });

  req.on('close', () => {
    try {
      streamProcess.kill('SIGTERM');
    } catch {}
  });
});

// Fallback for SPA routing in production
if (hasClientDist) {
  app.get('*', (req: Request, res: Response, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}
