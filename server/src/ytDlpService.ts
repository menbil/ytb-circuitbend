import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { PlaylistItem, PlaylistResponse } from './types.js';

const execAsync = promisify(exec);

export class YtDlpService {
  private pythonCmd: string = 'python';
  private usePythonModule: boolean = true;

  constructor() {
    this.detectExecutable();
  }

  private async detectExecutable() {
    try {
      await execAsync('python --version');
      this.pythonCmd = 'python';
      this.usePythonModule = true;
    } catch {
      this.pythonCmd = 'py';
      this.usePythonModule = true;
    }
  }

  public async getExecutable(): Promise<string> {
    return `${this.pythonCmd} -m yt_dlp`;
  }

  /**
   * Parse a YouTube playlist or single video URL and return metadata
   */
  public async parseUrl(url: string, baseUrl: string): Promise<PlaylistResponse> {
    await this.detectExecutable();

    return new Promise((resolve, reject) => {
      // Direct python execution without cmd.exe shell interference
      const args = [
        '-m',
        'yt_dlp',
        '--flat-playlist',
        '-J',
        '--no-warnings',
        '--no-check-certificates',
        url
      ];

      console.log(`[yt-dlp] Fetching metadata for ${url}...`);

      const child = spawn(this.pythonCmd, args, { shell: false });
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
            throw new Error('No JSON output from yt-dlp');
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

    // Format: VP9 / AV1 / WebM video combined with Opus audio in true WebM container
    const args = [
      '-m',
      'yt_dlp',
      '-f',
      'bv*[vcodec^=vp9][height<=720]+ba[acodec=opus]/bv*[vcodec^=vp9]+ba[acodec=opus]/bv*[vcodec^=av01]+ba[acodec=opus]/bv*[ext=webm]+ba[ext=webm]/bv*[height<=720]+ba/best',
      '--no-playlist',
      '--no-warnings',
      '--no-part',
      '-o',
      '-',
      targetUrl
    ];

    console.log(`[yt-dlp] Spawning stream for ${targetUrl} (shell=false)`);
    // CRITICAL: shell: false avoids Windows cmd.exe treating <= as file redirections
    return spawn(this.pythonCmd, args, { shell: false });
  }
}
