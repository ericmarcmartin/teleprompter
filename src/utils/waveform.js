// Pure waveform math — converts time-domain analyser data into 8 bar levels (18–100).

export const buildWaveformLevels = (data) =>
  Array.from({ length: 8 }, (_, index) => {
    const start = Math.floor((index / 8) * data.length);
    const end = Math.floor(((index + 1) / 8) * data.length);
    let peak = 0;

    for (let i = start; i < end; i += 1) {
      const amplitude = Math.abs(data[i] - 128);
      if (amplitude > peak) {
        peak = amplitude;
      }
    }

    const normalized = (peak / 128) * 100;
    return Math.max(18, Math.min(100, normalized * 1.7 + 10));
  });
