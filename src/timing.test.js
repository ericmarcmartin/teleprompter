import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAdjustedElapsedMs,
  getResumedPromptStartTimestamp,
  getRemainingTransitionMs,
  getTaskTransitionStartTimestamp,
  getTaskWindowMs,
} from './timing.js';

test('adjusts the recording base timestamp to exclude paused duration', () => {
  assert.equal(getAdjustedElapsedMs(2500, 1000, 500), 1000);
});

test('resumes the current prompt from the same elapsed point after a pause', () => {
  assert.equal(getResumedPromptStartTimestamp(2500, 1500), 1000);
});

test('freezes the 2 second task-transition countdown while paused and resumes from the remaining time', () => {
  assert.equal(getRemainingTransitionMs(750, 2000), 1250);
  assert.equal(getRemainingTransitionMs(2600, 2000), 0);
});

test('adds a 2 second gap before the next task starts after the current task completes', () => {
  assert.equal(getTaskTransitionStartTimestamp(4000, 1000, 2000, 2000), 6000);
  assert.equal(getTaskTransitionStartTimestamp(3000, 1000, 2000, 2000), 5000);
});

test('task windows are contiguous exact-second blocks with zero ms offsets', () => {
  const sequence = [{ duration: 2 }, { duration: 2 }, { duration: 2 }];
  assert.deepEqual(getTaskWindowMs(sequence, 0), { startMs: 0, endMs: 2000 });
  assert.deepEqual(getTaskWindowMs(sequence, 1), { startMs: 2000, endMs: 4000 });
  assert.deepEqual(getTaskWindowMs(sequence, 2), { startMs: 4000, endMs: 6000 });
});

test('task windows respect uneven durations', () => {
  const sequence = [{ duration: 1.5 }, { duration: 2.5 }];
  assert.deepEqual(getTaskWindowMs(sequence, 0), { startMs: 0, endMs: 1500 });
  assert.deepEqual(getTaskWindowMs(sequence, 1), { startMs: 1500, endMs: 4000 });
});
