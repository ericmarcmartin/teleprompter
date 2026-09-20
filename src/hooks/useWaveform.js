import { useEffect, useRef, useState } from 'react';

import { buildWaveformLevels } from '../utils/waveform.js';

// Owns the waveform visualization: bar levels state, the Web Audio analyser,
// and the two requestAnimationFrame loops (live mic levels + idle animation).
// NOTE: these rAF loops are visualization, not timers — all recording timers
// live in useTimers.js.
export const useWaveform = () => {
  const [waveformLevels, setWaveformLevels] = useState(Array.from({ length: 8 }, () => 28));

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const idleWaveformRef = useRef(null);

  const startIdleWaveform = () => {
    if (idleWaveformRef.current || analyserRef.current) return;

    const tick = () => {
      if (analyserRef.current) {
        idleWaveformRef.current = null;
        return;
      }

      const now = Date.now() / 1000;
      setWaveformLevels(
        Array.from({ length: 8 }, (_, index) => {
          const value = 24 + Math.sin(now * 3 + index * 0.8) * 18 + Math.sin(now * 6 + index) * 8;
          return Math.max(18, Math.min(100, value));
        })
      );

      idleWaveformRef.current = requestAnimationFrame(tick);
    };

    idleWaveformRef.current = requestAnimationFrame(tick);
  };

  const stopLiveWaveform = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  const clearWaveform = () => {
    stopLiveWaveform();

    if (idleWaveformRef.current) {
      cancelAnimationFrame(idleWaveformRef.current);
      idleWaveformRef.current = null;
    }

    setWaveformLevels(Array.from({ length: 8 }, () => 22));
    analyserRef.current = null;
    startIdleWaveform();

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  };

  const setupAudioWaveform = (stream) => {
    if (!stream) return;

    if (idleWaveformRef.current) {
      cancelAnimationFrame(idleWaveformRef.current);
      idleWaveformRef.current = null;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const context = audioContextRef.current || new AudioContextClass();
    audioContextRef.current = context;

    if (context.state === 'suspended') {
      context.resume().catch(() => undefined);
    }

    if (!analyserRef.current) {
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      analyserRef.current = analyser;
    }

    const analyser = analyserRef.current;
    const waveformData = new Uint8Array(analyser.fftSize);

    const updateWaveform = () => {
      if (!analyserRef.current || !audioContextRef.current) return;

      analyser.getByteTimeDomainData(waveformData);
      setWaveformLevels(buildWaveformLevels(waveformData));
      animationFrameRef.current = requestAnimationFrame(updateWaveform);
    };

    stopLiveWaveform();
    animationFrameRef.current = requestAnimationFrame(updateWaveform);
  };

  const restartLiveWaveform = (stream) => {
    if (!stream) return;
    setupAudioWaveform(stream);
  };

  useEffect(() => {
    startIdleWaveform();
    return () => {
      if (idleWaveformRef.current) {
        cancelAnimationFrame(idleWaveformRef.current);
        idleWaveformRef.current = null;
      }
    };
  }, []);

  return {
    waveformLevels,
    startIdleWaveform,
    stopLiveWaveform,
    clearWaveform,
    setupAudioWaveform,
    restartLiveWaveform,
  };
};
