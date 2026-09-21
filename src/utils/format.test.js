import test from 'node:test';
import assert from 'node:assert/strict';

import { formatDecimalTime, formatTime, toTranscriptFilename } from './format.js';

test('formatTime formats zero', () => {
  assert.equal(formatTime(0), '00:00:00.000');
});

test('formatTime pads hours, minutes, seconds, and milliseconds', () => {
  assert.equal(formatTime(3661234), '01:01:01.234');
  assert.equal(formatTime(60000), '00:01:00.000');
  assert.equal(formatTime(5), '00:00:00.005');
});

test('toTranscriptFilename falls back to a default task id', () => {
  assert.match(toTranscriptFilename('TASK-1001'), /^TASK-1001_.+_transcript\.txt$/);
  assert.match(toTranscriptFilename(''), /^task_.+_transcript\.txt$/);
});

test('formatDecimalTime formats minutes:seconds.millis without hours', () => {
  assert.equal(formatDecimalTime(0), '0:00.000');
  assert.equal(formatDecimalTime(296), '0:00.296');
  assert.equal(formatDecimalTime(2259), '0:02.259');
  assert.equal(formatDecimalTime(65432), '1:05.432');
});
