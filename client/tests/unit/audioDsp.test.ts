import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  computeBitcrushCurve,
  computeDriveCurve,
  computeExponentialDecay,
  brownianStep
} from '../../src/audio/dspUtils.js';

describe('Audio DSP Mathematical Algorithms', () => {
  describe('computeBitcrushCurve', () => {
    it('returns a linear 1:1 pass-through ramp when amount is 0 (bypass)', () => {
      const curve = computeBitcrushCurve(0.0, 1024);
      assert.strictEqual(curve.length, 1024);
      assert.ok(Math.abs(curve[0] - (-1)) < 1e-4);
      assert.ok(Math.abs(curve[1023] - 1) < 1e-4);
      // Midpoint should be approximately 0
      assert.ok(Math.abs(curve[512]) < 0.01);
    });

    it('quantizes outputs into discrete stair-step buckets when amount > 0', () => {
      const curve = computeBitcrushCurve(0.9, 2048);
      const uniqueValues = new Set(Array.from(curve).map((v) => v.toFixed(3)));
      // A strong bitcrush should heavily reduce resolution down to very few discrete levels
      assert.ok(uniqueValues.size < 20, `Expected low step count but got ${uniqueValues.size}`);
    });

    it('keeps all output samples strictly within [-1.0, 1.0]', () => {
      for (const amount of [0.0, 0.25, 0.5, 0.75, 1.0]) {
        const curve = computeBitcrushCurve(amount, 512);
        for (let i = 0; i < curve.length; i++) {
          assert.ok(curve[i] >= -1.001 && curve[i] <= 1.001, `Sample out of bounds at ${amount}: ${curve[i]}`);
        }
      }
    });
  });

  describe('computeDriveCurve (Analog Tanh Saturation)', () => {
    it('returns a linear identity curve when drive is 0', () => {
      const curve = computeDriveCurve(0.0, 1024);
      assert.ok(Math.abs(curve[0] - (-1)) < 1e-4);
      assert.ok(Math.abs(curve[1023] - 1) < 1e-4);
    });

    it('saturates smoothly and is strictly monotonic (increasing)', () => {
      const curve = computeDriveCurve(0.8, 1024);
      for (let i = 1; i < curve.length; i++) {
        assert.ok(curve[i] >= curve[i - 1], `Curve is not monotonic at index ${i}`);
      }
    });

    it('normalizes output so extrema never clip past -1.0 or +1.0', () => {
      for (const drive of [0.1, 0.5, 0.9, 1.0]) {
        const curve = computeDriveCurve(drive, 512);
        assert.ok(Math.abs(curve[0] - (-1.0)) < 1e-3);
        assert.ok(Math.abs(curve[curve.length - 1] - 1.0) < 1e-3);
      }
    });
  });

  describe('computeExponentialDecay & brownianStep', () => {
    it('computes exponential decay correctly starting at 1.0 at t=0', () => {
      const decay0 = computeExponentialDecay(0, 2.4);
      assert.strictEqual(decay0, 1.0);

      const decay1 = computeExponentialDecay(1, 2.4);
      assert.ok(decay1 < 0.15 && decay1 > 0);
    });

    it('brownian step stays bounded under continuous random simulation', () => {
      let val = 0;
      for (let i = 0; i < 5000; i++) {
        const white = (Math.random() * 2 - 1);
        val = brownianStep(val, white, 1.02);
        assert.ok(Math.abs(val) < 5.0, `Brownian step exploded to ${val}`);
      }
    });
  });
});

