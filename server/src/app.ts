import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { YtDlpService } from './ytDlpService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const candidatePaths = [
  path.resolve(process.cwd(), '../client/dist'),
  path.resolve(process.cwd(), 'client/dist'),
  path.resolve(__dirname, '../../client/dist'),
  path.resolve(__dirname, '../client/dist'),
  path.resolve('/opt/render/project/src/client/dist')
];
const clientDistPath = candidatePaths.find((p) => fs.existsSync(path.join(p, 'index.html'))) || candidatePaths[0];
const hasClientDist = fs.existsSync(path.join(clientDistPath, 'index.html'));

export const app = express();
export const ytDlp = new YtDlpService();

// Enable CORS and explicit Permissions-Policy for Web MIDI, Camera & Screen Capture on Render
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'midi=(self *), camera=(self *), microphone=(self *), display-capture=(self *)');
  next();
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Range'],
  exposedHeaders: ['Content-Range', 'Content-Length', 'Accept-Ranges']
}));

app.use(express.json({ limit: '5mb' }));
// Raw binary body parser for media recording conversion (up to 300MB)
app.use('/api/convert-mp4', express.raw({ type: () => true, limit: '300mb' }));

/**
 * POST /api/convert-mp4
 * Converts recorded browser streams (WebM / VP8 / VP9 / Opus) to universal MP4 (H.264 / AAC)
 * fully compatible with Instagram, TikTok, YouTube Shorts, Twitter/X, and Apple iOS.
 */
app.post('/api/convert-mp4', async (req: Request, res: Response) => {
  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'Fichier vidéo binaire vide ou invalide.' });
  }

  const tempId = `cb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inputPath = path.join(os.tmpdir(), `${tempId}.bin`);
  const outputPath = path.join(os.tmpdir(), `${tempId}.mp4`);

  try {
    await fs.promises.writeFile(inputPath, req.body);

    console.log(`[MP4 Export] Starting FFmpeg conversion for ${req.body.length} bytes...`);

    // High-Fidelity H.264 Main Profile + YUV420p + Studio 320k AAC + FastStart + Exact Duration CFR
    // -preset ultrafast provides lightning-fast (1-3s) processing while CRF 18 preserves pristine scanlines and glitches
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
      '-crf', '18',
      '-r', '60',
      '-fps_mode', 'cfr',
      '-maxrate', '18M',
      '-bufsize', '36M',
      '-c:a', 'aac',
      '-b:a', '320k',
      '-af', 'aresample=async=1000:first_pts=0',
      '-movflags', '+faststart',
      outputPath
    ];

    const proc = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    // 25-second watchdog timer to guarantee process never hangs
    const watchdogTimer = setTimeout(() => {
      console.warn('[MP4 Export] FFmpeg conversion exceeded 25s, terminating process.');
      try {
        proc.kill('SIGKILL');
      } catch {}
    }, 25000);

    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(watchdogTimer);
      // Clean input temp file
      fs.promises.unlink(inputPath).catch(() => {});

      if (code !== 0 || !fs.existsSync(outputPath)) {
        console.error('[FFmpeg Error]:', stderr);
        fs.promises.unlink(outputPath).catch(() => {});
        return res.status(500).json({ error: 'Échec de conversion FFmpeg vers MP4.', details: stderr });
      }

      console.log(`[MP4 Export] Conversion success! Delivering ${outputPath}`);

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="circuitbend-${Date.now()}.mp4"`);

      const readStream = fs.createReadStream(outputPath);
      readStream.pipe(res);
      readStream.on('close', () => {
        fs.promises.unlink(outputPath).catch(() => {});
      });
    });

    proc.on('error', (err) => {
      console.error('[FFmpeg Process Error]:', err);
      fs.promises.unlink(inputPath).catch(() => {});
      fs.promises.unlink(outputPath).catch(() => {});
      res.status(500).json({ error: 'FFmpeg introuvable ou erreur processus.', details: err.message });
    });
  } catch (err: any) {
    fs.promises.unlink(inputPath).catch(() => {});
    fs.promises.unlink(outputPath).catch(() => {});
    res.status(500).json({ error: 'Erreur écriture fichier temporaire.', details: err.message });
  }
});

