// Silence trimming — pure sample-level logic, duck-typed on the AudioBuffer
// interface (numberOfChannels/sampleRate/length/getChannelData) so it works
// with real AudioBuffers in the browser and plain fakes in tests.

export const TRIM_ALLOWANCE_MS = 100;

// Scans fixed-size frames across all channels (RMS amplitude) and returns the
// [onsetMs, offsetMs) window covering everything at/above thresholdDb, or
// null if no frame ever crosses the threshold (silent clip).
export const detectSpeechRegion = (audioBuffer, { thresholdDb = -40, frameMs = 20 } = {}) => {
  const { sampleRate, length, numberOfChannels } = audioBuffer;
  const frameSize = Math.max(1, Math.round((frameMs / 1000) * sampleRate));
  const thresholdAmplitude = 10 ** (thresholdDb / 20);
  const channels = [];
  for (let c = 0; c < numberOfChannels; c += 1) {
    channels.push(audioBuffer.getChannelData(c));
  }

  let onsetFrame = -1;
  let offsetFrame = -1;

  for (let start = 0; start < length; start += frameSize) {
    const end = Math.min(length, start + frameSize);
    let sumSquares = 0;
    let sampleCount = 0;

    for (const data of channels) {
      for (let i = start; i < end; i += 1) {
        sumSquares += data[i] * data[i];
        sampleCount += 1;
      }
    }

    const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
    if (rms >= thresholdAmplitude) {
      const frameIndex = start / frameSize;
      if (onsetFrame === -1) onsetFrame = frameIndex;
      offsetFrame = frameIndex;
    }
  }

  if (onsetFrame === -1) return null;

  const durationMs = (length / sampleRate) * 1000;
  const onsetMs = (onsetFrame * frameSize / sampleRate) * 1000;
  const offsetMs = Math.min(durationMs, ((offsetFrame + 1) * frameSize / sampleRate) * 1000);
  return { onsetMs, offsetMs };
};

// Returns a new duck-typed "AudioBuffer" containing only samples in [onsetMs, offsetMs).
export const trimAudioBuffer = (audioBuffer, onsetMs, offsetMs) => {
  const { sampleRate, numberOfChannels, length } = audioBuffer;
  const onsetSample = Math.max(0, Math.min(length, Math.round((onsetMs / 1000) * sampleRate)));
  const offsetSample = Math.max(onsetSample, Math.min(length, Math.round((offsetMs / 1000) * sampleRate)));
  const trimmedLength = Math.max(1, offsetSample - onsetSample);

  const channelData = [];
  for (let c = 0; c < numberOfChannels; c += 1) {
    channelData.push(audioBuffer.getChannelData(c).slice(onsetSample, onsetSample + trimmedLength));
  }

  return {
    numberOfChannels,
    sampleRate,
    length: trimmedLength,
    getChannelData: (channel) => channelData[channel],
  };
};

// Trims leading+trailing silence from a recorded clip. Falls back to a
// minimal near-zero-length clip when no speech is detected at all.
export const trimSilenceFromAudioBuffer = (audioBuffer, options = {}) => {
  const region = detectSpeechRegion(audioBuffer, options);
  const frameMs = options.frameMs ?? 20;

  if (!region) {
    const durationMs = (audioBuffer.length / audioBuffer.sampleRate) * 1000;
    const minimalMs = Math.min(frameMs, durationMs);
    const trimmedBuffer = trimAudioBuffer(audioBuffer, 0, minimalMs);
    return { trimmedBuffer, onsetMs: 0, durationMs: (trimmedBuffer.length / audioBuffer.sampleRate) * 1000 };
  }

  const durationMs = (audioBuffer.length / audioBuffer.sampleRate) * 1000;
  const onsetMs = Math.max(0, region.onsetMs - TRIM_ALLOWANCE_MS);
  const offsetMs = Math.min(durationMs, region.offsetMs + TRIM_ALLOWANCE_MS);
  const trimmedBuffer = trimAudioBuffer(audioBuffer, onsetMs, offsetMs);
  return {
    trimmedBuffer,
    onsetMs,
    durationMs: (trimmedBuffer.length / audioBuffer.sampleRate) * 1000,
  };
};
