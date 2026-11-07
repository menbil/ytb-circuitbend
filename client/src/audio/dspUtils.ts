/**
 * Pure DSP mathematical utility functions for AudioCircuitEngine
 */

/**
 * Computes a bitcrush quantization transfer curve.
 * Maps input range [-1, 1] through an N-step staircase quantizer.
 */
export function computeBitcrushCurve(amount: number, samples: number = 2048): Float32Array {
  if (amount <= 0.01) {
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      curve[i] = (i / (samples - 1)) * 2 - 1;
    }
    return curve;
  }

  const curve = new Float32Array(samples);
  const steps = Math.max(3, Math.round(128 * Math.pow(1 - amount * 0.96, 2.5)));

  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    let y = Math.round(x * steps) / steps;
    if (amount > 0.5 && y > 0.4) {
      y = Math.min(1.0, y * (1.0 + (amount - 0.5) * 0.4));
    }
    curve[i] = y;
  }
  return curve;
}

/**
 * Generates an analog tape/tube soft-clipping saturation curve using hyperbolic tangent (tanh).
 * Uses gentle analog warmth without excessive makeup gain so mastered tracks never brickwall-clip.
 */
export function computeDriveCurve(amount: number, samples: number = 2048): Float32Array {
  if (amount <= 0.01) {
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      curve[i] = (i / (samples - 1)) * 2 - 1;
    }
    return curve;
  }

  const curve = new Float32Array(samples);
  const driveFactor = 1.0 + amount * 2.2;
  const norm = Math.tanh(driveFactor);
  // Attenuate output slightly as drive increases so perceived loudness stays balanced and warm
  const trim = 1.0 - amount * 0.22;

  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    const wet = (Math.tanh(x * driveFactor) / norm) * trim;
    // Blend dry + wet for smooth analog tape compression at low/mid drive
    const blend = Math.min(1.0, amount * 1.15);
    curve[i] = x * (1.0 - blend) + wet * blend;
  }
  return curve;
}

/**
 * Computes exponential decay envelope for smooth reverb reflections.
 */
export function computeExponentialDecay(t: number, decay: number): number {
  return Math.exp(-t * decay);
}

/**
 * Simulates a single step in a brownian random walk for analog noise.
 */
export function brownianStep(lastVal: number, randomWhite: number, leakFactor: number = 1.02): number {
  return (lastVal + 0.02 * randomWhite) / leakFactor;
}

