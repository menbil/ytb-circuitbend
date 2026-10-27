import React, { useRef, useState, useCallback, useEffect } from 'react';
import { ModRouting, ModSourceId, ModTargetPath } from '../types/index.js';

interface HardwareKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  color?: 'amber' | 'phosphor' | 'crimson' | 'electric';
  onChange: (value: number) => void;
  formatValue?: (val: number) => string;

  // Modulation Ring & Drag-and-Drop Routing Props
  modTarget?: ModTargetPath;
  modulatedValue?: number;
  modulations?: ModRouting[];
  onDropModSource?: (source: ModSourceId, target: ModTargetPath) => void;
  onUpdateModAmount?: (routingId: string, amount: number) => void;
  onToggleModBipolar?: (routingId: string) => void;
  onRemoveMod?: (routingId: string) => void;
}

const SOURCE_META: Record<ModSourceId, { short: string; color: string; badgeBg: string }> = {
  lfo1: { short: 'L1', color: '#a855f7', badgeBg: 'bg-purple-600/90 border-purple-400 text-white' },
  lfo2: { short: 'L2', color: '#06b6d4', badgeBg: 'bg-cyan-600/90 border-cyan-300 text-white' },
  envAudio: { short: 'ENV', color: '#10b981', badgeBg: 'bg-emerald-600/90 border-emerald-300 text-white' },
  macroX: { short: 'MX', color: '#f59e0b', badgeBg: 'bg-amber-500/90 border-amber-300 text-black' },
  macroY: { short: 'MY', color: '#f43f5e', badgeBg: 'bg-rose-600/90 border-rose-300 text-white' }
};

