import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTimestampCsv,
  buildTimestampRows,
  createSessionAudioBlob,
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

test('session audio inserts the configured silent buffer between prompts', async () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    AudioContext: class {
      decodeAudioData = async () => ({
        numberOfChannels: 1,
        sampleRate: 1000,
        length: 10,
        getChannelData: () => Float32Array.from(new Array(10).fill(0.5)),
      });
      close = async () => {};
    },
  };

  try {
    const sessionBlob = await createSessionAudioBlob([
      { promptIndex: 1, untrimmedBlob: new Blob(['first']) },
      { promptIndex: 2, untrimmedBlob: new Blob(['second']) },
    ]);
    const wav = await sessionBlob.arrayBuffer();

    // Two 10 ms clips plus the configured 2-second buffer, normalized to 48 kHz.
    assert.equal(wav.byteLength, 44 + (480 + 96000 + 480) * 2);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('buildTimestampRows matches voice onset positions in the buffered session timeline', () => {
  const recordings = [
    { promptIndex: 1, rawDurationMs: 5000, trimStartMs: 2000, trimmedDurationMs: 3000 },
    { promptIndex: 2, rawDurationMs: 5000, trimStartMs: 1000, trimmedDurationMs: 3000 },
    { promptIndex: 3, rawDurationMs: 5000, trimStartMs: 500, trimmedDurationMs: 2119 },
  ];

  const rows = buildTimestampRows(recordings);

  assert.equal(rows[0].startMs, 2000);
  assert.equal(rows[0].durationMs, 3000);
  assert.equal(rows[1].startMs, 5000 + 2000 + 1000);
  assert.equal(rows[1].durationMs, 3000);
  assert.equal(rows[2].startMs, 10000 + 4000 + 500);
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
  assert.equal(rows[1].startMs, 3000 + 2000);
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
  assert.equal(lines[2], 'Task 2,0:07.050,0:01.620,decimal,Cue,');
});

test('buildTimestampCsv handles an empty session', () => {
  const csv = buildTimestampCsv([]);
  assert.equal(csv, 'Task Name,Start,Duration,Time Format (Decimal),Type (Cue),Description');
});

