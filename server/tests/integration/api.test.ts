import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { Server } from 'http';
import { app } from '../../src/app.js';

describe('Server API Integration Tests', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('GET /api/health should return status ok and ytDlpCmd', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(res.status, 200);

    const body = await res.json() as { status: string; engine: string; ytDlpCmd: string };
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.engine, 'ytb-circuitbend-backend');
    assert.ok(typeof body.ytDlpCmd === 'string' && body.ytDlpCmd.length > 0);
  });

  it('POST /api/playlist without url should return 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/playlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(res.status, 400);

    const body = await res.json() as { error: string };
    assert.ok(body.error.includes('Missing or invalid "url" parameter'));
  });

  it('POST /api/playlist with non-string url should return 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/playlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 12345 })
    });
    assert.strictEqual(res.status, 400);

    const body = await res.json() as { error: string };
    assert.ok(body.error.includes('Missing or invalid "url" parameter'));
  });

  it('GET /api/stream without id query should return 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/stream`);
    assert.strictEqual(res.status, 400);
    const text = await res.text();
    assert.ok(text.includes('Missing "id" query parameter'));
  });

  it('GET / should serve the dashboard HTML with proper status 200', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('CIRCUIT//BEND'));
  });

  it('GET /api/cache/status should return local disk cache info', async () => {
    const res = await fetch(`${baseUrl}/api/cache/status`);
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { cacheDir: string; cachedIds: string[]; fileCount: number };
    assert.ok(typeof body.cacheDir === 'string');
    assert.ok(Array.isArray(body.cachedIds));
    assert.strictEqual(typeof body.fileCount, 'number');
  });

  it('POST & GET /api/library/presets should persist presets to local disk', async () => {
    const samplePreset = [{ id: 'test-1', name: 'Desktop VHS Test', createdAt: 123 }];
    const postRes = await fetch(`${baseUrl}/api/library/presets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presets: samplePreset })
    });
    assert.strictEqual(postRes.status, 200);

    const getRes = await fetch(`${baseUrl}/api/library/presets`);
    assert.strictEqual(getRes.status, 200);
    const data = await getRes.json() as { presets: any[] };
    assert.ok(Array.isArray(data.presets));
    assert.strictEqual(data.presets[0].id, 'test-1');
  });

  it('POST /api/library/scan-folder should scan local studio media folder', async () => {
    const res = await fetch(`${baseUrl}/api/library/scan-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json() as { folderPath: string; items: any[]; shortcuts: any[] };
    assert.ok(typeof data.folderPath === 'string');
    assert.ok(Array.isArray(data.items));
    assert.ok(Array.isArray(data.shortcuts));
  });

  it('POST /api/yt-auth/browser should configure browser cookie extraction mode', async () => {
    const res = await fetch(`${baseUrl}/api/yt-auth/browser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ browser: 'firefox' })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json() as { ok: boolean; status: { mode: string; browser: string } };
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.status.mode, 'browser');
    assert.strictEqual(data.status.browser, 'firefox');

    // Reset back to none
    await fetch(`${baseUrl}/api/yt-auth/browser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ browser: null })
    });
  });
});

