export const TARGET_SAMPLE_RATE = 48000;

const sinc = (value) => {
  if (value === 0) return 1;
  const angle = Math.PI * value;
  return Math.sin(angle) / angle;
};

// Windowed-sinc interpolation keeps export conversion from introducing avoidable aliasing.
export const resampleAudioBuffer = (audioBuffer, targetSampleRate = TARGET_SAMPLE_RATE) => {
  const sourceLength = audioBuffer.length;
  const sourceRate = audioBuffer.sampleRate;
  const numberOfChannels = audioBuffer.numberOfChannels;
  const alreadyNormalized = sourceRate === targetSampleRate && numberOfChannels === 1;

  if (typeof window !== 'undefined') {
    console.log('[audio] export format', {
      sourceSampleRate: sourceRate,
      sourceIs44_1kHz: sourceRate === 44100,
      sourceChannels: numberOfChannels,
      sourceIsMono: numberOfChannels === 1,
      sourceBitDepth: audioBuffer.bitDepth ?? audioBuffer.bitsPerSample ?? 'unknown (AudioBuffer)',
      targetSampleRate,
      targetChannels: 1,
      targetBitDepth: 16,
      resampled: sourceRate !== targetSampleRate,
      downmixed: numberOfChannels !== 1,
      normalized: alreadyNormalized,
    });
  }

  if (alreadyNormalized) return audioBuffer;

  const targetLength = Math.max(1, Math.round(sourceLength * targetSampleRate / sourceRate));
  const ratio = sourceRate / targetSampleRate;
  const cutoff = Math.min(1, targetSampleRate / sourceRate);
  const radius = 16;
  const sourceChannels = Array.from({ length: numberOfChannels }, (_, channel) => audioBuffer.getChannelData(channel));
  const channelData = new Float32Array(targetLength);

  for (let outputIndex = 0; outputIndex < targetLength; outputIndex += 1) {
    const sourcePosition = outputIndex * ratio;
    const center = Math.floor(sourcePosition);
    const start = Math.max(0, center - radius + 1);
    const end = Math.min(sourceLength - 1, center + radius);

    let sample = 0;
    let weightTotal = 0;

    for (let sourceIndex = start; sourceIndex <= end; sourceIndex += 1) {
      const distance = sourceIndex - sourcePosition;
      const windowPosition = (distance + radius) / (radius * 2);
      const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * windowPosition);
      const weight = cutoff * sinc(cutoff * distance) * window;
      const downmixedSample = sourceChannels.reduce((sum, channelData) => sum + channelData[sourceIndex], 0) / numberOfChannels;
      sample += downmixedSample * weight;
      weightTotal += weight;
    }

    channelData[outputIndex] = weightTotal ? sample / weightTotal : 0;
  }

  return {
    numberOfChannels: 1,
    sampleRate: targetSampleRate,
    length: targetLength,
    getChannelData: () => channelData,
  };
};