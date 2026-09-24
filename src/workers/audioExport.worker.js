import { audioBufferToWavBlob, mergeAudioBuffersToWav } from '../utils/wav.js';

const toAudioBuffer = ({ sampleRate, numberOfChannels, length, channels }) => ({
  sampleRate,
  numberOfChannels,
  length,
  getChannelData: (channel) => channels[channel],
});

self.onmessage = async ({ data }) => {
  const { id, operation, buffer, buffers } = data;

  try {
    const result = operation === 'encode'
      ? audioBufferToWavBlob(toAudioBuffer(buffer))
      : mergeAudioBuffersToWav((buffers || []).map(toAudioBuffer));
    const arrayBuffer = result ? await result.arrayBuffer() : null;
    self.postMessage({ id, arrayBuffer }, arrayBuffer ? [arrayBuffer] : []);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};