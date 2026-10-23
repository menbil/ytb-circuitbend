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
 * Normalizes output gain so peak signal never exceeds [-1, +1].
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
  const driveFactor = 1.0 + amount * 3.8;
  const norm = Math.tanh(driveFactor); // Gain normalization factor

  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    const y = Math.tanh(x * driveFactor) / norm;
    curve[i] = y;
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

