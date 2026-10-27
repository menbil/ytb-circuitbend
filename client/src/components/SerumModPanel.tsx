import React, { useRef, useState, useEffect } from 'react';
import {
  LfoConfig,
  LfoShape,
  LfoTargetId,
  ModRouting,
  ModSourceId,
  ModTargetPath,
  MsegPoint,
  BpmSyncDivision,
  SerumLfoUnit,
  Preset,
  UserPreset,
  AudioParamKey,
  VideoParamKey
} from '../types/index.js';
import { GripHorizontal, Trash2, Sparkles, Crosshair, Shuffle, Clock, RotateCcw } from 'lucide-react';

interface SerumModPanelProps {
  lfoConfig: LfoConfig;
  onUpdateLfo: (partial: Partial<LfoConfig>) => void;
  modRoutings: ModRouting[];
  onAddOrUpdateRouting: (source: ModSourceId, target: ModTargetPath, amount?: number) => void;
  onUpdateRoutingAmount: (id: string, amount: number) => void;
  onToggleRoutingBipolar: (id: string) => void;
  onRemoveRouting: (id: string) => void;
  onClearRoutings: () => void;
  liveSourcesRef: React.MutableRefObject<Record<ModSourceId, number>>;
  macroXY: { x: number; y: number };
  onChangeMacroXY: (x: number, y: number) => void;
  xyHold: boolean;
  onToggleXyHold: () => void;
  bpm: number;
  onChangeBpm: (bpm: number) => void;
  onTapTempo: () => void;
  // A/B Preset Morphing
  presets: Preset[];
  userPresets: UserPreset[];
  morphSlotA: string;
  morphSlotB: string;
  morphAmount: number;
  onSelectMorphSlotA: (id: string) => void;
  onSelectMorphSlotB: (id: string) => void;
  onChangeMorphAmount: (val: number) => void;
}

export const SHAPE_POINTS: Record<Exclude<LfoShape, 'custom'>, MsegPoint[]> = {
  sine: [
    { x: 0.0, y: 0.5 },
    { x: 0.25, y: 1.0 },
    { x: 0.5, y: 0.5 },
    { x: 0.75, y: 0.0 },
    { x: 1.0, y: 0.5 }
  ],
  triangle: [
    { x: 0.0, y: 0.0 },
    { x: 0.5, y: 1.0 },
    { x: 1.0, y: 0.0 }
  ],
  saw: [
    { x: 0.0, y: 0.0 },
    { x: 0.99, y: 1.0 },
    { x: 1.0, y: 0.0 }
  ],
  sawDown: [
    { x: 0.0, y: 1.0 },
    { x: 0.99, y: 0.0 },
    { x: 1.0, y: 1.0 }
  ],
  square: [
    { x: 0.0, y: 1.0 },
    { x: 0.49, y: 1.0 },
    { x: 0.5, y: 0.0 },
    { x: 0.99, y: 0.0 },
    { x: 1.0, y: 1.0 }
  ],
  random: [
    { x: 0.0, y: 0.2 },
    { x: 0.25, y: 0.85 },
    { x: 0.5, y: 0.15 },
    { x: 0.75, y: 0.9 },
    { x: 1.0, y: 0.2 }
  ],
  drift: [
    { x: 0.0, y: 0.4 },
    { x: 0.3, y: 0.75 },
    { x: 0.65, y: 0.25 },
    { x: 1.0, y: 0.4 }
  ]
};

export const getEffectiveLfoRateHz = (
  syncDivision: BpmSyncDivision | undefined,
  freeRate: number,
  bpm: number
): number => {
  const beatsPerSec = (bpm || 120) / 60;
  switch (syncDivision) {
    case '1/1':
      return beatsPerSec / 4;
    case '1/2':
      return beatsPerSec / 2;
    case '1/4':
      return beatsPerSec;
    case '1/8':
      return beatsPerSec * 2;
    case '1/16':
      return beatsPerSec * 4;
    default:
      return freeRate;
  }
};

