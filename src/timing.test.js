import test from 'node:test';
import assert from 'node:assert/strict';

import { getAdjustedElapsedMs, getResumedPromptStartTimestamp } from './timing.js';

test('adjusts the recording base timestamp to exclude paused duration', () => {
  assert.equal(getAdjustedElapsedMs(2500, 1000, 500), 1000);
});

test('resumes the current prompt from the same elapsed point after a pause', () => {
  assert.equal(getResumedPromptStartTimestamp(2500, 1500), 1000);
});
