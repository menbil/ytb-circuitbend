import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { YtDlpService } from './ytDlpService.js';

dotenv.config();

const candidatePaths = [
  path.resolve(process.cwd(), '../client/dist'),
  path.resolve(process.cwd(), 'client/dist'),
  path.resolve(__dirname, '../../client/dist'),
  path.resolve(__dirname, '../client/dist'),
  path.resolve('/opt/render/project/src/client/dist')
];
const clientDistPath = candidatePaths.find((p) => fs.existsSync(path.join(p, 'index.html'))) || candidatePaths[0];
const hasClientDist = fs.existsSync(path.join(clientDistPath, 'index.html'));
console.log(`[Static Check] clientDistPath resolved to: ${clientDistPath} (exists: ${hasClientDist})`);

const app = express();
const PORT = process.env.PORT || 3001;
const ytDlp = new YtDlpService();

process.on('uncaughtException', (err) => {
  console.error('[Backend Uncaught Exception]:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Backend Unhandled Rejection]:', reason);
});

// Enable CORS for all origins with exposed headers
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Range'],
  exposedHeaders: ['Content-Range', 'Content-Length', 'Accept-Ranges']
}));

app.use(express.json());

// Serve React static build in production if available
if (hasClientDist) {
  console.log(`[Production] Serving static files from ${clientDistPath}`);
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
  res.json({ status: 'ok', engine: 'ytb-circuitbend-backend', ytDlpCmd: exe });
});

/**
 * POST /api/playlist
 * Input: { url: string }
 * Output: PlaylistResponse { playlistTitle: string, items: PlaylistItem[] }
 */
app.post('/api/playlist', async (req: Request, res: Response) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "url" parameter in request body.' });
  }

  try {
    const protocol = req.protocol;
    const host = req.get('host') || `localhost:${PORT}`;
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
  res.setHeader('Content-Type', 'video/webm');
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

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`  CIRCUIT BENDING RELAY BACKEND ONLINE         `);
  console.log(`  Port: ${PORT}                                `);
  console.log(`  Endpoints:                                   `);
  console.log(`    POST /api/playlist                         `);
  console.log(`    GET  /api/stream?id=...                    `);
  console.log(`===============================================`);
});
