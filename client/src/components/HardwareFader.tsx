import React, { useRef, useState, useCallback, useEffect } from 'react';

interface HardwareFaderProps {
  label: string;
  value: number; // 0.0 -> 1.0
  min?: number;
  max?: number;
  step?: number;
  height?: number;
  color?: 'amber' | 'phosphor' | 'crimson';
  onChange: (val: number) => void;
  formatValue?: (val: number) => string;
}

export const HardwareFader: React.FC<HardwareFaderProps> = ({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  height = 140,
  color = 'amber',
  onChange,
  formatValue
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const handlePointer = useCallback((clientY: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    // Invert: top is 1.0, bottom is 0.0
    const rawRatio = 1 - (relativeY / rect.height);
    const clamped = Math.max(0, Math.min(1, rawRatio));
    let newVal = min + clamped * (max - min);
    if (step) {
      newVal = Math.round(newVal / step) * step;
    }
    onChange(Number(newVal.toFixed(3)));
  }, [min, max, step, onChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handlePointer(e.clientY);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      handlePointer(e.clientY);
    }
  }, [isDragging, handlePointer]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
    }
  }, [isDragging]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const displayString = formatValue ? formatValue(value) : `${Math.round(normalized * 100)}%`;

  return (
    <div className="flex flex-col items-center select-none group">
      <span className="text-[10px] font-bold tracking-wider uppercase text-neutral-400 mb-2">
        {label}
      </span>

      {/* Fader Track Container */}
      <div 
        ref={trackRef}
        onMouseDown={handleMouseDown}
        style={{ height: `${height}px` }}
        className="relative w-8 bg-neutral-950 border border-neutral-800 rounded-sm shadow-rack-inset flex justify-center cursor-pointer p-1"
      >
        {/* Scale tick marks */}
        <div className="absolute left-1 top-2 bottom-2 flex flex-col justify-between pointer-events-none opacity-40">
          <div className="w-1.5 h-px bg-neutral-400"></div>
          <div className="w-1 h-px bg-neutral-500"></div>
          <div className="w-1.5 h-px bg-neutral-400"></div>
          <div className="w-1 h-px bg-neutral-500"></div>
          <div className="w-2 h-px bg-amber-500"></div>
          <div className="w-1 h-px bg-neutral-500"></div>
          <div className="w-1.5 h-px bg-neutral-400"></div>
        </div>

        {/* Center Slot */}
        <div className="w-1.5 h-full bg-neutral-900 border-x border-black/80 rounded-full relative">
          {/* Active Level Glow Fill */}
          <div 
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-amber-600/40 to-amber-500/80 rounded-full"
            style={{ height: `${normalized * 100}%` }}
          ></div>
        </div>

        {/* Machined Fader Cap Handle */}
        <div 
          className="absolute left-1 right-1 h-6 -ml-0 -mt-3 rounded bg-gradient-to-b from-neutral-600 via-neutral-700 to-neutral-900 border border-neutral-500 shadow-rack-raised flex items-center justify-center transition-transform pointer-events-none"
          style={{ bottom: `${normalized * (height - 24)}px` }}
        >
          {/* Center colored indicator line */}
          <div className="w-full h-0.5 bg-amber-400 shadow-[0_0_6px_#ff9d00]"></div>
        </div>
      </div>

      <div className="mt-2 px-1.5 py-0.5 bg-black/80 border border-neutral-800 rounded font-mono text-[10px] text-center min-w-[46px]">
        <span className="text-amber-400 font-semibold">{displayString}</span>
      </div>
    </div>
  );
};

