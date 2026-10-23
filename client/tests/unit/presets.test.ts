import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PRESETS } from '../../src/presets.js';

describe('Preset Definitions & Schema Integrity', () => {
  it('should include the core default presets', () => {
    assert.ok(Array.isArray(PRESETS));
    assert.ok(PRESETS.length >= 4);

    const presetIds = PRESETS.map((p) => p.id);
    assert.ok(presetIds.includes('clean'), 'Must have bypass clean preset');
    assert.ok(presetIds.includes('abandoned-mall'), 'Must have abandoned mall preset');
  });

  it('all presets must have non-empty metadata fields', () => {
    for (const preset of PRESETS) {
      assert.ok(typeof preset.id === 'string' && preset.id.length > 0, `Preset missing valid id: ${preset.id}`);
      assert.ok(typeof preset.name === 'string' && preset.name.length > 0, `Preset missing name: ${preset.id}`);
      assert.ok(typeof preset.badge === 'string' && preset.badge.length > 0, `Preset missing badge: ${preset.id}`);
      assert.ok(typeof preset.description === 'string', `Preset missing description: ${preset.id}`);
    }
  });

  it('all audio parameters must remain within safe DSP boundaries', () => {
    for (const preset of PRESETS) {
      const audio = preset.audio;
      assert.ok(audio.bitcrush >= 0 && audio.bitcrush <= 1.0, `${preset.id}: bitcrush out of bounds`);
      assert.ok(audio.drive >= 0 && audio.drive <= 1.0, `${preset.id}: drive out of bounds`);
      assert.ok(audio.filterCutoff >= 20 && audio.filterCutoff <= 20000, `${preset.id}: filterCutoff out of bounds`);
      assert.ok(audio.filterResonance >= 0.1 && audio.filterResonance <= 30.0, `${preset.id}: filterResonance out of bounds`);
      assert.ok(['lowpass', 'highpass', 'bandpass'].includes(audio.filterType), `${preset.id}: invalid filterType`);
      assert.ok(audio.tapeSpeed >= 0.1 && audio.tapeSpeed <= 2.5, `${preset.id}: tapeSpeed out of bounds`);
      assert.ok(audio.masterVolume >= 0.0 && audio.masterVolume <= 1.0, `${preset.id}: masterVolume out of bounds`);
      assert.ok(audio.delayTime >= 0.0 && audio.delayTime <= 1.0, `${preset.id}: delayTime out of bounds`);
      assert.ok(audio.reverbWet >= 0.0 && audio.reverbWet <= 1.0, `${preset.id}: reverbWet out of bounds`);
    }
  });

  it('all video parameters must remain within normalized [0, 1] range', () => {
    for (const preset of PRESETS) {
      const video = preset.video;
      const normalizedKeys = [
        'glitchIntensity', 'rgbShift', 'scanlines', 'colorBleed',
        'feedback', 'noise', 'vaporwaveTint', 'crtCurvature',
        'apertureGrille', 'vhsHeadSwitching', 'vHoldDrift',
        'meshDisplacement', 'chromaSmear', 'audioReact', 'luminance'
      ] as const;

      for (const key of normalizedKeys) {
        const val = video[key];
        assert.ok(typeof val === 'number', `${preset.id}: video.${key} is not a number`);
        assert.ok(val >= 0 && val <= 1.0, `${preset.id}: video.${key} is out of [0, 1] range (${val})`);
      }
    }
  });
});

