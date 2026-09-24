import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTimestampCsv,
  buildTimestampRows,
  getIndividualAudioSource,
  getSessionAudioSource,
} from './exports.js';

test('session and full exports prefer untrimmed audio and fall back for legacy records', () => {
  const rawBlob = { name: 'raw' };
  const trimmedBlob = { name: 'trimmed' };
  const trimmedBuffer = { name: 'trimmed-buffer' };

  assert.equal(getSessionAudioSource({
    untrimmedBlob: rawBlob,
    blob: trimmedBlob,
    audioBuffer: trimmedBuffer,
  }), rawBlob);
  assert.equal(getSessionAudioSource({ blob: trimmedBlob, audioBuffer: trimmedBuffer }), trimmedBlob);
  assert.equal(getSessionAudioSource({ blob: trimmedBlob }), trimmedBlob);
});

test('individual audio stays trimmed in standalone and full exports', () => {
  const rawBlob = { name: 'raw' };
  const trimmedBlob = { name: 'trimmed' };
  const recording = { untrimmedBlob: rawBlob, blob: trimmedBlob };

  assert.equal(getIndividualAudioSource(recording), trimmedBlob);
});

test('buildTimestampRows matches voice onset positions in the raw session timeline', () => {
  const recordings = [
    { promptIndex: 1, rawDurationMs: 5000, trimStartMs: 2000, trimmedDurationMs: 3000 },
    { promptIndex: 2, rawDurationMs: 5000, trimStartMs: 1000, trimmedDurationMs: 3000 },
    { promptIndex: 3, rawDurationMs: 5000, trimStartMs: 500, trimmedDurationMs: 2119 },
  ];

  const rows = buildTimestampRows(recordings);

  assert.equal(rows[0].startMs, 2000);
  assert.equal(rows[0].durationMs, 3000);
  assert.equal(rows[1].startMs, 5000 + 1000);
  assert.equal(rows[1].durationMs, 3000);
  assert.equal(rows[2].startMs, 10000 + 500);
  assert.equal(rows[2].durationMs, 2119);
});

test('buildTimestampRows sorts by promptIndex regardless of input order', () => {
  const recordings = [
    { promptIndex: 2, rawDurationMs: 4000, trimStartMs: 0, trimmedDurationMs: 1000 },
    { promptIndex: 1, rawDurationMs: 3000, trimStartMs: 100, trimmedDurationMs: 500 },
  ];

  const rows = buildTimestampRows(recordings);

  assert.equal(rows[0].promptIndex, 1);
  assert.equal(rows[0].startMs, 100);
  assert.equal(rows[1].promptIndex, 2);
  assert.equal(rows[1].startMs, 3000);
});

test('buildTimestampRows falls back to configured task duration when untrimmed', () => {
  const recordings = [{ promptIndex: 1, trimStartMs: 0, trimmedDurationMs: null }];
  const rows = buildTimestampRows(recordings);

  // src/data/prompts.js task 1 duration is 3 seconds
  assert.equal(rows[0].durationMs, 3000);
});

test('buildTimestampCsv emits the expected header and rows', () => {
  const recordings = [
    { promptIndex: 1, rawDurationMs: 5000, trimStartMs: 296, trimmedDurationMs: 2259 },
    { promptIndex: 2, rawDurationMs: 5000, trimStartMs: 50, trimmedDurationMs: 1620 },
  ];

  const csv = buildTimestampCsv(recordings);
  const lines = csv.split('\n');

  assert.equal(lines[0], 'Task Name,Start,Duration,Time Format (Decimal),Type (Cue),Description');
  assert.equal(lines[1], 'Task 1,0:00.296,0:02.259,decimal,Cue,');
  assert.equal(lines[2], 'Task 2,0:05.050,0:01.620,decimal,Cue,');
});

test('buildTimestampCsv handles an empty session', () => {
  const csv = buildTimestampCsv([]);
  assert.equal(csv, 'Task Name,Start,Duration,Time Format (Decimal),Type (Cue),Description');
});

