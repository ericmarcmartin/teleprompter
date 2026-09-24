import test from 'node:test';
import assert from 'node:assert/strict';

import { detectSpeechRegion, trimAudioBuffer, trimSilenceFromAudioBuffer } from './audioTrim.js';

// Minimal fake AudioBuffer: silence, then a loud burst, then silence again.
const makeFakeBuffer = ({ sampleRate = 1000, silenceMs = 100, speechMs = 100, amplitude = 0.5 }) => {
  const silenceSamples = Math.round((silenceMs / 1000) * sampleRate);
  const speechSamples = Math.round((speechMs / 1000) * sampleRate);
  const length = silenceSamples * 2 + speechSamples;
  const data = new Float32Array(length);
  for (let i = silenceSamples; i < silenceSamples + speechSamples; i += 1) {
    data[i] = amplitude;
  }
  return {
    numberOfChannels: 1,
    sampleRate,
    length,
    getChannelData: () => data,
  };
};

test('detectSpeechRegion finds the loud region and ignores surrounding silence', () => {
  const buffer = makeFakeBuffer({ silenceMs: 100, speechMs: 100 });
  const region = detectSpeechRegion(buffer, { thresholdDb: -20, frameMs: 10 });

  assert.ok(region);
  assert.ok(region.onsetMs >= 90 && region.onsetMs <= 110);
  assert.ok(region.offsetMs >= 190 && region.offsetMs <= 210);
});

test('detectSpeechRegion returns null for an entirely silent buffer', () => {
  const buffer = makeFakeBuffer({ silenceMs: 100, speechMs: 0, amplitude: 0 });
  const region = detectSpeechRegion(buffer, { thresholdDb: -20 });
  assert.equal(region, null);
});

test('trimAudioBuffer slices channel data to the requested window', () => {
  const buffer = makeFakeBuffer({ silenceMs: 100, speechMs: 100 });
  const trimmed = trimAudioBuffer(buffer, 100, 200);

  assert.equal(trimmed.length, 100);
  assert.ok(trimmed.getChannelData(0).every((sample) => sample === 0.5));
});

test('trimSilenceFromAudioBuffer trims leading and trailing silence', () => {
  const buffer = makeFakeBuffer({ silenceMs: 100, speechMs: 100 });
  const { onsetMs, durationMs, trimmedBuffer } = trimSilenceFromAudioBuffer(buffer, { thresholdDb: -20, frameMs: 10 });

  assert.equal(onsetMs, 0);
  assert.equal(durationMs, 300);
  assert.equal(trimmedBuffer.length, 300);
  assert.equal(trimmedBuffer.getChannelData(0)[100], 0.5);
});

test('trimSilenceFromAudioBuffer clamps allowance to the source boundaries', () => {
  const buffer = makeFakeBuffer({ silenceMs: 0, speechMs: 100 });
  const { onsetMs, durationMs, trimmedBuffer } = trimSilenceFromAudioBuffer(buffer, { thresholdDb: -20, frameMs: 10 });

  assert.equal(onsetMs, 0);
  assert.equal(durationMs, 100);
  assert.equal(trimmedBuffer.length, buffer.length);
});

test('trimSilenceFromAudioBuffer falls back to a minimal clip when all-silent', () => {
  const buffer = makeFakeBuffer({ silenceMs: 200, speechMs: 0, amplitude: 0 });
  const { onsetMs, durationMs, trimmedBuffer } = trimSilenceFromAudioBuffer(buffer, { thresholdDb: -20, frameMs: 20 });

  assert.equal(onsetMs, 0);
  assert.ok(durationMs <= 20);
  assert.ok(trimmedBuffer.length < buffer.length);
});
