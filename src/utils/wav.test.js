import test from 'node:test';
import assert from 'node:assert/strict';

import { audioBufferToWavBlob, createSilenceAudioBuffer, mergeAudioBuffersToWav } from './wav.js';

const makeFakeBuffer = (samples, sampleRate = 48000) => ({
  numberOfChannels: 1,
  sampleRate,
  length: samples.length,
  getChannelData: () => Float32Array.from(samples),
});

const makeStereoBuffer = (left, right, sampleRate = 48000) => ({
  numberOfChannels: 2,
  sampleRate,
  length: left.length,
  getChannelData: (channel) => Float32Array.from(channel === 0 ? left : right),
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

const readSampleRate = async (blob) => {
  const buffer = await blob.arrayBuffer();
  return new DataView(buffer).getUint32(24, true);
};

const readWavFormat = async (blob) => {
  const buffer = await blob.arrayBuffer();
  const view = new DataView(buffer);
  return {
    audioFormat: view.getUint16(20, true),
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
  };
};

test('audioBufferToWavBlob round-trips PCM samples', async () => {
  const buffer = makeFakeBuffer([0, 0.5, -0.5, 1, -1]);
  const blob = audioBufferToWavBlob(buffer);
  const samples = await readPcmSamples(blob);

  assert.equal(samples.length, 5);
  assert.deepEqual(await readWavFormat(blob), {
    audioFormat: 1,
    channels: 1,
    sampleRate: 48000,
    bitsPerSample: 16,
  });
  assert.ok(Math.abs(samples[1] - 0.5) < 0.001);
  assert.ok(Math.abs(samples[2] + 0.5) < 0.001);
});

test('createSilenceAudioBuffer creates zero-valued samples for a requested duration', () => {
  const silence = createSilenceAudioBuffer(2000, 1000, 2);

  assert.equal(silence.length, 2000);
  assert.equal(silence.numberOfChannels, 2);
  assert.ok(silence.getChannelData(0).every((sample) => sample === 0));
  assert.ok(silence.getChannelData(1).every((sample) => sample === 0));
});

test('audioBufferToWavBlob normalizes high-rate input to 48 kHz', async () => {
  const blob = audioBufferToWavBlob(makeFakeBuffer(new Array(96000).fill(0.25), 96000));

  assert.equal(await readSampleRate(blob), 48000);
  assert.equal((await blob.arrayBuffer()).byteLength, 44 + 48000 * 2);
});

test('audioBufferToWavBlob upsamples lower-rate input to 48 kHz', async () => {
  const blob = audioBufferToWavBlob(makeFakeBuffer(new Array(8000).fill(0.25), 8000));

  assert.equal(await readSampleRate(blob), 48000);
  assert.equal((await blob.arrayBuffer()).byteLength, 44 + 48000 * 2);
});

test('audioBufferToWavBlob downmixes same-rate stereo input to mono', async () => {
  const blob = audioBufferToWavBlob(makeStereoBuffer([0.25, 0.5], [0.75, 1]));
  const samples = await readPcmSamples(blob);

  assert.deepEqual(await readWavFormat(blob), {
    audioFormat: 1,
    channels: 1,
    sampleRate: 48000,
    bitsPerSample: 16,
  });
  assert.equal(samples.length, 2);
  assert.ok(Math.abs(samples[0] - 0.5) < 0.001);
  assert.ok(Math.abs(samples[1] - 0.75) < 0.001);
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

test('mergeAudioBuffersToWav normalizes mixed input rates', async () => {
  const first = makeFakeBuffer(new Array(8000).fill(0.25), 8000);
  const second = makeFakeBuffer(new Array(48000).fill(0.75), 48000);
  const merged = mergeAudioBuffersToWav([first, second]);
  const wavBuffer = await merged.arrayBuffer();

  assert.deepEqual(await readWavFormat(merged), {
    audioFormat: 1,
    channels: 1,
    sampleRate: 48000,
    bitsPerSample: 16,
  });
  assert.equal(wavBuffer.byteLength, 44 + 96000 * 2);
});
