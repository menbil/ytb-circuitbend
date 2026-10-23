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
});

