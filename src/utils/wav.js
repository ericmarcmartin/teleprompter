// WAV encoding helpers — decode recorded blobs and re-encode as 16-bit PCM WAV.

import { resampleAudioBuffer } from './resample.js';

const WAV_BITS_PER_SAMPLE = 16;

export const createSilenceAudioBuffer = (durationMs, sampleRate = 48000, numberOfChannels = 1) => {
  const length = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const channelData = Array.from({ length: numberOfChannels }, () => new Float32Array(length));

  return {
    numberOfChannels,
    sampleRate,
    length,
    getChannelData: (channel) => channelData[channel],
  };
};

export const audioBufferToWavBlob = (audioBuffer) => {
  const normalizedBuffer = resampleAudioBuffer(audioBuffer);
  const channels = normalizedBuffer.numberOfChannels;
  const sampleRate = normalizedBuffer.sampleRate;
  const length = normalizedBuffer.length;
  const bytesPerSample = WAV_BITS_PER_SAMPLE / 8;
  const wavBuffer = new ArrayBuffer(44 + length * channels * bytesPerSample);
  const view = new DataView(wavBuffer);

  const writeString = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * channels * bytesPerSample, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, WAV_BITS_PER_SAMPLE, true);
  writeString(36, 'data');
  view.setUint32(40, length * channels * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, normalizedBuffer.getChannelData(channel)[i] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
};

export const convertBlobToWav = async (blob) => {
  if (!blob) return null;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  const context = new AudioContextClass();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    return audioBufferToWavBlob(decoded);
  } finally {
    context.close().catch(() => undefined);
  }
};

export const mergeAudioBuffersToWav = (audioBuffers) => {
  if (!audioBuffers.length) {
    return null;
  }

  const normalizedBuffers = audioBuffers.map((buffer) => resampleAudioBuffer(buffer));
  const numberOfChannels = Math.max(...normalizedBuffers.map((buffer) => buffer.numberOfChannels));
  const sampleRate = normalizedBuffers[0].sampleRate;
  const totalLength = normalizedBuffers.reduce((sum, buffer) => sum + buffer.length, 0);

  // Plain Float32Array channels — NOT a real AudioContext-created AudioBuffer.
  // Writing through AudioBuffer.getChannelData() and mutating in place isn't
  // guaranteed to persist on every engine (notably WebKit/Safari can return a
  // copy), which silently dropped the merged audio. Building the buffer by
  // hand and feeding it straight to audioBufferToWavBlob (duck-typed) avoids
  // that pitfall entirely and needs no AudioContext.
  const channelData = Array.from({ length: numberOfChannels }, () => new Float32Array(totalLength));

  let offset = 0;
  for (const buffer of normalizedBuffers) {
    for (let channel = 0; channel < numberOfChannels; channel += 1) {
      const sourceData = channel < buffer.numberOfChannels ? buffer.getChannelData(channel) : buffer.getChannelData(0);
      channelData[channel].set(sourceData, offset);
    }
    offset += buffer.length;
  }

  const mergedBuffer = {
    numberOfChannels,
    sampleRate,
    length: totalLength,
    getChannelData: (channel) => channelData[channel],
  };

  return audioBufferToWavBlob(mergedBuffer);
};
