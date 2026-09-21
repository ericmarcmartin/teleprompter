import test from 'node:test';
import assert from 'node:assert/strict';

import { audioBufferToWavBlob, mergeAudioBuffersToWav } from './wav.js';

const makeFakeBuffer = (samples, sampleRate = 8000) => ({
  numberOfChannels: 1,
  sampleRate,
  length: samples.length,
  getChannelData: () => Float32Array.from(samples),
});

// Reads 16-bit PCM samples back out of an encoded WAV blob (mono only, 44-byte header).
const readPcmSamples = async (blob) => {
  const buffer = await blob.arrayBuffer();
  const view = new DataView(buffer);
  const sampleCount = (buffer.byteLength - 44) / 2;
  const samples = [];
  for (let i = 0; i < sampleCount; i += 1) {
    samples.push(view.getInt16(44 + i * 2, true) / 0x7fff);
  }
  return samples;
};

test('audioBufferToWavBlob round-trips PCM samples', async () => {
  const buffer = makeFakeBuffer([0, 0.5, -0.5, 1, -1]);
  const blob = audioBufferToWavBlob(buffer);
  const samples = await readPcmSamples(blob);

  assert.equal(samples.length, 5);
  assert.ok(Math.abs(samples[1] - 0.5) < 0.001);
  assert.ok(Math.abs(samples[2] + 0.5) < 0.001);
});

test('mergeAudioBuffersToWav concatenates buffers back-to-back with no data loss', async () => {
  const first = makeFakeBuffer([0.25, 0.25]);
  const second = makeFakeBuffer([0.75, 0.75, 0.75]);

  const merged = mergeAudioBuffersToWav([first, second]);
  const samples = await readPcmSamples(merged);

  assert.equal(samples.length, 5);
  assert.ok(Math.abs(samples[0] - 0.25) < 0.001);
  assert.ok(Math.abs(samples[1] - 0.25) < 0.001);
  assert.ok(Math.abs(samples[2] - 0.75) < 0.001);
  assert.ok(Math.abs(samples[3] - 0.75) < 0.001);
  assert.ok(Math.abs(samples[4] - 0.75) < 0.001);
});

test('mergeAudioBuffersToWav returns null for an empty list', () => {
  assert.equal(mergeAudioBuffersToWav([]), null);
});
