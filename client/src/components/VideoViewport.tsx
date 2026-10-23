import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Play, Pause, Maximize2, SkipForward, SkipBack, Zap, Snowflake } from 'lucide-react';
import { VideoBendingParams } from '../types/index.js';
import { CircuitBendShader } from '../shaders/circuitBendShader.js';
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

// Inner R3F Quad that projects the VideoTexture with CircuitBendShader
const CircuitScreen: React.FC<{
  videoElement: HTMLVideoElement | null;
  params: VideoBendingParams;
  isFreezeActive?: boolean;
  audioEngine?: AudioCircuitEngine | null;
}> = ({ videoElement, params, isFreezeActive = false, audioEngine }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { size, viewport } = useThree();

  // Stable direct VideoTexture creation from videoElement
  const texture = useMemo(() => {
    if (!videoElement) return null;
    const tex = new THREE.VideoTexture(videoElement);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.format = THREE.RGBAFormat;
    return tex;
  }, [videoElement]);

  // Direct ShaderMaterial initialized with texture from frame 1
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

  // Fit 16:9 plane perfectly within available Three.js viewport
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

    if (texture && u.tDiffuse.value !== texture) {
      u.tDiffuse.value = texture;
      shaderMaterial.needsUpdate = true;
    }

    // Freeze: only update texture frames when video is actually playing a new frame
    if (texture) {
      if (isFreezeActive) {
        // Keep current frame frozen in VRAM
      } else if (videoElement && videoElement.readyState >= 2 && !videoElement.paused) {
        texture.needsUpdate = true;
      }
    }

    u.uTime.value = state.clock.getElapsedTime();
    u.uResolution.value.set(size.width, size.height);
    
    // Core Glitch
    u.uGlitchIntensity.value = Number.isFinite(params.glitchIntensity) ? params.glitchIntensity : 0;
    u.uRgbShift.value = Number.isFinite(params.rgbShift) ? params.rgbShift : 0;
    u.uScanlines.value = Number.isFinite(params.scanlines) ? params.scanlines : 0;
    u.uColorBleed.value = Number.isFinite(params.colorBleed) ? params.colorBleed : 0;
    u.uFeedback.value = Number.isFinite(params.feedback) ? params.feedback : 0;
    u.uNoise.value = Number.isFinite(params.noise) ? params.noise : 0;

    // Vaporwave, VHS & CRT
    u.uVaporwaveTint.value = Number.isFinite(params.vaporwaveTint) ? params.vaporwaveTint : 0;
    u.uCrtCurvature.value = Number.isFinite(params.crtCurvature) ? params.crtCurvature : 0;
    u.uApertureGrille.value = Number.isFinite(params.apertureGrille) ? params.apertureGrille : 0;
    u.uVhsHeadSwitching.value = Number.isFinite(params.vhsHeadSwitching) ? params.vhsHeadSwitching : 0;
    u.uVHoldDrift.value = Number.isFinite(params.vHoldDrift) ? params.vHoldDrift : 0;

    // Video Bends
    u.uMeshDisplacement.value = Number.isFinite(params.meshDisplacement) ? params.meshDisplacement : 0;
    u.uChromaSmear.value = Number.isFinite(params.chromaSmear) ? params.chromaSmear : 0;
    u.uAudioReact.value = Number.isFinite(params.audioReact) ? params.audioReact : 0;
    const rawBass = audioEngine ? audioEngine.getBassEnergy() : 0.0;
    u.uAudioBass.value = Number.isFinite(rawBass) ? rawBass : 0.0;
    u.uLuminance.value = Number.isFinite(params.luminance) ? params.luminance : 0;
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[planeWidth, planeHeight]} />
      <primitive object={shaderMaterial} attach="material" />
    </mesh>
  );
};

export const VideoViewport: React.FC<VideoViewportProps> = ({
  videoElement,
  videoParams,
  isPlaying,
  isTapeStopped = false,
  isFreezeActive = false,
  isTapeFreeze,
  audioEngine = null,
  showTimeline = true,
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

  // Auto-hide controls after 2.5 seconds of mouse inactivity
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
    // Only toggle playback if click wasn't on bottom transport bar
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
      {/* 3D WebGL Canvas filling entire background (GPU-Optimized for Chrome & Discrete GPUs) */}
      <Canvas
        camera={{ position: [0, 0, 7.5], fov: 60 }}
        className="w-full h-full block"
        dpr={[1, 1.25]}
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

      {/* Ephemeral Feedback Flash (Play / Pause ripple) */}
      {clickIndicator && (
        <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center animate-ping">
          <div className="w-20 h-20 rounded-full bg-amber-500/80 flex items-center justify-center text-black shadow-[0_0_35px_#ff9d00]">
            {clickIndicator === 'play' ? <Play size={36} fill="black" /> : <Pause size={36} fill="black" />}
          </div>
        </div>
      )}

      {/* Screen HUD Top Bar (Subtle & Floating) */}
      <div className="absolute top-14 left-4 right-4 z-20 flex items-center justify-between pointer-events-none opacity-80">
        <div className="flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full border border-neutral-800 font-mono text-[11px]">
          <span className={`w-2 h-2 rounded-full ${
            isStoppedAndFrozen
              ? 'bg-gradient-to-r from-rose-500 to-cyan-400 animate-ping'
              : (isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400')
          }`}></span>
          <span className="text-neutral-300 font-bold tracking-wider">
            {isStoppedAndFrozen 
              ? 'TAPE STOP // BUFFER FROZEN' 
              : (isPlaying ? 'LIVE STREAM' : 'PAUSED')}
          </span>
          <span className="text-neutral-500">|</span>
          <span className="text-amber-400 font-bold truncate max-w-[340px]">
            {title}
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full border border-neutral-800 font-mono text-[10px] text-neutral-400">
          <span>{isStoppedAndFrozen ? 'TAPE STOP & BUFFER FREEZE ACTIF (EFFETS VISUELS & SHADERS ON)' : (isPlaying ? 'CLIC = PAUSE' : 'CLIC = PLAY')}</span>
        </div>
      </div>

      {/* Initial Play Overlay (Only on cold start before first playback) */}
      {!isPlaying && currentTime === 0 && !isStoppedAndFrozen && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/55 backdrop-blur-[2px] transition-colors pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-amber-500/95 flex items-center justify-center text-black shadow-[0_0_30px_rgba(255,157,0,0.7)] mb-3">
            <Play size={28} fill="black" className="ml-1" />
          </div>
          <span className="font-display font-bold text-xs tracking-widest text-amber-400 uppercase bg-black/85 px-3 py-1 rounded-full border border-amber-500/40">
            CLIQUER POUR LANCER LE FLUX
          </span>
        </div>
      )}

      {/* Floating Mini Transport Bar (Auto-hides after 2.5s or toggleable from menu) */}
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
