export const TARGET_SAMPLE_RATE = 24000;

const sinc = (value) => {
  if (value === 0) return 1;
  const angle = Math.PI * value;
  return Math.sin(angle) / angle;
};

// Windowed-sinc interpolation keeps export conversion from introducing avoidable aliasing.
export const resampleAudioBuffer = (audioBuffer, targetSampleRate = TARGET_SAMPLE_RATE) => {
  if (audioBuffer.sampleRate === targetSampleRate) return audioBuffer;

  const sourceLength = audioBuffer.length;
  const sourceRate = audioBuffer.sampleRate;
  const targetLength = Math.max(1, Math.round(sourceLength * targetSampleRate / sourceRate));
  const numberOfChannels = audioBuffer.numberOfChannels;
  const ratio = sourceRate / targetSampleRate;
  const cutoff = Math.min(1, targetSampleRate / sourceRate);
  const radius = 16;
  const channelData = Array.from({ length: numberOfChannels }, () => new Float32Array(targetLength));

  for (let outputIndex = 0; outputIndex < targetLength; outputIndex += 1) {
    const sourcePosition = outputIndex * ratio;
    const center = Math.floor(sourcePosition);
    const start = Math.max(0, center - radius + 1);
    const end = Math.min(sourceLength - 1, center + radius);

    for (let channel = 0; channel < numberOfChannels; channel += 1) {
      const sourceData = audioBuffer.getChannelData(channel);
      let sample = 0;
      let weightTotal = 0;

      for (let sourceIndex = start; sourceIndex <= end; sourceIndex += 1) {
        const distance = sourceIndex - sourcePosition;
        const windowPosition = (distance + radius) / (radius * 2);
        const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * windowPosition);
        const weight = cutoff * sinc(cutoff * distance) * window;
        sample += sourceData[sourceIndex] * weight;
        weightTotal += weight;
      }

      channelData[channel][outputIndex] = weightTotal ? sample / weightTotal : 0;
    }
  }

  return {
    numberOfChannels,
    sampleRate: targetSampleRate,
    length: targetLength,
    getChannelData: (channel) => channelData[channel],
  };
};