// Serve React static build in production if available
if (hasClientDist) {
  app.use(express.static(clientDistPath));
} else {
  // Root endpoint with user-friendly dashboard for dev
  app.get('/', (_req: Request, res: Response) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>⚡ CIRCUIT//BEND — API Relais Backend</title>
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
          transition: transform 0.1s;
        }
        .btn:hover { transform: scale(1.05); }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>⚡ CIRCUIT//BEND BACKEND EN LIGNE</h1>
        <p>Le serveur relais Node.js &amp; yt-dlp fonctionne correctement sur le port <strong>3001</strong>.</p>
        <p>L'interface utilisateur graphique (React + WebGL + Web Audio) tourne sur le port <strong>5173</strong> :</p>
        <a class="btn" href="http://localhost:5173">👉 ACCÉDER AU STUDIO (PORT 5173)</a>
      </div>
    </body>
    </html>
  `);
  });
}

// Health check endpoint
app.get('/api/health', async (_req: Request, res: Response) => {
  const exe = await ytDlp.getExecutable();
  res.json({ status: 'ok', engine: 'ytb-circuitbend-backend', ytDlpCmd: exe, ytAuth: ytDlp.getAuthStatus() });
});

/**
 * Optional Google / YouTube Login Manager
 */
app.get('/api/yt-auth', (_req: Request, res: Response) => {
  res.json(ytDlp.getAuthStatus());
});

app.post('/api/yt-auth', (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !email.trim() || !password || !password.trim()) {
    return res.status(400).json({ error: 'Veuillez renseigner votre adresse e-mail Google et votre mot de passe.' });
  }
  try {
    ytDlp.setLoginCredentials(email, password);
    res.json({ ok: true, status: ytDlp.getAuthStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erreur lors de la connexion.' });
  }
});

app.delete('/api/yt-auth', (_req: Request, res: Response) => {
  ytDlp.clearCredentials();
  res.json({ ok: true, status: ytDlp.getAuthStatus() });
});

// Diagnostic stream endpoint to capture exact yt-dlp stderr output on Render
app.get('/api/debug-stream', async (req: Request, res: Response) => {
  const videoId = (req.query.id as string) || '4RCrvRXUrs4';
  const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const exe = await ytDlp.getExecutable();
  
  const { exec } = await import('child_process');
  exec(`${exe} -f "18/b/best" --no-playlist --js-runtimes node --extractor-args "youtube:player_client=android" -v -o - "${targetUrl}"`, { maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
    res.json({
      exe,
      targetUrl,
      error: err ? err.message : null,
      stderr: stderr ? stderr.slice(0, 3000) : null,
      stdoutBytes: stdout ? stdout.length : 0
    });
  });
});

/**
 * POST /api/playlist
 * Input: { url: string }
 * Output: PlaylistResponse { playlistTitle: string, items: PlaylistItem[] }
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
 * Streams the video/audio with permissive CORS headers for WebGL VideoTexture and Web Audio API
 */
app.get('/api/stream', (req: Request, res: Response) => {
  const videoId = req.query.id as string;

  if (!videoId) {
    return res.status(400).send('Missing "id" query parameter.');
  }

  console.log(`[Stream] Incoming stream request for ID: ${videoId}`);

  // Set permissive CORS and media headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Accept-Ranges', 'none');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Connection', 'keep-alive');

  const streamProcess = ytDlp.createStreamProcess(videoId);

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

  streamProcess.on('error', (err: any) => {
    console.error('[Stream Process Error]:', err);
    if (!res.headersSent) {
      res.status(500).send('Stream process encountered an error.');
    }
  });

  // When client disconnects or skips track, terminate child process
  req.on('close', () => {
    console.log(`[Stream] Client disconnected from stream: ${videoId}. Terminating worker.`);
    try {
      streamProcess.kill('SIGTERM');
    } catch {
      // ignore
    }
  });
});

// Fallback for SPA routing in production
if (hasClientDist) {
  app.get('*', (req: Request, res: Response, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}
