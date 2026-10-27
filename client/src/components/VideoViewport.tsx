import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Play, Pause, Maximize2, SkipForward, SkipBack, Zap, Tv } from 'lucide-react';
import { VideoBendingParams, LiveInputSource } from '../types/index.js';
import { CircuitBendShader, DatamoshShader } from '../shaders/circuitBendShader.js';
import { AudioCircuitEngine } from '../audio/AudioCircuitEngine.js';

interface VideoViewportProps {
  videoElement: HTMLVideoElement | null;
  videoParams: VideoBendingParams;
  isPlaying: boolean;
  isTapeStopped?: boolean;
  isFreezeActive?: boolean;
  isTapeFreeze?: boolean;
  audioEngine?: AudioCircuitEngine | null;
  showTimeline?: boolean;
  showVcrOsd?: boolean;
  onToggleVcrOsd?: () => void;
  liveSource?: LiveInputSource;
  bpm?: number;
  onPlayToggle: () => void;
  onNext: () => void;
  onPrev: () => void;
  onTapeStop?: () => void;
  onToggleTapeFreeze?: () => void;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  title?: string;
  duration?: number;
  currentTime?: number;
  onSeek?: (time: number) => void;
}

// Inner R3F Quad that projects the VideoTexture with Ping-Pong Temporal Datamosh + CircuitBendShader
const CircuitScreen: React.FC<{
  videoElement: HTMLVideoElement | null;
  params: VideoBendingParams;
  isFreezeActive?: boolean;
  audioEngine?: AudioCircuitEngine | null;
}> = React.memo(({ videoElement, params, isFreezeActive = false, audioEngine }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const { size, viewport } = useThree();

  const texture = useMemo(() => {
    if (!videoElement) return null;
    const tex = new THREE.VideoTexture(videoElement);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.format = THREE.RGBAFormat;
    return tex;
  }, [videoElement]);

  // Ping-Pong GPU RenderTargets for True Temporal Datamoshing (I-frame drop + Optical Flow advection)
  const moshPipeline = useMemo(() => {
    const rtOptions: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false
    };
    const rtA = new THREE.WebGLRenderTarget(1280, 720, rtOptions);
    const rtB = new THREE.WebGLRenderTarget(1280, 720, rtOptions);

    const uniforms = THREE.UniformsUtils.clone(DatamoshShader.uniforms);
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: DatamoshShader.vertexShader,
      fragmentShader: DatamoshShader.fragmentShader,
      depthTest: false,
      depthWrite: false
    });

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(quad);

    return {
      read: rtA,
      write: rtB,
      material,
      scene,
      camera,
      quad
    };
  }, []);

  useEffect(() => {
    return () => {
      moshPipeline.read.dispose();
      moshPipeline.write.dispose();
      moshPipeline.material.dispose();
      moshPipeline.quad.geometry.dispose();
    };
  }, [moshPipeline]);

  const shaderMaterial = useMemo(() => {
    const uniforms = THREE.UniformsUtils.clone(CircuitBendShader.uniforms);
    if (texture) {
      uniforms.tDiffuse.value = texture;
    }
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: CircuitBendShader.vertexShader,
      fragmentShader: CircuitBendShader.fragmentShader
    });
  }, [texture]);

  const aspect = 16 / 9;
  const vw = Math.max(1, viewport.width || 16);
  const vh = Math.max(1, viewport.height || 9);
  let planeWidth = vw;
  let planeHeight = vw / aspect;
  if (planeHeight > vh) {
    planeHeight = vh;
    planeWidth = vh * aspect;
  }

  useFrame((state) => {
    const u = shaderMaterial.uniforms;
    const p = paramsRef.current;
    const moshAmt = Number.isFinite(p.datamosh ?? 0) ? (p.datamosh ?? 0) : 0;

    const isVideoReady = Boolean(videoElement && videoElement.readyState >= 2);

    if (!isFreezeActive && texture && isVideoReady) {
      texture.needsUpdate = true;
    }

    // Update Ping-Pong Temporal Datamosh Buffer only when video has a valid decoded frame
    // When switching tracks (readyState < 2), keep displaying last frame in moshPipeline.read to prevent black flash
    if (texture && isVideoReady) {
      const mu = moshPipeline.material.uniforms;
      mu.tVideo.value = texture;
      mu.tPrevMosh.value = moshPipeline.read.texture;
      mu.uDatamosh.value = moshAmt;
      mu.uTime.value = state.clock.getElapsedTime();
      mu.uResolution.value.set(1280, 720);

      state.gl.setRenderTarget(moshPipeline.write);
      state.gl.render(moshPipeline.scene, moshPipeline.camera);
      state.gl.setRenderTarget(null);

      // Swap ping-pong buffers
      const temp = moshPipeline.read;
      moshPipeline.read = moshPipeline.write;
      moshPipeline.write = temp;

      // Strictly use raw video texture when Datamosh is 0, and Temporal Optical Flow buffer when > 0
      u.tDiffuse.value = moshAmt > 0.001 ? moshPipeline.read.texture : texture;
    } else if (texture && !isVideoReady) {
      // Seamless visual hold on last frame during track switch
      u.tDiffuse.value = moshPipeline.read.texture;
    }

    u.uTime.value = state.clock.getElapsedTime();
    u.uResolution.value.set(size.width, size.height);

    // Core Glitch
    u.uGlitchIntensity.value = Number.isFinite(p.glitchIntensity) ? p.glitchIntensity : 0;
    u.uRgbShift.value = Number.isFinite(p.rgbShift) ? p.rgbShift : 0;
    u.uScanlines.value = Number.isFinite(p.scanlines) ? p.scanlines : 0;
    u.uColorBleed.value = Number.isFinite(p.colorBleed) ? p.colorBleed : 0;
    u.uFeedback.value = Number.isFinite(p.feedback) ? p.feedback : 0;
    u.uNoise.value = Number.isFinite(p.noise) ? p.noise : 0;

    // Vaporwave, VHS & CRT
    u.uVaporwaveTint.value = Number.isFinite(p.vaporwaveTint) ? p.vaporwaveTint : 0;
    u.uCrtCurvature.value = Number.isFinite(p.crtCurvature) ? p.crtCurvature : 0;
    u.uApertureGrille.value = Number.isFinite(p.apertureGrille) ? p.apertureGrille : 0;
    u.uVhsHeadSwitching.value = Number.isFinite(p.vhsHeadSwitching) ? p.vhsHeadSwitching : 0;
    u.uVHoldDrift.value = Number.isFinite(p.vHoldDrift) ? p.vHoldDrift : 0;

    // Video Bends & Datamosh
    u.uMeshDisplacement.value = Number.isFinite(p.meshDisplacement) ? p.meshDisplacement : 0;
    u.uChromaSmear.value = Number.isFinite(p.chromaSmear) ? p.chromaSmear : 0;
    u.uAudioReact.value = Number.isFinite(p.audioReact) ? p.audioReact : 0;
    const rawBass = audioEngine ? audioEngine.getBassEnergy() : 0.0;
    u.uAudioBass.value = Number.isFinite(rawBass) ? rawBass : 0.0;
    u.uLuminance.value = Number.isFinite(p.luminance) ? p.luminance : 0;
    u.uDatamosh.value = moshAmt;
  });

  return (
    <mesh ref={meshRef} scale={[planeWidth, planeHeight, 1]}>
      <planeGeometry args={[1, 1]} />
      <primitive object={shaderMaterial} attach="material" />
    </mesh>
  );
});

