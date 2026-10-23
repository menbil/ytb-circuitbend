import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  MidiEngine,
  LAUNCH_CONTROL_PROFILE,
  LAUNCH_CONTROL_XL_PROFILE,
  GENERIC_PROFILE
} from '../../src/midi/MidiEngine.js';

describe('Web MIDI Engine & Novation Launch Control Mapping', () => {
  it('Launch Control profile defines all 16 knobs and pads', () => {
    // Top Row: Knobs 1 to 8 (CC 21 to 28)
    for (let cc = 21; cc <= 28; cc++) {
      assert.ok(LAUNCH_CONTROL_PROFILE.ccMap[cc], `Missing Launch Control CC ${cc}`);
    }

    // Bottom Row: Knobs 9 to 16 (CC 41 to 48)
    for (let cc = 41; cc <= 48; cc++) {
      assert.ok(LAUNCH_CONTROL_PROFILE.ccMap[cc], `Missing Launch Control CC ${cc}`);
    }

    // CC Mode Pads (CC 73 to 80)
    for (let cc = 73; cc <= 80; cc++) {
      assert.ok(LAUNCH_CONTROL_PROFILE.ccMap[cc], `Missing Launch Control Pad CC ${cc}`);
    }

    // Note Mode Pads (Notes 9 to 12 and 25 to 28)
    assert.strictEqual(LAUNCH_CONTROL_PROFILE.noteMap[9], 'action.playToggle');
    assert.strictEqual(LAUNCH_CONTROL_PROFILE.noteMap[10], 'action.tapeFreeze');
    assert.strictEqual(LAUNCH_CONTROL_PROFILE.noteMap[11], 'action.randomize');
    assert.strictEqual(LAUNCH_CONTROL_PROFILE.noteMap[12], 'action.resetClean');
    assert.strictEqual(LAUNCH_CONTROL_PROFILE.noteMap[25], 'action.snapshot');
    assert.strictEqual(LAUNCH_CONTROL_PROFILE.noteMap[26], 'action.recordToggle');
    assert.strictEqual(LAUNCH_CONTROL_PROFILE.noteMap[27], 'action.preset1');
    assert.strictEqual(LAUNCH_CONTROL_PROFILE.noteMap[28], 'action.preset2');
  });

  it('Launch Control XL profile maps 24 knobs and 8 faders', () => {
    // Send A: CC 13 to 20
    for (let cc = 13; cc <= 20; cc++) {
      assert.ok(LAUNCH_CONTROL_XL_PROFILE.ccMap[cc], `Missing XL CC ${cc}`);
    }
    // Send B: CC 29 to 36
    for (let cc = 29; cc <= 36; cc++) {
      assert.ok(LAUNCH_CONTROL_XL_PROFILE.ccMap[cc], `Missing XL CC ${cc}`);
    }
    // Pan: CC 49 to 56
    for (let cc = 49; cc <= 56; cc++) {
      assert.ok(LAUNCH_CONTROL_XL_PROFILE.ccMap[cc], `Missing XL CC ${cc}`);
    }
    // Faders: CC 77 to 84
    for (let cc = 77; cc <= 84; cc++) {
      assert.ok(LAUNCH_CONTROL_XL_PROFILE.ccMap[cc], `Missing XL Fader CC ${cc}`);
    }
  });

  it('MidiEngine dispatches CC messages accurately to target and normalizes [0, 1]', () => {
    const engine = new MidiEngine();
    let dispatchedTarget = '';
    let dispatchedVal = -1;

    engine.init((target, val) => {
      dispatchedTarget = target;
      dispatchedVal = val;
    });

    // Simulate Launch Control turning Knob 1 (CC 21) to value 64 (~0.5)
    (engine as any).handleMidiMessage(
      { data: new Uint8Array([0xb0, 21, 64]) },
      'Launch Control'
    );

    assert.strictEqual(dispatchedTarget, 'video.glitchIntensity');
    assert.ok(Math.abs(dispatchedVal - (64 / 127)) < 1e-4);

    // Simulate Launch Control turning Knob 9 (CC 29) to value 127 (1.0)
    (engine as any).handleMidiMessage(
      { data: new Uint8Array([0xb0, 29, 127]) },
      'Launch Control'
    );

    assert.strictEqual(dispatchedTarget, 'audio.drive');
    assert.strictEqual(dispatchedVal, 1.0);
  });

  it('MidiEngine triggers action.tapeFreeze on Pad 2 via Note or CC', () => {
    const engine = new MidiEngine();
    let actionTriggered = '';
    let triggerCount = 0;

    engine.init((target, _val, isTrigger) => {
      if (isTrigger) {
        actionTriggered = target;
        triggerCount++;
      }
    });

    // 1. Pad 2 via Factory Note 10 (velocity 127)
    (engine as any).handleMidiMessage(
      { data: new Uint8Array([0x90, 10, 127]) },
      'Launch Control'
    );
    assert.strictEqual(actionTriggered, 'action.tapeFreeze');
    assert.strictEqual(triggerCount, 1);

    // Note Off (velocity 0) should NOT trigger
    (engine as any).handleMidiMessage(
      { data: new Uint8Array([0x90, 10, 0]) },
      'Launch Control'
    );
    assert.strictEqual(triggerCount, 1);

    // 2. Pad 2 via User Template Note 37
    (engine as any).handleMidiMessage(
      { data: new Uint8Array([0x90, 37, 100]) },
      'Launch Control'
    );
    assert.strictEqual(actionTriggered, 'action.tapeFreeze');
    assert.strictEqual(triggerCount, 2);

    // 3. Pad 2 via CC Mode 74 (value 127 on press)
    (engine as any).handleMidiMessage(
      { data: new Uint8Array([0xb0, 74, 127]) },
      'Launch Control'
    );
    assert.strictEqual(actionTriggered, 'action.tapeFreeze');
    assert.strictEqual(triggerCount, 3);

    // CC release (value 0) should NOT trigger
    (engine as any).handleMidiMessage(
      { data: new Uint8Array([0xb0, 74, 0]) },
      'Launch Control'
    );
    assert.strictEqual(triggerCount, 3);
  });

  it('Pad 1 (playToggle) and Pad 2 (tapeFreeze) are completely separated without conflict', () => {
    const engine = new MidiEngine();
    const history: Array<{ target: string; isTrigger: boolean }> = [];

    engine.init((target, _val, isTrigger) => {
      history.push({ target, isTrigger });
    });

    // Pad 1 press (CC 73)
    (engine as any).handleMidiMessage({ data: new Uint8Array([0xb0, 73, 127]) }, 'Launch Control');
    assert.strictEqual(history[history.length - 1].target, 'action.playToggle');
    assert.strictEqual(history[history.length - 1].isTrigger, true);

    // Pad 2 press (CC 74)
    (engine as any).handleMidiMessage({ data: new Uint8Array([0xb0, 74, 127]) }, 'Launch Control');
    assert.strictEqual(history[history.length - 1].target, 'action.tapeFreeze');
    assert.strictEqual(history[history.length - 1].isTrigger, true);

    // Pad 1 press Note (User Template 1: Note 36)
    (engine as any).handleMidiMessage({ data: new Uint8Array([0x90, 36, 127]) }, 'Launch Control');
    assert.strictEqual(history[history.length - 1].target, 'action.playToggle');

    // Pad 2 press Note (User Template 1: Note 37)
    (engine as any).handleMidiMessage({ data: new Uint8Array([0x90, 37, 127]) }, 'Launch Control');
    assert.strictEqual(history[history.length - 1].target, 'action.tapeFreeze');

    // Factory Template 1: Note 9 (Pad 1) & Note 10 (Pad 2)
    (engine as any).handleMidiMessage({ data: new Uint8Array([0x90, 9, 127]) }, 'Launch Control');
    assert.strictEqual(history[history.length - 1].target, 'action.playToggle');
    (engine as any).handleMidiMessage({ data: new Uint8Array([0x90, 10, 127]) }, 'Launch Control');
    assert.strictEqual(history[history.length - 1].target, 'action.tapeFreeze');
  });

  it('MidiEngine MIDI Learn mode dynamically re-binds CC and persists', () => {
    const engine = new MidiEngine();
    let dispatchedTarget = '';

    engine.init((target) => {
      dispatchedTarget = target;
    });

    // Arm MIDI Learn for luminance
    engine.setLearnTarget('video.luminance');
    assert.strictEqual(engine.getLearnTarget(), 'video.luminance');

    // Turn an unmapped knob (e.g. CC 105)
    (engine as any).handleMidiMessage(
      { data: new Uint8Array([0xb0, 105, 90]) },
      'Launch Control'
    );

    // Learn should have auto-disarmed
    assert.strictEqual(engine.getLearnTarget(), null);

    // Turning CC 105 again should now dispatch video.luminance
    (engine as any).handleMidiMessage(
      { data: new Uint8Array([0xb0, 105, 110]) },
      'Launch Control'
    );

    assert.strictEqual(dispatchedTarget, 'video.luminance');
  });
});

