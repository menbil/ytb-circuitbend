import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  mode?: 'oscilloscope' | 'spectrum';
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  analyser,
  mode = 'oscilloscope'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let buffer: Uint8Array | null = null;
    if (analyser) {
      buffer = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    }

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);

      const width = canvas.width;
      const height = canvas.height;

      // Dark CRT backdrop with phosphor persistence
      ctx.fillStyle = 'rgba(8, 12, 10, 0.25)';
      ctx.fillRect(0, 0, width, height);

      // Draw oscilloscope grid
      ctx.strokeStyle = 'rgba(0, 255, 115, 0.08)';
      ctx.lineWidth = 1;

      // Grid lines
      for (let x = 0; x < width; x += 25) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Center crosshair axis
      ctx.strokeStyle = 'rgba(0, 255, 115, 0.18)';
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();

      if (!analyser || !buffer) {
        // Idle flatline with subtle jitter
        ctx.strokeStyle = '#00ff73';
        ctx.shadowColor = '#00ff73';
        ctx.shadowBlur = 4;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const idleY = height / 2 + (Math.random() - 0.5) * 1.5;
        ctx.moveTo(0, idleY);
        ctx.lineTo(width, idleY);
        ctx.stroke();
        ctx.shadowBlur = 0;
        return;
      }

      if (mode === 'oscilloscope') {
        analyser.getByteTimeDomainData(buffer as any);

        ctx.lineWidth = 2;
        ctx.strokeStyle = '#00ff88';
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 8;
        ctx.beginPath();

        const sliceWidth = width / buffer.length;
        let x = 0;

        for (let i = 0; i < buffer.length; i++) {
          const v = buffer[i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }

        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        // Frequency bars
        analyser.getByteFrequencyData(buffer as any);
        const barWidth = (width / buffer.length) * 2.5;
        let x = 0;

        ctx.fillStyle = '#00ff88';
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 6;

        for (let i = 0; i < buffer.length; i++) {
          const barHeight = (buffer[i] / 255) * height;
          ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
          x += barWidth;
        }
        ctx.shadowBlur = 0;
      }
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [analyser, mode]);

  return (
    <div className="relative border border-emerald-950/80 bg-black/90 rounded overflow-hidden shadow-inner flex flex-col w-full">
      <div className="flex items-center justify-between px-2 py-0.5 bg-neutral-900/90 border-b border-emerald-950/80 text-[8px] font-mono">
        <span className="text-emerald-400 font-bold tracking-wider flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          SCOPE // V-WAVE
        </span>
        <span className="text-neutral-500">REALTIME</span>
      </div>
      <canvas
        ref={canvasRef}
        width={260}
        height={60}
        className="w-full h-[60px] block crt-screen"
      />
    </div>
  );
};
