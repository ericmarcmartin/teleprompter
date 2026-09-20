import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWaveformLevels } from './waveform.js';

test('buildWaveformLevels returns 8 levels clamped to the 18–100 range for silence', () => {
  const levels = buildWaveformLevels(new Uint8Array(2048).fill(128));

  assert.equal(levels.length, 8);
  for (const level of levels) {
    assert.ok(level >= 18 && level <= 100);
  }
});

test('buildWaveformLevels rises with signal amplitude', () => {
  const silent = buildWaveformLevels(new Uint8Array(2048).fill(128));
  const loud = buildWaveformLevels(new Uint8Array(2048).fill(255));

  assert.ok(loud[0] > silent[0]);
  assert.ok(loud[0] <= 100);
});
