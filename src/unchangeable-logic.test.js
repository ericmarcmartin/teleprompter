// =============================================================================
// UNCHANGEABLE CORE LOGIC TESTS
//
// APPROVAL REQUIRED: Do not modify, remove, or weaken this file without the
// explicit approval of the product owner. These tests protect the core export
// and Start Over behavior of this application.
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

import { initialPromptSequence } from './data/prompts.js';
import { resetAppForStartOver } from './startOver.js';
import {
  buildTimestampCsv,
  createIndividualWavFiles,
  createSessionAudioBlob,
  exportAllFiles,
  exportIndividualRecordingFiles,
  exportSessionAudioFile,
  exportTimestampFile,
  getIndividualAudioSource,
  getSessionAudioSource,
} from './utils/exports.js';
import { audioBufferToWavBlob } from './utils/wav.js';

const makeAudioBuffer = (sampleRate = 24000, sample = 0.25) => ({
  numberOfChannels: 1,
  sampleRate,
  length: 4,
  getChannelData: () => Float32Array.from([sample, sample, sample, sample]),
});

const makeWavBlob = (sampleRate = 24000) => audioBufferToWavBlob(makeAudioBuffer(sampleRate));

const readWavSampleRate = async (blob) => {
  const buffer = await blob.arrayBuffer();
  return new DataView(buffer).getUint32(24, true);
};

const downloads = [];
const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

const installDownloadCapture = () => {
  downloads.length = 0;
  URL.createObjectURL = (blob) => {
    downloads.push({ blob, filename: null });
    return `blob:test-${downloads.length}`;
  };
  URL.revokeObjectURL = () => {};
  globalThis.document = {
    body: {
      appendChild: (anchor) => {
        downloads[downloads.length - 1].filename = anchor.download;
      },
      removeChild: () => {},
    },
    createElement: () => ({ click: () => {} }),
  };
};

const restoreDownloadCapture = () => {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
  URL.createObjectURL = originalCreateObjectUrl;
  URL.revokeObjectURL = originalRevokeObjectUrl;
};

const makeRecordings = (count = 2) => Array.from({ length: count }, (_, index) => ({
  taskId: 'TASK-1001',
  promptIndex: index + 1,
  blob: makeWavBlob(),
  untrimmedBlob: new Blob([`raw-${index}`], { type: 'audio/webm' }),
  trimStartMs: 100,
  trimmedDurationMs: 200,
}));

test.afterEach(() => {
  restoreDownloadCapture();
});

test('timestamp output is exported by Timestamp and All with the canonical CSV', async () => {
  const recordings = makeRecordings();
  const expectedCsv = buildTimestampCsv(recordings);

  installDownloadCapture();
  assert.equal(exportTimestampFile(recordings, 'TASK-1001'), 'Timestamp CSV exported.');
  assert.match(downloads[0].filename, /TASK-1001_.*_timestamps\.csv$/);
  assert.equal(await downloads[0].blob.text(), expectedCsv);

  globalThis.window = {
    AudioContext: class {
      decodeAudioData = async () => makeAudioBuffer();
      close = async () => {};
    },
  };
  await exportAllFiles(recordings, 'TASK-1001');
  const archive = await JSZip.loadAsync(downloads[1].blob);
  assert.equal(await archive.file('TASK-1001_timestamps.csv').async('text'), expectedCsv);
});

test('individual export is trimmed, including individual files inside All', async () => {
  const recordings = makeRecordings();

  assert.equal(getIndividualAudioSource(recordings[0]), recordings[0].blob);
  assert.notEqual(getIndividualAudioSource(recordings[0]), recordings[0].untrimmedBlob);
  const individualFiles = await createIndividualWavFiles(recordings, 'TASK-1001');
  assert.equal(individualFiles.length, recordings.length);
  assert.equal(await readWavSampleRate(individualFiles[0].blob), 24000);

  installDownloadCapture();
  await exportIndividualRecordingFiles(recordings, 'TASK-1001');
  globalThis.window = {
    AudioContext: class {
      decodeAudioData = async () => makeAudioBuffer();
      close = async () => {};
    },
  };
  await exportAllFiles(recordings, 'TASK-1001');
  const archive = await JSZip.loadAsync(downloads[1].blob);
  assert.equal(await readWavSampleRate(await archive.file('task1_TASK-1001.wav').async('blob')), 24000);
});

test('session export is untrimmed and All uses untrimmed audio only for session', async () => {
  const recordings = makeRecordings();
  const decodedInputs = [];

  globalThis.window = {
    AudioContext: class {
      decodeAudioData = async (arrayBuffer) => {
        decodedInputs.push(new TextDecoder().decode(arrayBuffer));
        return makeAudioBuffer(48000);
      };
      close = async () => {};
    },
  };

  assert.equal(getSessionAudioSource(recordings[0]), recordings[0].untrimmedBlob);
  const sessionBlob = await createSessionAudioBlob(recordings);
  assert.equal(await readWavSampleRate(sessionBlob), 24000);
  assert.deepEqual(decodedInputs, ['raw-0', 'raw-1']);

  installDownloadCapture();
  await exportSessionAudioFile(recordings, 'TASK-1001');
  assert.equal(await readWavSampleRate(downloads[0].blob), 24000);

  await exportAllFiles(recordings, 'TASK-1001');
  const archive = await JSZip.loadAsync(downloads[1].blob);
  assert.equal(await readWavSampleRate(await archive.file('TASK-1001_session.wav').async('blob')), 24000);
  assert.equal(await readWavSampleRate(await archive.file('task1_TASK-1001.wav').async('blob')), 24000);
});

test('200 recorded prompts produce 200 individual files', async () => {
  const recordings = makeRecordings(200);
  const individualFiles = await createIndividualWavFiles(recordings, 'TASK-1001');

  assert.equal(recordings.length, 200);
  assert.equal(individualFiles.length, 200);
});

test('Start Over clears playback, recording state, navigation, waveform, and URL', () => {
  const calls = [];
  const previewAudio = {
    pause: () => calls.push('pause'),
    src: 'recording.wav',
  };
  const playback = {
    previewAudioRef: { current: previewAudio },
    stopPlaybackAudio: () => calls.push('stopPlaybackAudio'),
    setIsPlayingPreview: (value) => calls.push(['setIsPlayingPreview', value]),
  };
  const session = {
    setIsStopped: (value) => calls.push(['setIsStopped', value]),
    teardownRecorderAndStream: () => calls.push('teardownRecorderAndStream'),
    clearWaveform: () => calls.push('clearWaveform'),
    resetRecordingState: (options) => calls.push(['resetRecordingState', options]),
    setStatus: (value) => calls.push(['setStatus', value]),
  };
  const history = { replaceState: (...args) => calls.push(['replaceState', ...args]) };

  resetAppForStartOver({
    playback,
    session,
    setPageHistory: (value) => calls.push(['setPageHistory', value]),
    setCanGoForward: (value) => calls.push(['setCanGoForward', value]),
    setForwardPage: (value) => calls.push(['setForwardPage', value]),
    history,
  });

  assert.equal(previewAudio.src, '');
  assert.deepEqual(calls, [
    'stopPlaybackAudio',
    'pause',
    ['setIsPlayingPreview', false],
    ['setIsStopped', false],
    ['setPageHistory', []],
    ['setCanGoForward', false],
    ['setForwardPage', null],
    'teardownRecorderAndStream',
    'clearWaveform',
    ['resetRecordingState', { clearSavedRecordings: true }],
    ['setStatus', 'Microphone ready. Press Record to begin.'],
    ['replaceState', {}, '', '/recording-collection-software'],
  ]);
});