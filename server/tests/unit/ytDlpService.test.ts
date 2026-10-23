import { describe, it } from 'node:test';
import assert from 'node:assert';
import { YtDlpService } from '../../src/ytDlpService.js';

describe('YtDlpService Unit Tests', () => {
  it('detectExecutable should detect an executable binary or python module', async () => {
    const service = new YtDlpService();
    const exe = await service.getExecutable();
    assert.ok(typeof exe === 'string' && exe.length > 0);
    assert.ok(exe.includes('yt-dlp') || exe.includes('python') || exe.includes('py'));
  });

  it('createStreamProcess should instantiate a child process with stream arguments', () => {
    const service = new YtDlpService();
    const child = service.createStreamProcess('dQw4w9WgXcQ');
    assert.ok(child);
    assert.ok(typeof child.pid === 'number' || child.pid === undefined);
    assert.ok(child.stdout);
    assert.ok(child.stderr);
    // Cleanup spawned child immediately
    try {
      child.kill('SIGTERM');
    } catch {}
  });

  it('parseUrl should throw a descriptive error when parsing an invalid url', async () => {
    const service = new YtDlpService();
    await assert.rejects(
      async () => {
        await service.parseUrl('https://invalid-url-that-does-not-exist.example.org', 'http://localhost:3001');
      },
      (err: Error) => {
        assert.ok(err.message.includes('yt-dlp') || err.message.includes('Failed to parse'));
        return true;
      }
    );
  });
});