const HardwareKnobComponent: React.FC<HardwareKnobProps> = ({
  label,
  value,
  min,
  max,
  step = 0.01,
  defaultValue,
  unit = '',
  color = 'amber',
  onChange,
  formatValue,
  modTarget,
  modulatedValue,
  modulations = [],
  onDropModSource,
  onUpdateModAmount,
  onToggleModBipolar,
  onRemoveMod
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [draggingModId, setDraggingModId] = useState<string | null>(null);
  const dragStartY = useRef(0);
  const dragStartValue = useRef(0);
  const modDragStartY = useRef(0);
  const modDragStartAmt = useRef(0);

  // Normalize base value to 0.0 -> 1.0 for rotation angle
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = -135 + normalized * 270;

  // Normalize live modulated value if present
  const hasModulation = modulations.length > 0;
  const effectiveLiveVal = modulatedValue !== undefined ? modulatedValue : value;
  const normalizedLive = Math.max(0, Math.min(1, (effectiveLiveVal - min) / (max - min)));
  const liveAngle = -135 + normalizedLive * 270;

  // Primary modulation arc preview
  const primaryMod = modulations[0];
  const primaryMeta = primaryMod ? SOURCE_META[primaryMod.source] : null;
  const modSpanNorm = primaryMod
    ? Math.max(0, Math.min(1, normalized + primaryMod.amount))
    : normalized;

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
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartValue.current = value;
    document.body.style.cursor = 'ns-resize';
  };

  const handleDoubleClick = () => {
    const resetVal = defaultValue !== undefined ? defaultValue : min;
    onChange(Number(resetVal.toFixed(3)));
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    const fineFactor = e.shiftKey ? 0.25 : 1.0;
    const delta = dir * (step || (max - min) * 0.02) * fineFactor;
    const next = Math.max(min, Math.min(max, value + delta));
    onChange(Number(next.toFixed(3)));
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const deltaY = dragStartY.current - e.clientY;
    const range = max - min;
    const sensitivity = e.shiftKey ? 650 : 150;
    const deltaValue = (deltaY / sensitivity) * range;
    let newValue = dragStartValue.current + deltaValue;

    if (step && !e.shiftKey) {
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

  // Modulation Depth Drag Handler (vertical drag on source badge)
  useEffect(() => {
    if (!draggingModId || !onUpdateModAmount) return;

    const onMove = (e: MouseEvent) => {
      const dy = modDragStartY.current - e.clientY;
      const nextAmt = Math.max(-1.0, Math.min(1.0, modDragStartAmt.current + dy / 90));
      onUpdateModAmount(draggingModId, Number(nextAmt.toFixed(2)));
    };
    const onUp = () => {
      setDraggingModId(null);
      document.body.style.cursor = 'default';
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingModId, onUpdateModAmount]);

  // HTML5 Drag & Drop Handlers for Modulation Assignment
  const handleDragOver = (e: React.DragEvent) => {
    if (!modTarget || !onDropModSource) return;
    if (e.dataTransfer.types.includes('application/x-circuitbend-mod')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'link';
      if (!isDragOver) setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!modTarget || !onDropModSource) return;
    const source = e.dataTransfer.getData('application/x-circuitbend-mod') as ModSourceId;
    if (source) {
      onDropModSource(source, modTarget);
    }
  };

  const shownVal = (!isDragging && hasModulation && modulatedValue !== undefined) ? modulatedValue : value;
  const displayString = formatValue 
    ? formatValue(shownVal) 
    : (max > 100 ? Math.round(shownVal).toString() : (shownVal >= 10 ? shownVal.toFixed(1) : shownVal.toFixed(2))) + unit;

  const outerCircumference = 2 * Math.PI * 46;
  const outerSweepTotal = outerCircumference * 0.75;
  const arcStartNorm = Math.min(normalized, modSpanNorm);
  const arcEndNorm = Math.max(normalized, modSpanNorm);
  const arcLength = Math.max(2, (arcEndNorm - arcStartNorm) * outerSweepTotal);
  const arcOffsetRotation = 135 + arcStartNorm * 270;
  const activeArcNorm = (!isDragging && hasModulation) ? normalizedLive : normalized;

  return (
    <div 
      className={`flex flex-col items-center select-none group relative rounded-lg p-0.5 transition-all ${
        isDragOver ? 'ring-2 ring-purple-400 bg-purple-950/50 scale-105 shadow-[0_0_16px_#a855f7]' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      title={`${label} • Glisser verticalement • Shift+Glisser = Précision • Double-clic = Réinitialiser`}
    >
      {/* Label */}
      <span className="text-[9px] font-bold tracking-wider uppercase text-neutral-400 mb-0.5 group-hover:text-neutral-200 transition-colors truncate max-w-[76px] text-center">
        {label}
      </span>

      {/* Rotary Body */}
      <div 
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        className={`relative w-11 h-11 rounded-full cursor-ns-resize transition-all duration-75 flex items-center justify-center p-0.5 ${
          isDragging ? 'scale-105' : ''
        }`}
      >
        {/* Outer Bezel with tick marks & Modulation Ring */}
        <div className="absolute inset-0 rounded-full border border-neutral-700/80 bg-gradient-to-b from-neutral-800 to-neutral-900 shadow-inner">
          <svg className="w-full h-full p-0.5" viewBox="0 0 100 100">
            {/* Background inactive track */}
            <circle
              cx="50"
              cy="50"
              r="39"
              fill="transparent"
              stroke="#242831"
              strokeWidth="5"
              strokeDasharray="183.8 245.0"
              strokeLinecap="round"
              style={{ transformOrigin: '50px 50px', transform: 'rotate(135deg)' }}
            />
            {/* Active Colored Base/Live Arc */}
            <circle
              cx="50"
              cy="50"
              r="39"
              fill="transparent"
              stroke={colorStyles.ring}
              strokeWidth="5"
              strokeDasharray={`${Math.max(0.1, activeArcNorm * 183.8)} 245.0`}
              strokeLinecap="round"
              style={{ transformOrigin: '50px 50px', transform: 'rotate(135deg)' }}
            />

            {/* OUTER MODULATION RANGE RING */}
            {hasModulation && primaryMeta && (
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="transparent"
                stroke={primaryMeta.color}
                strokeWidth="3.5"
                strokeDasharray={`${arcLength} ${outerCircumference}`}
                strokeLinecap="round"
                style={{
                  transformOrigin: '50px 50px',
                  transform: `rotate(${arcOffsetRotation}deg)`,
                  filter: `drop-shadow(0 0 3px ${primaryMeta.color})`
                }}
              />
            )}
          </svg>
        </div>

        {/* Live Modulated Ghost Pointer */}
        {hasModulation && primaryMeta && (
          <div
            className="absolute inset-0 pointer-events-none flex items-center justify-center"
            style={{ transform: `rotate(${liveAngle}deg)` }}
          >
            <div
              className="absolute -top-0.5 w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: primaryMeta.color,
                boxShadow: `0 0 6px ${primaryMeta.color}`
              }}
            />
          </div>
        )}

        {/* Machined Metal Core Cap */}
        <div 
          className="relative w-7 h-7 rounded-full bg-gradient-to-br from-neutral-700 via-neutral-800 to-neutral-950 border border-neutral-600 shadow flex items-center justify-center pointer-events-none"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <div className="absolute top-0.5 w-1 h-2 rounded-full bg-white shadow-[0_0_4px_white]"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-neutral-900 border border-neutral-700"></div>
        </div>
      </div>

      {/* Numerical Readout + Assigned Modulation Badges */}
      <div className="mt-0.5 flex flex-col items-center gap-0.5">
        <div className="px-1.5 py-0.2 bg-black/90 border border-neutral-800 rounded font-mono text-[9px] text-center min-w-[42px] shadow-inner">
          <span className={`${colorStyles.text} font-semibold font-mono tracking-tight`}>
            {displayString}
          </span>
        </div>

        {hasModulation && (
          <div className="flex items-center gap-0.5 flex-wrap justify-center max-w-[76px]">
            {modulations.map((m) => {
              const meta = SOURCE_META[m.source];
              return (
                <button
                  key={m.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    if (e.button === 0) {
                      setDraggingModId(m.id);
                      modDragStartY.current = e.clientY;
                      modDragStartAmt.current = m.amount;
                      document.body.style.cursor = 'ns-resize';
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onToggleModBipolar) onToggleModBipolar(m.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onRemoveMod) onRemoveMod(m.id);
                  }}
                  className={`px-1 py-0 rounded text-[7px] font-mono font-bold border cursor-ns-resize flex items-center gap-0.5 ${meta.badgeBg}`}
                  title={`${meta.short}: ${Math.round(m.amount * 100)}% (${m.bipolar ? 'Bipolaire ±' : 'Unipolaire +'}) • Glisser H/B = Amplitude • Clic = Polarité • Clic-droit = Retirer`}
                >
                  <span>{meta.short}</span>
                  <span>{m.amount >= 0 ? `+${Math.round(m.amount * 100)}` : Math.round(m.amount * 100)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export const HardwareKnob = React.memo(HardwareKnobComponent);
