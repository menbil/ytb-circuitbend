import * as THREE from 'three';

export const CircuitBendShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0.0 },
    uResolution: { value: new THREE.Vector2(1920, 1080) },
    
    // Core Circuit Bends
    uGlitchIntensity: { value: 0.0 },
    uRgbShift: { value: 0.0 },
    uScanlines: { value: 0.0 },
    uColorBleed: { value: 0.0 },
    uFeedback: { value: 0.0 },
    uNoise: { value: 0.0 },

    // Vaporwave, VHS & CRT Physics
    uVaporwaveTint: { value: 0.0 },
    uCrtCurvature: { value: 0.0 },
    uApertureGrille: { value: 0.0 },
    uVhsHeadSwitching: { value: 0.0 },
    uVHoldDrift: { value: 0.0 },

    // 3D Mesh & Advanced CRT Optical Bleed
    uMeshDisplacement: { value: 0.0 },
    uChromaSmear: { value: 0.0 },
    uAudioReact: { value: 0.0 },
    uAudioBass: { value: 0.0 },
    uLuminance: { value: 0.0 }
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    
    // Glitch uniforms
    uniform float uGlitchIntensity;
    uniform float uRgbShift;
    uniform float uScanlines;
    uniform float uColorBleed;
    uniform float uFeedback;
    uniform float uNoise;

    // Vaporwave & VHS uniforms
    uniform float uVaporwaveTint;
    uniform float uCrtCurvature;
    uniform float uApertureGrille;
    uniform float uVhsHeadSwitching;
    uniform float uVHoldDrift;

    // Optical smear & Audio Reactive uniforms
    uniform float uChromaSmear;
    uniform float uAudioReact;
    uniform float uAudioBass;
    uniform float uLuminance;
    uniform float uMeshDisplacement;

    varying vec2 vUv;

    // Pseudo-random hash
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    // CRT Barrel Curvature mapping
    vec2 distortBarrel(vec2 uv, float k) {
      vec2 cc = uv - 0.5;
      float dist = dot(cc, cc);
      return 0.5 + cc * (1.0 + k * 0.42 * dist);
    }

    void main() {
      // 1. CRT BARREL CURVATURE & CORNER MASK
      vec2 uv = vUv;
      float crtMask = 1.0;

      if (uCrtCurvature > 0.01) {
        uv = distortBarrel(uv, uCrtCurvature);
        
        // Smooth rounded CRT bezel vignette without early hard black return
        vec2 cornerDist = abs(uv - 0.5) * 2.0;
        float corner = length(max(cornerDist - vec2(0.88), vec2(0.0)));
        crtMask = smoothstep(0.18, 0.02, corner);
      }

      // 2. V-HOLD ROLL & VERTICAL BLANKING DRIFT (uVHoldDrift)
      if (uVHoldDrift > 0.01) {
        float rollSpeed = uVHoldDrift * 1.5;
        float vShift = fract(uTime * rollSpeed);
        uv.y = fract(uv.y + vShift);
      }

      // 3. VHS HEAD SWITCHING NOISE (Bottom edge tracking error)
      float headSwitchNoise = 0.0;
      if (uVhsHeadSwitching > 0.01) {
        float bottomZone = 0.052 * uVhsHeadSwitching;
        if (vUv.y < bottomZone) {
          float jitter = sin(vUv.y * 450.0 + uTime * 65.0) * 0.06 * uVhsHeadSwitching;
          uv.x += jitter + (hash(vec2(vUv.y * 30.0, uTime * 80.0)) - 0.5) * 0.12 * uVhsHeadSwitching;
          headSwitchNoise = hash(vec2(vUv.x * 300.0, vUv.y * 80.0 + fract(uTime * 50.0))) * 0.85 * uVhsHeadSwitching;
        }
      }

      // 4. H-SYNC LOSS & RANDOM FRAME TEARING (uGlitchIntensity modulated by Audio Kick)
      float effectiveGlitch = clamp(uGlitchIntensity + uAudioBass * uAudioReact * 0.40, 0.0, 1.0);
      if (effectiveGlitch > 0.001) {
        float sliceCount = 35.0 + floor(hash(vec2(floor(uTime * 12.0), 0.0)) * 40.0);
        float sliceY = floor(uv.y * sliceCount);
        float sliceNoise = hash(vec2(sliceY, floor(uTime * 15.0)));

        if (sliceNoise < effectiveGlitch * 0.65) {
          float displacement = (hash(vec2(sliceY, uTime)) - 0.5) * 0.28 * effectiveGlitch;
          uv.x += displacement;
        }

        if (hash(vec2(floor(uTime * 24.0), 7.3)) > (1.0 - effectiveGlitch * 0.4)) {
          uv.x += (hash(vec2(uv.y * 100.0, uTime)) - 0.5) * 0.09 * effectiveGlitch;
        }
      }

      uv = clamp(uv, 0.001, 0.999);

      // 5. RGB CHANNEL SPLIT / ABERRATION (uRgbShift) - Fast single tap when inactive
      float shiftAmount = (uRgbShift + uAudioBass * uAudioReact * 0.08) * 0.045;
      vec4 baseColor;
      if (shiftAmount > 0.0005) {
        vec2 rOffset = vec2(shiftAmount * cos(uTime * 2.0), shiftAmount * sin(uTime * 2.0));
        vec2 bOffset = -rOffset * 1.15;
        vec4 colR = texture2D(tDiffuse, clamp(uv + rOffset, 0.0, 1.0));
        vec4 colG = texture2D(tDiffuse, clamp(uv, 0.0, 1.0));
        vec4 colB = texture2D(tDiffuse, clamp(uv + bOffset, 0.0, 1.0));
        baseColor = vec4(colR.r, colG.g, colB.b, 1.0);
      } else {
        baseColor = texture2D(tDiffuse, clamp(uv, 0.0, 1.0));
      }

      // 6. CAPACITOR OVERCHARGE FEEDBACK (uFeedback)
      if (uFeedback > 0.01) {
        vec4 ghost1 = texture2D(tDiffuse, clamp(uv + vec2(-0.015, 0.008) * uFeedback, 0.0, 1.0));
        vec4 ghost2 = texture2D(tDiffuse, clamp(uv + vec2(0.025, -0.012) * uFeedback, 0.0, 1.0));
        vec4 ghostBlend = (ghost1 * 0.6 + ghost2 * 0.4);
        baseColor = mix(baseColor, baseColor + ghostBlend * 0.75, uFeedback);
      }

      // 6.5 HORIZONTAL CHROMA SMEAR & BEAM BLEED (uChromaSmear)
      if (uChromaSmear > 0.01) {
        float smearDist = (0.008 + 0.025 * uChromaSmear);
        vec4 smearR = texture2D(tDiffuse, clamp(uv + vec2(smearDist, 0.0), 0.0, 1.0));
        vec4 smearL = texture2D(tDiffuse, clamp(uv - vec2(smearDist * 0.5, 0.0), 0.0, 1.0));
        vec3 smearColor = (smearR.rgb * 0.65 + smearL.rgb * 0.35);
        
        // Beam bleed: bright pixels bleed across horizontal scanline
        float brightness = max(baseColor.r, max(baseColor.g, baseColor.b));
        float bleedFactor = smoothstep(0.65, 1.0, brightness) * uChromaSmear;
        baseColor.rgb = mix(baseColor.rgb, max(baseColor.rgb, smearColor * 1.2), uChromaSmear * 0.5 + bleedFactor * 0.5);
      }

      // 7. VAPORWAVE PASTEL COLOR GRADING & NTSC LIFT (uVaporwaveTint)
      if (uVaporwaveTint > 0.01) {
        // Vaporwave signature tones: Fuchsia #FF71CE & Cyan #01CDFE
        vec3 fuchsia = vec3(1.0, 0.443, 0.808);
        vec3 neonCyan = vec3(0.004, 0.804, 0.996);

        float luma = dot(baseColor.rgb, vec3(0.299, 0.587, 0.114));
        
        // Tone split: shadows to purple/fuchsia, highlights to warm cyan
        vec3 vaporGrade = mix(fuchsia * luma * 1.1, neonCyan * (1.0 - luma * 0.4) + baseColor.rgb * 0.6, luma);
        
        // Lifted nostalgic blacks (faded magnetic tape look)
        vec3 liftedBlacks = vec3(0.05, 0.02, 0.08) * uVaporwaveTint;
        vaporGrade += liftedBlacks;

        baseColor.rgb = mix(baseColor.rgb, vaporGrade, uVaporwaveTint * 0.75);
      }

      // 8. AGGRESSIVE COLOR BLEED (uColorBleed)
      if (uColorBleed > 0.01) {
        float luma = dot(baseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 saturated = mix(vec3(luma), baseColor.rgb, 1.0 + uColorBleed * 2.5);

        if (uColorBleed > 0.4) {
          float threshold = 1.3 - uColorBleed;
          if (saturated.r > threshold) saturated.r = 1.0 - saturated.r;
          if (saturated.g > threshold) saturated.g = 1.0 - saturated.g;
          if (saturated.b > threshold) saturated.b = 1.0 - saturated.b;
        }

        vec3 bentChroma = vec3(
          saturated.r * (1.0 + uColorBleed * 0.4),
          saturated.g * (1.0 - uColorBleed * 0.2),
          saturated.b * (1.0 + uColorBleed * 0.7)
        );
        baseColor.rgb = mix(baseColor.rgb, bentChroma, uColorBleed);
      }

      // 9. CRT SCANLINES & INTERLACING (uScanlines)
      if (uScanlines > 0.01) {
        float lineFreq = uResolution.y * 0.75;
        float scanline = sin(vUv.y * lineFreq + uTime * 6.0);
        float scanDarken = mix(1.0, 0.45 + 0.55 * ((scanline + 1.0) * 0.5), uScanlines);
        
        float rollBar = sin(vUv.y * 3.0 - uTime * 4.0);
        if (rollBar > 0.85) {
          scanDarken *= 1.0 + (rollBar - 0.85) * 1.5 * uScanlines;
        }
        baseColor.rgb *= scanDarken;
      }

      // 10. APERTURE GRILLE / RGB PHOSPHOR SHADOW MASK (uApertureGrille)
      if (uApertureGrille > 0.01) {
        float pixelX = floor(mod(gl_FragCoord.x, 3.0));
        vec3 mask = vec3(0.65);
        if (pixelX == 0.0) mask = vec3(1.25, 0.65, 0.65);
        else if (pixelX == 1.0) mask = vec3(0.65, 1.25, 0.65);
        else mask = vec3(0.65, 0.65, 1.25);

        baseColor.rgb *= mix(vec3(1.0), mask, uApertureGrille * 0.75);
      }

      // 10.5 LUMINANCE OVERDRIVE & WARM ANALOG GLOW (uLuminance)
      if (uLuminance > 0.01) {
        float luma = dot(baseColor.rgb, vec3(0.299, 0.587, 0.114));
        
        // Creamy optical highlight bloom & contrast lift
        vec3 lumaBoost = baseColor.rgb * (1.0 + uLuminance * 1.8);
        float highlightBloom = smoothstep(0.45, 0.95, luma) * uLuminance * 0.45;
        lumaBoost += vec3(highlightBloom * 1.1, highlightBloom * 0.95, highlightBloom * 1.25);
        
        // Solarize effect: smooth analog solarization on extreme peaks only
        if (uLuminance > 0.45) {
          float solarThresh = 1.35 - (uLuminance - 0.45) * 0.6;
          if (luma > solarThresh) {
            lumaBoost = mix(lumaBoost, 1.0 - lumaBoost * 0.8, (uLuminance - 0.45) * 0.9);
          }
        }
        baseColor.rgb = mix(baseColor.rgb, lumaBoost, uLuminance * 0.75);
      }

      // 10.8 ANALOG SCAN CONVOLUTION & 3D RELIEF EMBOSS (uMeshDisplacement)
      if (uMeshDisplacement > 0.01) {
        vec2 d = vec2(0.0018 + 0.0035 * uMeshDisplacement, 0.0018 + 0.0035 * uMeshDisplacement);
        vec4 s1 = texture2D(tDiffuse, clamp(uv - d, 0.0, 1.0));
        vec4 s2 = texture2D(tDiffuse, clamp(uv + d, 0.0, 1.0));
        float l1 = dot(s1.rgb, vec3(0.299, 0.587, 0.114));
        float l2 = dot(s2.rgb, vec3(0.299, 0.587, 0.114));
        
        // Directional emboss gradient
        float reliefDiff = (l1 - l2) * 3.5 * uMeshDisplacement;
        
        // Subtle Rutt-Etra / video-synth contour isolines
        float luma = dot(baseColor.rgb, vec3(0.299, 0.587, 0.114));
        float contour = sin((luma + reliefDiff * 0.3) * 34.0 - uTime * 1.5) * 0.5 + 0.5;
        
        // Blend directional bevel highlight & soft shadow
        vec3 reliefColor = vec3(reliefDiff * 0.85);
        vec3 contourGlow = vec3(0.12, 0.65, 1.0) * contour * (uMeshDisplacement * 0.35);
        baseColor.rgb += reliefColor + contourGlow;
      }

      // 11. RF STATIC & HEAD SWITCHING NOISE
      if (uNoise > 0.01) {
        float n = (hash(uv * 500.0 + fract(uTime * 37.0)) - 0.5) * 2.0;
        baseColor.rgb += vec3(n) * uNoise * 0.35;
      }
      if (headSwitchNoise > 0.0) {
        baseColor.rgb = mix(baseColor.rgb, vec3(headSwitchNoise), 0.75);
      }

      // Apply CRT barrel mask
      baseColor.rgb *= crtMask;

      gl_FragColor = vec4(clamp(baseColor.rgb, 0.0, 1.0), 1.0);
    }
  `
};
