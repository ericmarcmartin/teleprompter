import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTimestampCsv, buildTimestampRows } from './exports.js';

test('buildTimestampRows chains Start/Duration contiguously from trimmed values', () => {
  const recordings = [
    { promptIndex: 1, trimStartMs: 296, trimmedDurationMs: 2259 },
    { promptIndex: 2, trimStartMs: 50, trimmedDurationMs: 1620 },
    { promptIndex: 3, trimStartMs: 10, trimmedDurationMs: 2119 },
  ];

  const rows = buildTimestampRows(recordings);

  assert.equal(rows[0].startMs, 296);
  assert.equal(rows[0].durationMs, 2259);
  // start[i] = start[i-1] + duration[i-1], NOT based on rec.trimStartMs for i > 0
  assert.equal(rows[1].startMs, 296 + 2259);
  assert.equal(rows[1].durationMs, 1620);
  assert.equal(rows[2].startMs, rows[1].startMs + rows[1].durationMs);
  assert.equal(rows[2].durationMs, 2119);
});

test('buildTimestampRows sorts by promptIndex regardless of input order', () => {
  const recordings = [
    { promptIndex: 2, trimStartMs: 0, trimmedDurationMs: 1000 },
    { promptIndex: 1, trimStartMs: 100, trimmedDurationMs: 500 },
  ];

  const rows = buildTimestampRows(recordings);

  assert.equal(rows[0].promptIndex, 1);
  assert.equal(rows[0].startMs, 100);
  assert.equal(rows[1].promptIndex, 2);
  assert.equal(rows[1].startMs, 600);
});

test('buildTimestampRows falls back to configured task duration when untrimmed', () => {
  const recordings = [{ promptIndex: 1, trimStartMs: 0, trimmedDurationMs: null }];
  const rows = buildTimestampRows(recordings);

  // src/data/prompts.js task 1 duration is 3 seconds
  assert.equal(rows[0].durationMs, 3000);
});

test('buildTimestampCsv emits the expected header and rows', () => {
  const recordings = [
    { promptIndex: 1, trimStartMs: 296, trimmedDurationMs: 2259 },
    { promptIndex: 2, trimStartMs: 50, trimmedDurationMs: 1620 },
  ];

  const csv = buildTimestampCsv(recordings);
  const lines = csv.split('\n');

  assert.equal(lines[0], 'Task Name,Start,Duration,Time Format (Decimal),Type (Cue),Description');
  assert.equal(lines[1], 'Task 1,0:00.296,0:02.259,decimal,Cue,');
  assert.equal(lines[2], 'Task 2,0:02.555,0:01.620,decimal,Cue,');
});

test('buildTimestampCsv handles an empty session', () => {
  const csv = buildTimestampCsv([]);
  assert.equal(csv, 'Task Name,Start,Duration,Time Format (Decimal),Type (Cue),Description');
});