export const VideoViewport: React.FC<VideoViewportProps> = ({
  videoElement,
  videoParams,
  isPlaying,
  isTapeStopped = false,
  isFreezeActive = false,
  isTapeFreeze,
  audioEngine = null,
  showTimeline = true,
  showVcrOsd = false,
  onToggleVcrOsd,
  liveSource = 'youtube',
  bpm = 120,
  onPlayToggle,
  onNext,
  onPrev,
  onTapeStop,
  onToggleTapeFreeze,
  onCanvasReady,
  title = 'NO SIGNAL',
  duration = 0,
  currentTime = 0,
  onSeek
}) => {
  const isStoppedAndFrozen = isTapeFreeze ?? (isTapeStopped || isFreezeActive);
  const handleTapeFreezeAction = onToggleTapeFreeze || onTapeStop;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isControlsVisible, setIsControlsVisible] = useState(false);
  const hideTimeoutRef = useRef<any>(null);
  const [clickIndicator, setClickIndicator] = useState<'play' | 'pause' | null>(null);

  // Editable 90s VCR OSD Text Fields (click any OSD label to customize)
  const [vcrChannel, setVcrChannel] = useState<string>('CH 03 // NTSC-M');
  const [vcrCustomTitle, setVcrCustomTitle] = useState<string | null>(null);
  const [vcrDate, setVcrDate] = useState<string>('OCT 27 1994');
  const [vcrTime, setVcrTime] = useState<string>('PM 11:42');
  const [editingVcrField, setEditingVcrField] = useState<'channel' | 'title' | 'date' | 'time' | null>(null);

  const handleUserActivity = () => {
    setIsControlsVisible(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      setIsControlsVisible(false);
    }, 2500);
  };

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  const handleScreenClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.transport-controls')) return;

    onPlayToggle();
    setClickIndicator(isPlaying ? 'pause' : 'play');
    setTimeout(() => setClickIndicator(null), 400);
    handleUserActivity();
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen().catch(err => console.error(err));
    }
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds) || !Number.isFinite(seconds) || seconds <= 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatVcrCounter = (seconds: number) => {
    const total = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : (currentTime > 0 ? currentTime + 60 : 100);

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleUserActivity}
      onMouseEnter={handleUserActivity}
      onMouseLeave={() => setIsControlsVisible(false)}
      onClick={handleScreenClick}
      className="absolute inset-0 w-full h-full bg-black flex items-center justify-center cursor-pointer select-none overflow-hidden"
    >
      {/* 3D WebGL Canvas filling entire background */}
      <Canvas
        camera={{ position: [0, 0, 7.5], fov: 60 }}
        className="w-full h-full block"
        dpr={1}
        gl={{
          preserveDrawingBuffer: true,
          antialias: false,
          alpha: false,
          powerPreference: 'high-performance',
          failIfMajorPerformanceCaveat: false
        }}
        onCreated={({ gl }) => {
          if (onCanvasReady) onCanvasReady(gl.domElement);
        }}
      >
        <CircuitScreen 
          videoElement={videoElement} 
          params={videoParams} 
          isFreezeActive={isStoppedAndFrozen}
          audioEngine={audioEngine}
        />
      </Canvas>

      {/* RETRO 90s VHS CAMCORDER OSD OVERLAY (Click text labels to customize inline) */}
      {showVcrOsd && (
        <div
          className="absolute top-14 bottom-10 left-8 right-8 sm:left-12 sm:right-12 z-20 pointer-events-none flex flex-col justify-between font-mono text-emerald-400 tracking-widest uppercase"
          style={{
            textShadow: '2px 2px 0px #000, -1px -1px 0px #000, 0 0 12px rgba(16,185,129,0.75)'
          }}
        >
          <div className="flex items-start justify-between text-base sm:text-xl font-black">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span>{isStoppedAndFrozen ? '⏸ PAUSE // FREEZE' : (isPlaying ? '▶ PLAY' : '■ STOP')}</span>
                <span className="text-xs px-1.5 py-0.5 border border-emerald-400/80 rounded bg-black/40">
                  {liveSource.toUpperCase()}
                </span>
              </div>
              <span className="text-xs sm:text-sm text-emerald-300/90">
                HI-FI STEREO // {bpm} BPM
              </span>
            </div>
            <div className="text-right flex flex-col items-end pr-24">
              <span>SP  {formatVcrCounter(currentTime)}</span>
              {editingVcrField === 'channel' ? (
                <input
                  type="text"
                  autoFocus
                  value={vcrChannel}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setVcrChannel(e.target.value)}
                  onBlur={() => setEditingVcrField(null)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter' || e.key === 'Escape') setEditingVcrField(null);
                  }}
                  className="pointer-events-auto bg-black/85 text-amber-300 border border-amber-400 rounded px-1.5 py-0.5 text-xs sm:text-sm font-mono uppercase text-right w-44 focus:outline-none"
                />
              ) : (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingVcrField('channel');
                  }}
                  className="pointer-events-auto cursor-text text-xs sm:text-sm text-amber-300 hover:bg-black/50 hover:outline hover:outline-1 hover:outline-amber-400/60 px-1 rounded transition-colors"
                  title="Cliquer pour personnaliser le canal VHS"
                >
                  {vcrChannel || 'CH 03 // NTSC-M'}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-end justify-between text-sm sm:text-lg font-bold pb-16">
            {editingVcrField === 'title' ? (
              <input
                type="text"
                autoFocus
                value={vcrCustomTitle ?? title}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setVcrCustomTitle(e.target.value)}
                onBlur={() => setEditingVcrField(null)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter' || e.key === 'Escape') setEditingVcrField(null);
                }}
                className="pointer-events-auto bg-black/85 text-emerald-300 border border-emerald-400 rounded px-2 py-0.5 text-sm sm:text-lg font-mono uppercase w-80 max-w-md focus:outline-none"
              />
            ) : (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (vcrCustomTitle === null) setVcrCustomTitle(title);
                  setEditingVcrField('title');
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setVcrCustomTitle(null);
                }}
                className="pointer-events-auto cursor-text truncate max-w-md bg-black/35 hover:bg-black/65 hover:outline hover:outline-1 hover:outline-emerald-400/60 px-2 py-0.5 rounded transition-colors"
                title="Cliquer pour éditer le titre VHS • Double-clic pour restaurer le titre automatique"
              >
                {vcrCustomTitle ?? title}
              </div>
            )}

            <div className="text-right flex flex-col items-end">
              {editingVcrField === 'date' ? (
                <input
                  type="text"
                  autoFocus
                  value={vcrDate}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setVcrDate(e.target.value)}
                  onBlur={() => setEditingVcrField(null)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter' || e.key === 'Escape') setEditingVcrField(null);
                  }}
                  className="pointer-events-auto bg-black/85 text-emerald-300 border border-emerald-400 rounded px-1.5 py-0.2 text-sm font-mono uppercase text-right w-36 focus:outline-none"
                />
              ) : (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingVcrField('date');
                  }}
                  className="pointer-events-auto cursor-text hover:bg-black/50 hover:outline hover:outline-1 hover:outline-emerald-400/60 px-1 rounded transition-colors"
                  title="Cliquer pour personnaliser la date VHS"
                >
                  {vcrDate || 'OCT 27 1994'}
                </div>
              )}

              {editingVcrField === 'time' ? (
                <input
                  type="text"
                  autoFocus
                  value={vcrTime}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setVcrTime(e.target.value)}
                  onBlur={() => setEditingVcrField(null)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter' || e.key === 'Escape') setEditingVcrField(null);
                  }}
                  className="pointer-events-auto bg-black/85 text-emerald-300 border border-emerald-400 rounded px-1.5 py-0.2 text-xs font-mono uppercase text-right w-28 focus:outline-none mt-0.5"
                />
              ) : (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingVcrField('time');
                  }}
                  className="pointer-events-auto cursor-text text-xs text-emerald-300 hover:bg-black/50 hover:outline hover:outline-1 hover:outline-emerald-400/60 px-1 rounded transition-colors"
                  title="Cliquer pour personnaliser l'heure VHS"
                >
                  {vcrTime || 'PM 11:42'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ephemeral Feedback Flash (Play / Pause ripple) */}
      {clickIndicator && (
        <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center animate-ping">
          <div className="w-20 h-20 rounded-full bg-amber-500/80 flex items-center justify-center text-black shadow-[0_0_35px_#ff9d00]">
            {clickIndicator === 'play' ? <Play size={36} fill="black" /> : <Pause size={36} fill="black" />}
          </div>
        </div>
      )}

      {/* Screen HUD Top Bar (Hidden when VCR OSD is active to prevent duplicate info) */}
      <div className="absolute top-14 left-4 right-4 z-20 flex items-center justify-between pointer-events-none opacity-85">
        {!showVcrOsd ? (
          <div className="flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full border border-neutral-800 font-mono text-[11px]">
            <span className={`w-2 h-2 rounded-full ${
              isStoppedAndFrozen
                ? 'bg-gradient-to-r from-rose-500 to-cyan-400 animate-ping'
                : (isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400')
            }`}></span>
            <span className="text-neutral-300 font-bold tracking-wider">
              {isStoppedAndFrozen 
                ? 'TAPE STOP // BUFFER FROZEN' 
                : (isPlaying ? `LIVE (${liveSource.toUpperCase()})` : 'PAUSED')}
            </span>
            <span className="text-neutral-500">|</span>
            <span className="text-amber-400 font-bold truncate max-w-[340px]">
              {title}
            </span>
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2 pointer-events-auto">
          {onToggleVcrOsd && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleVcrOsd();
              }}
              className={`px-2.5 py-1 rounded-full border font-mono text-[10px] font-bold flex items-center gap-1 transition-all ${
                showVcrOsd
                  ? 'bg-emerald-950/90 text-emerald-300 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                  : 'bg-black/70 text-neutral-400 border-neutral-800 hover:text-white'
              }`}
              title="Afficher/Masquer l'OSD Caméscope VHS 1994"
            >
              <Tv size={11} />
              <span>VCR OSD</span>
            </button>
          )}
        </div>
      </div>

      {/* Initial Play Overlay */}
      {!isPlaying && currentTime === 0 && !isStoppedAndFrozen && liveSource === 'youtube' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/55 backdrop-blur-[2px] transition-colors pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-amber-500/95 flex items-center justify-center text-black shadow-[0_0_30px_rgba(255,157,0,0.7)] mb-3">
            <Play size={28} fill="black" className="ml-1" />
          </div>
          <span className="font-display font-bold text-xs tracking-widest text-amber-400 uppercase bg-black/85 px-3 py-1 rounded-full border border-amber-500/40">
            CLIQUER POUR LANCER LE FLUX (OU GLISSER UN FICHIER VIDÉO/AUDIO ICI)
          </span>
        </div>
      )}

      {/* Floating Mini Transport Bar */}
      {showTimeline && (
        <div 
          className={`transport-controls absolute bottom-24 left-1/2 -translate-x-1/2 z-20 w-[90%] max-w-2xl bg-black/85 backdrop-blur-md border border-neutral-800 rounded-lg p-2.5 shadow-2xl transition-all duration-300 ${
            isControlsVisible || !isPlaying ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
        {/* Seekbar */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-mono text-neutral-400 w-10 text-right">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min="0"
            max={safeDuration}
            step="0.1"
            value={Math.min(currentTime, safeDuration)}
            onChange={(e) => onSeek && onSeek(parseFloat(e.target.value))}
            className="flex-1 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500 hover:accent-amber-400"
          />
          <span className="text-[10px] font-mono text-neutral-400 w-10">
            {formatTime(safeDuration)}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onPrev}
              className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
              title="Précédent"
            >
              <SkipBack size={14} />
            </button>

            <button
              onClick={onPlayToggle}
              className="px-2.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold flex items-center gap-1 text-xs font-mono shadow-[0_0_8px_rgba(255,157,0,0.4)]"
            >
              {isPlaying ? <Pause size={12} fill="black" /> : <Play size={12} fill="black" />}
              <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
            </button>

            <button
              onClick={onNext}
              className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
              title="Suivant"
            >
              <SkipForward size={14} />
            </button>

            {handleTapeFreezeAction && (
              <button
                onClick={handleTapeFreezeAction}
                className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold flex items-center gap-1 ml-2 transition-all border ${
                  isStoppedAndFrozen
                    ? 'bg-gradient-to-r from-rose-600 to-cyan-600 text-white border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.6)] animate-pulse'
                    : 'bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-700'
                }`}
                title={isStoppedAndFrozen ? 'Relancer la bande et le flux [Touche T ou F]' : 'Arrêt de bande & Gel instantané [Touche T ou F]'}
              >
                <Zap size={10} className={isStoppedAndFrozen ? 'text-cyan-200' : 'text-rose-400'} />
                <span>{isStoppedAndFrozen ? 'RESUME' : 'TAPE STOP // FREEZE'}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleFullscreen}
              className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
              title="Plein écran"
            >
              <Maximize2 size={13} />
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
