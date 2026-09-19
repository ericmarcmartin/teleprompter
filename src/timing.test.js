import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAdjustedElapsedMs,
  getResumedPromptStartTimestamp,
  getRemainingTransitionMs,
  getTaskTransitionStartTimestamp,
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