export const SerumModPanel: React.FC<SerumModPanelProps> = ({
  lfoConfig,
  onUpdateLfo,
  modRoutings,
  onUpdateRoutingAmount,
  onToggleRoutingBipolar,
  onRemoveRouting,
  onClearRoutings,
  liveSourcesRef,
  macroXY,
  onChangeMacroXY,
  xyHold,
  onToggleXyHold,
  bpm,
  onChangeBpm,
  onTapTempo,
  presets,
  userPresets,
  morphSlotA,
  morphSlotB,
  morphAmount,
  onSelectMorphSlotA,
  onSelectMorphSlotB,
  onChangeMorphAmount
}) => {
  const [activeLfoTab, setActiveLfoTab] = useState<'lfo1' | 'lfo2' | 'envAudio' | 'matrix'>('lfo1');
  const [draggingPointIdx, setDraggingPointIdx] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const envHistoryRef = useRef<number[]>(new Array(80).fill(0));
  const xyPadRef = useRef<HTMLDivElement | null>(null);
  const [isDraggingXY, setIsDraggingXY] = useState(false);
  const [xyMotionMode, setXyMotionMode] = useState<'idle' | 'armed' | 'recording' | 'playing'>('idle');
  const [xyRecordedPath, setXyRecordedPath] = useState<{ x: number; y: number; t: number }[]>([]);
  const xyRecordStartRef = useRef<number>(0);
  const xyRecordedPathRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const [slotADragOver, setSlotADragOver] = useState(false);
  const [slotBDragOver, setSlotBDragOver] = useState(false);

  // Resolve active LFO unit (LFO 1 vs LFO 2) with full independent curve points, shape, rate & sync
  const lfo1Unit: SerumLfoUnit = lfoConfig.lfo1 || {
    id: 'lfo1',
    enabled: true,
    shape: lfoConfig.shape || 'sine',
    rate: lfoConfig.rate || 1.0,
    syncDivision: 'free',
    smooth: 0,
    points: lfoConfig.shape !== 'custom' && SHAPE_POINTS[lfoConfig.shape] ? SHAPE_POINTS[lfoConfig.shape] : SHAPE_POINTS.sine
  };

  const lfo2Unit: SerumLfoUnit = lfoConfig.lfo2 || {
    id: 'lfo2',
    enabled: true,
    shape: 'triangle',
    rate: Number((lfoConfig.rate * 1.5).toFixed(2)) || 1.5,
    syncDivision: 'free',
    smooth: 0,
    points: SHAPE_POINTS.triangle
  };

  const isEditingLfo2 = activeLfoTab === 'lfo2';
  const currentUnit = isEditingLfo2 ? lfo2Unit : lfo1Unit;
  const activePoints = currentUnit.points && currentUnit.points.length >= 2 ? currentUnit.points : SHAPE_POINTS.sine;
  const effectiveRateHz = getEffectiveLfoRateHz(currentUnit.syncDivision, currentUnit.rate, bpm);

  const updateCurrentUnit = (patch: Partial<SerumLfoUnit>) => {
    const updated: SerumLfoUnit = {
      ...currentUnit,
      ...patch
    };
    if (isEditingLfo2) {
      onUpdateLfo({ enabled: true, lfo2: updated });
    } else {
      onUpdateLfo({
        enabled: true,
        shape: updated.shape,
        rate: getEffectiveLfoRateHz(updated.syncDivision, updated.rate, bpm),
        lfo1: updated
      });
    }
  };

  // Draw Interactive MSEG Curve or Live Audio Envelope Follower Trace at 60fps
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Push latest audio envelope sample into history
      const envVal = Math.max(0, Math.min(1, liveSourcesRef.current.envAudio || 0));
      envHistoryRef.current.push(envVal);
      if (envHistoryRef.current.length > 80) {
        envHistoryRef.current.shift();
      }

      // Subtle background grid
      ctx.strokeStyle = activeLfoTab === 'envAudio' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(168, 85, 247, 0.14)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo((w * i) / 4, 0);
        ctx.lineTo((w * i) / 4, h);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (activeLfoTab === 'envAudio') {
        const hist = envHistoryRef.current;
        ctx.beginPath();
        hist.forEach((v, idx) => {
          const px = (idx / (hist.length - 1)) * w;
          const py = (1 - v * 0.9) * h - 2;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2.2;
        ctx.stroke();

        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
        ctx.fillStyle = grad;
        ctx.fill();

        animId = requestAnimationFrame(render);
        return;
      }

      // Draw MSEG curve fill & stroke for the currently selected LFO (LFO 1 or LFO 2)
      const pts = activePoints;
      if (pts.length >= 2) {
        ctx.beginPath();
        if (currentUnit.shape === 'sine') {
          // Smooth sine preview when pure sine shape is selected
          for (let px = 0; px <= w; px += 2) {
            const p = px / w;
            const sy = (Math.sin(p * Math.PI * 2) + 1) / 2;
            const py = (1 - sy) * h;
            if (px === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
        } else {
          ctx.moveTo(pts[0].x * w, (1 - pts[0].y) * h);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x * w, (1 - pts[i].y) * h);
          }
        }
        ctx.strokeStyle = isEditingLfo2 ? '#06b6d4' : '#c084fc';
        ctx.lineWidth = 2.2;
        ctx.stroke();

        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, isEditingLfo2 ? 'rgba(6, 182, 212, 0.32)' : 'rgba(168, 85, 247, 0.32)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Draw draggable nodes
      pts.forEach((p, idx) => {
        const px = p.x * w;
        const py = (1 - p.y) * h;
        ctx.beginPath();
        ctx.arc(px, py, idx === draggingPointIdx ? 5.5 : 4, 0, Math.PI * 2);
        ctx.fillStyle = idx === draggingPointIdx ? '#ffffff' : (isEditingLfo2 ? '#22d3ee' : '#e879f9');
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      });

      // Live Playhead & Output Dot synchronized with effectiveRateHz
      const now = performance.now() / 1000;
      const phase = ((now * effectiveRateHz) % 1.0 + 1.0) % 1.0;
      const playX = phase * w;

      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, h);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();

      let liveVal = isEditingLfo2 ? liveSourcesRef.current.lfo2 : liveSourcesRef.current.lfo1;
      if (currentUnit.shape === 'sine') {
        liveVal = (Math.sin(phase * Math.PI * 2) + 1) / 2;
      } else if (currentUnit.shape !== 'random' && currentUnit.shape !== 'drift' && pts.length >= 2) {
        liveVal = pts[pts.length - 1].y;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          if (phase >= a.x && phase <= b.x) {
            const span = Math.max(0.0001, b.x - a.x);
            liveVal = a.y + (b.y - a.y) * ((phase - a.x) / span);
            break;
          }
        }
      }
      const playY = (1 - Math.max(0, Math.min(1, liveVal))) * h;
      ctx.beginPath();
      ctx.arc(playX, playY, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [activePoints, currentUnit.shape, draggingPointIdx, activeLfoTab, isEditingLfo2, effectiveRateHz, liveSourcesRef]);

  // MSEG Canvas Mouse Interaction (Drag node, Double-click to add, Right-click to delete)
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeLfoTab === 'envAudio') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));

    const hitIdx = activePoints.findIndex(
      (p) => Math.hypot(p.x - nx, p.y - ny) < 0.08
    );

    if (e.button === 2) {
      if (hitIdx > 0 && hitIdx < activePoints.length - 1) {
        const next = activePoints.filter((_, i) => i !== hitIdx);
        updateCurrentUnit({ shape: 'custom', points: next });
      }
      return;
    }

    if (hitIdx !== -1) {
      setDraggingPointIdx(hitIdx);
    }
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeLfoTab === 'envAudio') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.max(0.01, Math.min(0.99, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));

    const next = [...activePoints, { x: Number(nx.toFixed(3)), y: Number(ny.toFixed(3)) }].sort(
      (a, b) => a.x - b.x
    );
    updateCurrentUnit({ shape: 'custom', points: next });
  };

  useEffect(() => {
    if (draggingPointIdx === null) return;
    const onMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      let nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const ny = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));

      const copy = [...activePoints];
      if (draggingPointIdx === 0) nx = 0;
      else if (draggingPointIdx === copy.length - 1) nx = 1;
      else {
        const minX = copy[draggingPointIdx - 1].x + 0.01;
        const maxX = copy[draggingPointIdx + 1].x - 0.01;
        nx = Math.max(minX, Math.min(maxX, nx));
      }
      copy[draggingPointIdx] = { x: Number(nx.toFixed(3)), y: Number(ny.toFixed(3)) };
      updateCurrentUnit({ shape: 'custom', points: copy });
    };
    const onUp = () => setDraggingPointIdx(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingPointIdx, activePoints, isEditingLfo2, currentUnit]);

  // X/Y Vector Pad Mouse Tracking & Motion Looper
  const updateXYFromEvent = (clientX: number, clientY: number, isRecordingSample = false) => {
    if (!xyPadRef.current) return;
    const rect = xyPadRef.current.getBoundingClientRect();
    const x = Number(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)).toFixed(3));
    const y = Number(Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height)).toFixed(3));
    onChangeMacroXY(x, y);

    if (isRecordingSample) {
      const elapsed = performance.now() - xyRecordStartRef.current;
      const sample = { x, y, t: elapsed };
      xyRecordedPathRef.current.push(sample);
      setXyRecordedPath([...xyRecordedPathRef.current]);
    }
  };

  useEffect(() => {
    if (!isDraggingXY) return;
    const recordingActive = xyMotionMode === 'recording';
    const onMove = (e: MouseEvent) => updateXYFromEvent(e.clientX, e.clientY, recordingActive);
    const onUp = () => {
      setIsDraggingXY(false);
      if (recordingActive && xyRecordedPathRef.current.length >= 2) {
        setXyMotionMode('playing');
      } else if (!xyHold && xyMotionMode !== 'playing') {
        onChangeMacroXY(0.5, 0.5);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDraggingXY, xyHold, xyMotionMode]);

  // Replay recorded X/Y trajectory in a continuous loop at 60fps
  useEffect(() => {
    if (xyMotionMode !== 'playing' || isDraggingXY) return;
    const path = xyRecordedPathRef.current;
    if (path.length < 2) {
      setXyMotionMode('idle');
      return;
    }

    const totalDuration = Math.max(250, path[path.length - 1].t);
    const loopStart = performance.now();
    let animId: number;

    const tick = () => {
      const elapsed = (performance.now() - loopStart) % totalDuration;
      let pt = path[path.length - 1];
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        if (elapsed >= a.t && elapsed <= b.t) {
          const span = Math.max(1, b.t - a.t);
          const ratio = (elapsed - a.t) / span;
          pt = {
            x: Number((a.x + (b.x - a.x) * ratio).toFixed(3)),
            y: Number((a.y + (b.y - a.y) * ratio).toFixed(3)),
            t: elapsed
          };
          break;
        }
      }
      onChangeMacroXY(pt.x, pt.y);
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [xyMotionMode, isDraggingXY]);

  const handleSyncDivisionChange = (div: BpmSyncDivision) => {
    const newHz = getEffectiveLfoRateHz(div, currentUnit.rate, bpm);
    updateCurrentUnit({
      syncDivision: div,
      rate: Number(Math.max(0.1, Math.min(12, newHz)).toFixed(2))
    });
  };

  const draggableSources: { id: ModSourceId; label: string; desc: string; colorClass: string }[] = [
    {
      id: 'lfo1',
      label: '∿ LFO 1',
      desc: 'Oscillateur principal à enveloppe multi-segments (Glisser-déposer sur une commande)',
      colorClass: 'bg-purple-600/90 border-purple-300 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]'
    },
    {
      id: 'lfo2',
      label: '∿ LFO 2',
      desc: 'Oscillateur secondaire indépendant (Glisser-déposer sur une commande)',
      colorClass: 'bg-cyan-600/90 border-cyan-300 text-white shadow-[0_0_10px_rgba(6,182,212,0.5)]'
    },
    {
      id: 'envAudio',
      label: '⚡ ENV AUDIO',
      desc: 'Suiveur d’enveloppe dynamique (Kick / Basses) : module n’importe quel paramètre en rythme avec le son',
      colorClass: 'bg-emerald-600/90 border-emerald-300 text-white shadow-[0_0_10px_rgba(16,185,129,0.5)]'
    },
    {
      id: 'macroX',
      label: '✥ MACRO X',
      desc: 'Axe horizontal X du Vector Pad 2D (Glisser-déposer sur une commande)',
      colorClass: 'bg-amber-500 border-amber-200 text-black shadow-[0_0_10px_rgba(245,158,11,0.5)]'
    },
    {
      id: 'macroY',
      label: '✥ MACRO Y',
      desc: 'Axe vertical Y du Vector Pad 2D (Glisser-déposer sur une commande)',
      colorClass: 'bg-rose-600 border-rose-300 text-white shadow-[0_0_10px_rgba(244,63,94,0.5)]'
    }
  ];

  const allPresetsList = [
    ...presets.map((p) => ({ id: p.id, name: p.name })),
    ...userPresets.map((u) => ({ id: u.id, name: `★ ${u.name}` }))
  ];

  return (
    <div className="px-4 py-2.5 bg-gradient-to-r from-purple-950/30 via-neutral-950/25 to-cyan-950/30 border-b border-purple-700/50 font-mono text-xs flex flex-col gap-2.5">
      {/* ROW 1: MODULATION SOURCES BAR + BPM CLOCK / TAP TEMPO */}
      <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-purple-800/40">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-purple-300 flex items-center gap-1 text-[11px]">
            <Sparkles size={12} className="text-purple-400" />
            MODULATION SOURCES :
          </span>

          {draggableSources.map((src) => {
            const count = modRoutings.filter((r) => r.source === src.id).length;
            const isSelected = activeLfoTab === src.id;
            return (
              <div
                key={src.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-circuitbend-mod', src.id);
                  e.dataTransfer.effectAllowed = 'link';
                  if (!lfoConfig.enabled) {
                    onUpdateLfo({ enabled: true });
                  }
                }}
                onClick={() => {
                  if (src.id === 'lfo1' || src.id === 'lfo2' || src.id === 'envAudio') {
                    setActiveLfoTab(src.id);
                  }
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-grab active:cursor-grabbing flex items-center gap-1 transition-all hover:scale-105 ${src.colorClass} ${
                  isSelected ? 'ring-2 ring-white' : ''
                }`}
                title={src.desc}
              >
                <GripHorizontal size={10} />
                <span>{src.label}</span>
                {count > 0 && (
                  <span className="px-1 rounded-full bg-black/50 text-[8px] font-extrabold">
                    {count}
                  </span>
                )}
              </div>
            );
          })}

          <span className="text-[9px] text-purple-300/75 hidden xl:inline ml-1">
            (Cliquez sur LFO 1 / LFO 2 pour éditer sa courbe • Glissez sur un paramètre)
          </span>
        </div>

        {/* Right: Master LFO Enable + Tap Tempo BPM Clock */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded border border-neutral-800">
            <Clock size={10} className="text-amber-400" />
            <span className="text-[9px] text-neutral-400">BPM:</span>
            <input
              type="number"
              min={40}
              max={220}
              value={bpm}
              onChange={(e) => onChangeBpm(Math.max(40, Math.min(220, Number(e.target.value) || 120)))}
              className="w-11 bg-transparent text-amber-300 font-bold text-[10px] focus:outline-none text-center"
            />
            <button
              type="button"
              onClick={onTapTempo}
              className="px-1.5 py-0.2 rounded bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/50 text-[9px] font-bold"
              title="Cliquez plusieurs fois en rythme pour synchroniser la vitesse des LFOs au BPM"
            >
              TAP
            </button>
          </div>

          <button
            type="button"
            onClick={() => setActiveLfoTab(activeLfoTab === 'matrix' ? 'lfo1' : 'matrix')}
            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
              activeLfoTab === 'matrix'
                ? 'bg-cyan-500 text-black border-cyan-300'
                : 'bg-neutral-900 text-cyan-300 border-cyan-800 hover:bg-neutral-800'
            }`}
          >
            ROUTES ({modRoutings.length})
          </button>

          <button
            type="button"
            onClick={() => onUpdateLfo({ enabled: !lfoConfig.enabled })}
            className={`px-2.5 py-0.5 rounded text-[11px] font-bold border transition-all ${
              lfoConfig.enabled
                ? 'bg-purple-600 text-white border-purple-300 shadow-[0_0_12px_#a855f7]'
                : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:text-white'
            }`}
          >
            {lfoConfig.enabled ? '● ENGINE ON' : '○ BYPASS'}
          </button>
        </div>
      </div>

      {/* ROW 2: 3-COLUMN WORKSPACE -> [1. MSEG / ENV GRAPH (4 cols)] + [2. TARGETS & PATCH MORPH A/B (4 cols)] + [3. LARGE 2D VECTOR PAD X/Y (4 cols)] */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        {/* COL 1-4: INTERACTIVE MSEG WAVEFORM / AUDIO ENVELOPE GRAPH */}
        <div className="lg:col-span-4 bg-black/25 border border-purple-800/60 rounded-lg p-2 flex flex-col justify-between gap-1.5">
          <div className="flex items-center justify-between gap-1 flex-wrap">
            {activeLfoTab === 'envAudio' ? (
              <span className="text-[9px] font-bold text-emerald-400">
                ⚡ SUIVEUR D’ENVELOPPE AUDIO (DÉTECTION KICK / SUB-BASS EN DIRECT)
              </span>
            ) : (
              <div className="flex items-center gap-1 flex-wrap">
                <span className={`text-[9px] font-extrabold mr-0.5 ${isEditingLfo2 ? 'text-cyan-300' : 'text-purple-300'}`}>
                  {isEditingLfo2 ? 'LFO 2:' : 'LFO 1:'}
                </span>
                {[
                  { id: 'sine', label: '∿ SINE' },
                  { id: 'triangle', label: '/\\ TRI' },
                  { id: 'saw', label: '⩘ SAW' },
                  { id: 'sawDown', label: '⩗ SAW-DN' },
                  { id: 'square', label: '⊓ SQR' },
                  { id: 'random', label: '⚂ S&H' },
                  { id: 'drift', label: '〰 DRIFT' }
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      const presetPts = SHAPE_POINTS[id as Exclude<LfoShape, 'custom'>] || SHAPE_POINTS.sine;
                      updateCurrentUnit({
                        shape: id as LfoShape,
                        points: presetPts
                      });
                    }}
                    className={`px-1 py-0.5 rounded text-[8px] font-bold border transition-all ${
                      currentUnit.shape === id
                        ? (isEditingLfo2
                            ? 'bg-cyan-600 text-white border-cyan-300 shadow-[0_0_6px_#22d3ee]'
                            : 'bg-purple-600 text-white border-purple-400 shadow-[0_0_6px_#c084fc]')
                        : 'bg-neutral-900/80 text-neutral-400 border-neutral-800 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Interactive MSEG / Envelope Follower Canvas */}
          <div className="relative w-full h-24 bg-black/30 rounded border border-purple-700/50 overflow-hidden">
            <canvas
              ref={canvasRef}
              width={320}
              height={96}
              onMouseDown={handleCanvasMouseDown}
              onDoubleClick={handleCanvasDoubleClick}
              onContextMenu={(e) => e.preventDefault()}
              className="w-full h-full cursor-crosshair block"
              title={
                activeLfoTab === 'envAudio'
                  ? 'Visualisation en temps réel de l’enveloppe dynamique extraite du signal audio'
                  : 'Éditeur d’enveloppe MSEG : Glisser un nœud • Double-clic = Ajouter • Clic-droit = Supprimer'
              }
            />
            <span className="absolute bottom-1 right-1.5 text-[8px] text-purple-300/60 pointer-events-none">
              {activeLfoTab === 'envAudio'
                ? 'TRANSIENT FOLLOWER (BASS / KICK)'
                : 'DBL-CLIC: +NŒUD | CLIC-DROIT: SUPPR'}
            </span>
          </div>

          {/* Rate, Sync Division, Depth & Phase Spread */}
          <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
            <div className="flex items-center gap-1">
              <span className="text-neutral-400 text-[9px]">RATE:</span>
              <input
                type="range"
                min="0.1"
                max="8.0"
                step="0.1"
                value={effectiveRateHz}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  updateCurrentUnit({ rate: val, syncDivision: 'free' });
                }}
                className="w-14 accent-purple-500 cursor-pointer"
              />
              <span className="text-purple-300 text-[9px] w-9">{effectiveRateHz.toFixed(2)}Hz</span>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-neutral-400 text-[9px]">SYNC:</span>
              {(['free', '1/1', '1/2', '1/4', '1/8', '1/16'] as BpmSyncDivision[]).map((div) => (
                <button
                  key={div}
                  type="button"
                  onClick={() => handleSyncDivisionChange(div)}
                  className={`px-1 py-0.2 rounded text-[8px] border ${
                    (currentUnit.syncDivision || 'free') === div
                      ? 'bg-purple-500 text-black border-purple-300 font-bold'
                      : 'bg-black text-neutral-400 border-neutral-800 hover:text-white'
                  }`}
                >
                  {div.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <span className="text-neutral-400 text-[9px]">DEPTH:</span>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={lfoConfig.depth}
                onChange={(e) => onUpdateLfo({ depth: parseFloat(e.target.value) })}
                className="w-12 accent-purple-500 cursor-pointer"
              />
              <span className="text-purple-300 text-[9px]">{Math.round(lfoConfig.depth * 100)}%</span>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-neutral-400 text-[9px]">SPREAD:</span>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={lfoConfig.phaseSpread ?? 0.35}
                onChange={(e) => onUpdateLfo({ phaseSpread: parseFloat(e.target.value) })}
                className="w-12 accent-purple-400 cursor-pointer"
              />
              <span className="text-purple-300 text-[9px]">{Math.round((lfoConfig.phaseSpread ?? 0.35) * 100)}%</span>
            </div>
          </div>
        </div>

        {/* COL 5-8: ROUTING MATRIX, BUS TARGETS & PATCH MORPH A/B */}
        <div className="lg:col-span-4 bg-black/25 border border-neutral-700/70 rounded-lg p-2 flex flex-col justify-between gap-2">
          {activeLfoTab === 'matrix' ? (
            <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto pr-1">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-1">
                <span className="text-[10px] font-bold text-cyan-300">
                  CONNEXIONS DE MODULATION ACTIVES ({modRoutings.length})
                </span>
                {modRoutings.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearRoutings}
                    className="text-[9px] text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    <Trash2 size={10} /> Réinitialiser
                  </button>
                )}
              </div>

              {modRoutings.length === 0 ? (
                <div className="text-[10px] text-neutral-500 py-4 text-center">
                  Glissez une source <span className="text-purple-400 font-bold">[∿ LFO 1]</span>,{' '}
                  <span className="text-emerald-400 font-bold">[⚡ ENV AUDIO]</span> ou{' '}
                  <span className="text-amber-400 font-bold">[✥ MACRO X/Y]</span> sur n’importe quel paramètre du rack.
                </div>
              ) : (
                modRoutings.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-2 bg-neutral-900/90 px-2 py-1 rounded border border-neutral-800 text-[10px]"
                  >
                    <span className="font-bold text-purple-300 uppercase w-14 truncate">{r.source}</span>
                    <span className="text-neutral-500">→</span>
                    <span className="font-bold text-cyan-300 flex-1 truncate">{r.target}</span>
                    <button
                      type="button"
                      onClick={() => onToggleRoutingBipolar(r.id)}
                      className="px-1.5 py-0.2 rounded bg-black border border-neutral-700 text-[9px] text-amber-300"
                      title="Basculer la polarité Bipolaire (±) / Unipolaire (+)"
                    >
                      {r.bipolar ? '±' : '+'}
                    </button>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.05"
                      value={r.amount}
                      onChange={(e) => onUpdateRoutingAmount(r.id, parseFloat(e.target.value))}
                      className="w-14 accent-cyan-400 cursor-pointer"
                    />
                    <span className="w-8 text-right text-cyan-200">
                      {Math.round(r.amount * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveRouting(r.id)}
                      className="text-neutral-500 hover:text-rose-400"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
              {/* Audio Destinations Row */}
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[9px] font-bold text-amber-400/90">AUDIO:</span>
                  {[
                    { id: 'filterCutoff' as LfoTargetId, label: 'FILTER' },
                    { id: 'tapeSpeed' as LfoTargetId, label: 'TAPE SPD' },
                    { id: 'drive' as LfoTargetId, label: 'DRIVE' },
                    { id: 'reverbWet' as LfoTargetId, label: 'REVERB' }
                  ].map(({ id, label }) => {
                    const isActive = !!lfoConfig.targets[id];
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onUpdateLfo({ targets: { ...lfoConfig.targets, [id]: !isActive } })}
                        className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition-all flex items-center gap-1 ${
                          isActive
                            ? 'bg-amber-500/20 text-amber-300 border-amber-400'
                            : 'bg-black/50 text-neutral-500 border-neutral-800 hover:text-neutral-300'
                        }`}
                      >
                        <span className={`w-1 h-1 rounded-full ${isActive ? 'bg-amber-400' : 'bg-neutral-600'}`} />
                        {label}
                      </button>
                    );
                  })}

                  <div className="flex items-center gap-1 bg-neutral-900/80 border border-amber-600/60 rounded px-1 py-0.2">
                    <button
                      type="button"
                      onClick={() => onUpdateLfo({ customAudioEnabled: !lfoConfig.customAudioEnabled })}
                      className={`px-1 rounded text-[8px] font-bold ${
                        lfoConfig.customAudioEnabled ? 'bg-amber-500 text-black' : 'text-neutral-400'
                      }`}
                    >
                      AUX:
                    </button>
                    <select
                      value={lfoConfig.customAudioTarget || 'bitcrush'}
                      onChange={(e) => onUpdateLfo({ customAudioTarget: e.target.value as AudioParamKey, customAudioEnabled: true })}
                      className="bg-black text-amber-200 text-[8px] font-mono rounded px-1 py-0.2 focus:outline-none"
                    >
                      <option value="bitcrush">Bitcrush</option>
                      <option value="ringModMix">RingMod Mix</option>
                      <option value="filterCutoff">Filter Cutoff</option>
                      <option value="filterResonance">Filter Res (Q)</option>
                      <option value="drive">Drive Saturation</option>
                      <option value="tapeSpeed">Tape Speed</option>
                      <option value="reverbWet">Mall Reverb</option>
                      <option value="wowDepth">Wow Depth</option>
                      <option value="flutterDepth">Flutter Depth</option>
                      <option value="tapeTone">Tape Tone</option>
                      <option value="stutterSpeed">Stutter Size</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Video Destinations Row */}
              <div className="flex items-center gap-1 flex-wrap pt-1 border-t border-purple-900/30">
                <span className="text-[9px] font-bold text-cyan-400/90">VIDEO:</span>
                {[
                  { id: 'glitchIntensity' as LfoTargetId, label: 'H-GLITCH' },
                  { id: 'rgbShift' as LfoTargetId, label: 'RGB SHIFT' },
                  { id: 'scanlines' as LfoTargetId, label: 'SCANLINES' },
                  { id: 'meshDisplacement' as LfoTargetId, label: '3D RELIEF' },
                  { id: 'luminance' as LfoTargetId, label: 'LUMINANCE' },
                  { id: 'colorBleed' as LfoTargetId, label: 'CHROMA' }
                ].map(({ id, label }) => {
                  const isActive = !!lfoConfig.targets[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onUpdateLfo({ targets: { ...lfoConfig.targets, [id]: !isActive } })}
                      className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition-all flex items-center gap-1 ${
                        isActive
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400'
                          : 'bg-black/50 text-neutral-500 border-neutral-800 hover:text-neutral-300'
                      }`}
                    >
                      <span className={`w-1 h-1 rounded-full ${isActive ? 'bg-cyan-400' : 'bg-neutral-600'}`} />
                      {label}
                    </button>
                  );
                })}

                <div className="flex items-center gap-1 bg-neutral-900/80 border border-cyan-600/60 rounded px-1 py-0.2">
                  <button
                    type="button"
                    onClick={() => onUpdateLfo({ customVideoEnabled: !lfoConfig.customVideoEnabled })}
                    className={`px-1 rounded text-[8px] font-bold ${
                      lfoConfig.customVideoEnabled ? 'bg-cyan-400 text-black' : 'text-neutral-400'
                    }`}
                  >
                    AUX:
                  </button>
                  <select
                    value={lfoConfig.customVideoTarget || 'feedback'}
                    onChange={(e) => onUpdateLfo({ customVideoTarget: e.target.value as VideoParamKey, customVideoEnabled: true })}
                    className="bg-black text-cyan-200 text-[8px] font-mono rounded px-1 py-0.2 focus:outline-none"
                  >
                    <option value="datamosh">Datamosh Melt</option>
                    <option value="feedback">Feedback Ghost</option>
                    <option value="noise">RF Static Noise</option>
                    <option value="vaporwaveTint">Vaporwave Tint</option>
                    <option value="crtCurvature">CRT Curvature</option>
                    <option value="apertureGrille">Aperture Grille</option>
                    <option value="vhsHeadSwitching">VHS Head Switching</option>
                    <option value="vHoldDrift">V-Hold Drift Roll</option>
                    <option value="chromaSmear">Chroma Beam Smear</option>
                    <option value="audioReact">Sidechain Audio React</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {/* A/B PATCH MORPHING CROSSFADER */}
          <div className="bg-black/35 border border-neutral-700/70 rounded p-1.5 flex flex-col gap-1">
            <div className="flex items-center justify-between text-[8px] text-cyan-300 font-bold">
              <span className="flex items-center gap-1">
                <Shuffle size={9} /> PATCH MORPHING CROSSFADER (A ◄─► B)
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-amber-300">{Math.round((1 - morphAmount) * 100)}% A</span>
                <span className="text-neutral-600">/</span>
                <span className="text-cyan-300">{Math.round(morphAmount * 100)}% B</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <div
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('application/x-circuitbend-preset')) {
                    e.preventDefault();
                    setSlotADragOver(true);
                  }
                }}
                onDragLeave={() => setSlotADragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setSlotADragOver(false);
                  const pid = e.dataTransfer.getData('application/x-circuitbend-preset');
                  if (pid) onSelectMorphSlotA(pid);
                }}
                className={`flex-1 rounded border ${
                  slotADragOver ? 'border-amber-400 bg-amber-950/60' : 'border-neutral-700 bg-black'
                }`}
              >
                <select
                  value={morphSlotA}
                  onChange={(e) => onSelectMorphSlotA(e.target.value)}
                  className="w-full bg-transparent text-amber-300 text-[8px] px-1 py-0.5 focus:outline-none truncate"
                  title="Slot A (Sélectionner ou glisser-déposer un Preset)"
                >
                  {allPresetsList.map((p) => (
                    <option key={p.id} value={p.id} className="bg-black text-amber-300">
                      A: {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={morphAmount}
                onChange={(e) => onChangeMorphAmount(parseFloat(e.target.value))}
                className="w-24 h-1.5 accent-cyan-400 cursor-pointer"
                title="Interpolation continue entre le Patch A et le Patch B"
              />

              <div
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('application/x-circuitbend-preset')) {
                    e.preventDefault();
                    setSlotBDragOver(true);
                  }
                }}
                onDragLeave={() => setSlotBDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setSlotBDragOver(false);
                  const pid = e.dataTransfer.getData('application/x-circuitbend-preset');
                  if (pid) onSelectMorphSlotB(pid);
                }}
                className={`flex-1 rounded border ${
                  slotBDragOver ? 'border-cyan-400 bg-cyan-950/60' : 'border-neutral-700 bg-black'
                }`}
              >
                <select
                  value={morphSlotB}
                  onChange={(e) => onSelectMorphSlotB(e.target.value)}
                  className="w-full bg-transparent text-cyan-300 text-[8px] px-1 py-0.5 focus:outline-none truncate"
                  title="Slot B (Sélectionner ou glisser-déposer un Preset)"
                >
                  {allPresetsList.map((p) => (
                    <option key={p.id} value={p.id} className="bg-black text-cyan-300">
                      B: {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* COL 9-12: LARGE FULL-SIZE STUDIO 2D VECTOR PAD X/Y */}
        <div className="lg:col-span-4 bg-black/25 border border-amber-700/60 rounded-lg p-2 flex flex-col justify-between gap-1.5">
          {/* Vector Pad Header */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1.5 tracking-wider">
              <Crosshair size={12} className="text-amber-400" />
              VECTOR PAD X/Y
            </span>

            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-amber-300 font-bold bg-black/80 px-1.5 py-0.2 rounded border border-neutral-800">
                X: {Math.round(macroXY.x * 100)}%
              </span>
              <span className="text-[9px] text-rose-300 font-bold bg-black/80 px-1.5 py-0.2 rounded border border-neutral-800">
                Y: {Math.round(macroXY.y * 100)}%
              </span>
              <button
                type="button"
                onClick={() => {
                  setXyMotionMode('idle');
                  xyRecordedPathRef.current = [];
                  setXyRecordedPath([]);
                  onChangeMacroXY(0.5, 0.5);
                }}
                className="p-0.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-700"
                title="Recentrer le Vector Pad (50% / 50%) et effacer la boucle de mouvement"
              >
                <RotateCcw size={10} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (xyMotionMode === 'idle') {
                    xyRecordedPathRef.current = [];
                    setXyRecordedPath([]);
                    setXyMotionMode('armed');
                  } else {
                    setXyMotionMode('idle');
                    xyRecordedPathRef.current = [];
                    setXyRecordedPath([]);
                    if (!xyHold) onChangeMacroXY(0.5, 0.5);
                  }
                }}
                className={`px-2 py-0.2 rounded text-[9px] font-bold border transition-all ${
                  xyMotionMode === 'recording'
                    ? 'bg-rose-600 text-white border-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.8)] animate-pulse'
                    : xyMotionMode === 'armed'
                    ? 'bg-rose-950/90 text-rose-300 border-rose-500 animate-pulse'
                    : xyMotionMode === 'playing'
                    ? 'bg-emerald-500 text-black border-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                    : 'bg-neutral-900 text-neutral-300 border-neutral-700 hover:text-rose-300 hover:border-rose-500/60'
                }`}
                title="Enregistreur de trajectoire : Cliquer sur REC puis dessiner un mouvement sur le Pad X/Y pour le rejouer en boucle"
              >
                {xyMotionMode === 'recording'
                  ? '● REC...'
                  : xyMotionMode === 'armed'
                  ? '● ARM'
                  : xyMotionMode === 'playing'
                  ? '▶ LOOP'
                  : '● REC'}
              </button>
              <button
                type="button"
                onClick={onToggleXyHold}
                className={`px-2 py-0.2 rounded text-[9px] font-bold border transition-all ${
                  xyHold
                    ? 'bg-amber-500 text-black border-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                    : 'bg-neutral-900 text-neutral-300 border-neutral-700 hover:text-white'
                }`}
                title="HOLD = Verrouille la position au relâchement • SPRING = Retour élastique au centre"
              >
                {xyHold ? '● HOLD' : '○ SPRING'}
              </button>
            </div>
          </div>

          {/* Spacious Interactive 2D Vector Surface */}
          <div
            ref={xyPadRef}
            onMouseDown={(e) => {
              setIsDraggingXY(true);
              if (xyMotionMode === 'armed') {
                xyRecordStartRef.current = performance.now();
                xyRecordedPathRef.current = [];
                setXyRecordedPath([]);
                setXyMotionMode('recording');
                updateXYFromEvent(e.clientX, e.clientY, true);
              } else {
                if (xyMotionMode === 'playing') {
                  setXyMotionMode('idle');
                }
                updateXYFromEvent(e.clientX, e.clientY, false);
              }
            }}
            onDoubleClick={() => {
              setXyMotionMode('idle');
              xyRecordedPathRef.current = [];
              setXyRecordedPath([]);
              onChangeMacroXY(0.5, 0.5);
            }}
            className="relative w-full h-32 rounded-md border border-amber-500/60 bg-gradient-to-br from-amber-950/20 via-black/25 to-rose-950/20 cursor-crosshair overflow-hidden shadow-inner"
            title="Surface tactile 2D : Glisser pour piloter MACRO X & MACRO Y en direct • Double-clic = Centre"
          >
            {/* Subtle Radar Grid & Center Axes */}
            <div className="absolute inset-0 pointer-events-none opacity-25">
              <div className="absolute left-1/4 top-0 bottom-0 w-px bg-neutral-600" />
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-amber-400/80" />
              <div className="absolute left-3/4 top-0 bottom-0 w-px bg-neutral-600" />
              <div className="absolute top-1/4 left-0 right-0 h-px bg-neutral-600" />
              <div className="absolute top-1/2 left-0 right-0 h-px bg-rose-400/80" />
              <div className="absolute top-3/4 left-0 right-0 h-px bg-neutral-600" />
            </div>

            {/* Recorded Motion Loop Trajectory Overlay */}
            {xyRecordedPath.length > 1 && (
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full pointer-events-none"
              >
                <polyline
                  fill="none"
                  stroke={xyMotionMode === 'recording' ? '#f43f5e' : '#10b981'}
                  strokeWidth="1.6"
                  strokeDasharray={xyMotionMode === 'playing' ? '2,1.5' : undefined}
                  points={xyRecordedPath
                    .map((p) => `${(p.x * 100).toFixed(1)},${((1 - p.y) * 100).toFixed(1)}`)
                    .join(' ')}
                  style={{
                    filter:
                      xyMotionMode === 'recording'
                        ? 'drop-shadow(0 0 4px rgba(244,63,94,0.85))'
                        : 'drop-shadow(0 0 4px rgba(16,185,129,0.85))'
                  }}
                />
              </svg>
            )}

            {/* Active Cursor Crosshair Guides */}
            <div
              className="absolute top-0 bottom-0 w-px bg-amber-400/70 shadow-[0_0_6px_#f59e0b] pointer-events-none"
              style={{ left: `${macroXY.x * 100}%` }}
            />
            <div
              className="absolute left-0 right-0 h-px bg-rose-400/70 shadow-[0_0_6px_#f43f5e] pointer-events-none"
              style={{ top: `${(1 - macroXY.y) * 100}%` }}
            />

            {/* Glowing Vector Puck */}
            <div
              className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-amber-400/30 border-2 border-amber-300 shadow-[0_0_16px_#f59e0b] flex items-center justify-center pointer-events-none transition-transform duration-75"
              style={{
                left: `${macroXY.x * 100}%`,
                top: `${(1 - macroXY.y) * 100}%`,
                transform: isDraggingXY ? 'scale(1.25)' : 'scale(1)'
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
            </div>

            {/* Corner Axis Labels */}
            <span className="absolute bottom-1 left-1.5 text-[8px] text-amber-300/70 pointer-events-none">
              X: GLITCH / RGB SHIFT
            </span>
            <span className="absolute top-1 right-1.5 text-[8px] text-rose-300/70 pointer-events-none">
              Y: FILTER / DATAMOSH
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
