import React, { useRef, useState, useCallback, useEffect } from 'react';

interface HardwareKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  color?: 'amber' | 'phosphor' | 'crimson' | 'electric';
  onChange: (value: number) => void;
  formatValue?: (val: number) => string;
}

const HardwareKnobComponent: React.FC<HardwareKnobProps> = ({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit = '',
  color = 'amber',
  onChange,
  formatValue
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartValue = useRef(0);

  // Normalize value to 0.0 -> 1.0 for rotation angle
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  // Angle from -135deg to +135deg (270deg sweep)
  const angle = -135 + normalized * 270;

  const colorStyles = {
    amber: {
      glow: 'shadow-[0_0_12px_rgba(255,157,0,0.5)]',
      indicator: 'bg-amber-400',
      text: 'text-amber-400',
      ring: '#ff9d00'
    },
    phosphor: {
      glow: 'shadow-[0_0_12px_rgba(0,255,115,0.5)]',
      indicator: 'bg-emerald-400',
      text: 'text-emerald-400',
      ring: '#00ff73'
    },
    crimson: {
      glow: 'shadow-[0_0_12px_rgba(255,42,75,0.5)]',
      indicator: 'bg-rose-500',
      text: 'text-rose-500',
      ring: '#ff2a4b'
    },
    electric: {
      glow: 'shadow-[0_0_12px_rgba(0,225,255,0.5)]',
      indicator: 'bg-cyan-400',
      text: 'text-cyan-400',
      ring: '#00e1ff'
    }
  }[color];

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartValue.current = value;
    document.body.style.cursor = 'ns-resize';
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const deltaY = dragStartY.current - e.clientY;
    const range = max - min;
    // 150px drag for full sweep
    const deltaValue = (deltaY / 150) * range;
    let newValue = dragStartValue.current + deltaValue;

    if (step) {
      newValue = Math.round(newValue / step) * step;
    }
    newValue = Math.max(min, Math.min(max, newValue));
    onChange(Number(newValue.toFixed(3)));
  }, [isDragging, min, max, step, onChange]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      document.body.style.cursor = 'default';
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

  const displayString = formatValue 
    ? formatValue(value) 
    : (max > 100 ? Math.round(value).toString() : (value >= 10 ? value.toFixed(1) : value.toFixed(2))) + unit;

  return (
    <div className="flex flex-col items-center select-none group">
      {/* Label */}
      <span className="text-[9px] font-bold tracking-wider uppercase text-neutral-400 mb-1 group-hover:text-neutral-200 transition-colors truncate max-w-[75px] text-center">
        {label}
      </span>

      {/* Rotary Body */}
      <div 
        onMouseDown={handleMouseDown}
        className={`relative w-11 h-11 rounded-full cursor-ns-resize transition-all duration-75 flex items-center justify-center p-0.5 ${
          isDragging ? 'scale-105' : ''
        }`}
      >
        {/* Outer Bezel with tick marks */}
        <div className="absolute inset-0 rounded-full border border-neutral-700/80 bg-gradient-to-b from-neutral-800 to-neutral-900 shadow-inner">
          <svg className="w-full h-full p-0.5" viewBox="0 0 100 100">
            {/* Background inactive track (from -135deg to +135deg = 270deg total sweep) */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="transparent"
              stroke="#242831"
              strokeWidth="5"
              strokeDasharray="188.5 251.3"
              strokeLinecap="round"
              style={{ transformOrigin: '50px 50px', transform: 'rotate(135deg)' }}
            />
            {/* Active Colored Arc (starts at 7:30 / -135deg and tracks the white pointer notch exactly) */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="transparent"
              stroke={colorStyles.ring}
              strokeWidth="5"
              strokeDasharray={`${Math.max(0.1, normalized * 188.5)} 251.3`}
              strokeLinecap="round"
              className="transition-[stroke-dasharray] duration-75"
              style={{ transformOrigin: '50px 50px', transform: 'rotate(135deg)' }}
            />
          </svg>
        </div>

        {/* Machined Metal Core Cap */}
        <div 
          className="relative w-7 h-7 rounded-full bg-gradient-to-br from-neutral-700 via-neutral-800 to-neutral-950 border border-neutral-600 shadow flex items-center justify-center pointer-events-none"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          {/* Physical pointer notch - perfectly aligns with the tip of the colored arc */}
          <div className="absolute top-0.5 w-1 h-2 rounded-full bg-white shadow-[0_0_4px_white]"></div>
          {/* Center inner cap */}
          <div className="w-2.5 h-2.5 rounded-full bg-neutral-900 border border-neutral-700"></div>
        </div>
      </div>

      {/* Numerical Readout */}
      <div className="mt-1 px-1.5 py-0.2 bg-black/90 border border-neutral-800 rounded font-mono text-[9px] text-center min-w-[42px] shadow-inner">
        <span className={`${colorStyles.text} font-semibold font-mono tracking-tight`}>
          {displayString}
        </span>
      </div>
    </div>
  );
};

export const HardwareKnob = React.memo(HardwareKnobComponent);

