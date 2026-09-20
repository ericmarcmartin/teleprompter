// =============================================================================
// FREEZE-ON-STOP INVARIANT — do not remove or work around this pattern
//
// When the Stop button is clicked, the UI must freeze exactly at the values
// that existed at that instant: active task box, completed task boxes,
// progress bar width, and prompt timer.
//
// How it works:
//   1. stopRecordingAndExport() synchronously snapshots five refs:
//        frozenActiveIndexRef  — which task box is highlighted
//        frozenCompletedRef    — which task boxes are marked completed
//        frozenProgressRef     — progress-bar width %
//        frozenTimeRef         — prompt-timer elapsed ms
//        frozenStatusRef       — status-pill text
//      These refs are written BEFORE stopRequestedRef is set and BEFORE any
//      React state setters are called, so they capture the true stop-moment
//      values with no batching delay.
//
//   2. While isStopped === true, the JSX reads exclusively from these frozen
//      refs instead of the live state values (currentPromptIndex,
//      completedPrompts, progress, recordingTime, status).
//
//   3. resetRecordingState() clears all five frozen refs back to their zero
//      values so a Re-record or Start Over starts clean.
//
// Why refs instead of state:
//   React state setters are asynchronous — a setInterval tick that fires in
//   the same JS event-loop turn as the stop call can overwrite state with a
//   later timestamp before the frozen values are committed. Refs update
//   synchronously and are never subject to batching.
//
// Rules:
//   - Never read live state for these four values while isStopped === true.
//   - Never skip writing a frozen ref in stopRecordingAndExport().
//   - Never skip clearing a frozen ref in resetRecordingState().
//   - Do not add new display values that animate/update after stop without
//     adding a corresponding frozen ref for them.
// =============================================================================


import { useEffect, useMemo, useRef, useState } from 'react';

import { mergeSavedRecordings, shouldKeepRecordingChunk } from './recordings';
import { getRemainingTransitionMs } from './timing';

const promptEntries = [
  'Hi Celia!',
  'Hey Celia!',
  'Hi Celia!',
  'Hey Celia!',
  'Hi Celia!'
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!'
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!',
  // 'Hi Celia!',
  // 'Hey Celia!'
];

const promptTimings = [
  2, 2, 2, 2, 2
  // 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  // 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  // 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  // 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  // 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  // 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  // 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  // 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  // 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  // 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2
];

const taskOptions = [
  'TASK-0001',
  'TASK-0002',
  'TASK-0003',
  'TASK-0004',
  'TASK-0005',
  'TASK-0006',
  'TASK-0010',
  'TASK-0015',
  'TASK-0020',
  'TASK-0030',
  'TASK-0050',
  'TASK-0401',
  'TASK-0502',
];

const initialPromptSequence = promptEntries.map((line, index) => ({
  text: line,
  duration: promptTimings[index] ?? 5,
}));

const formatTime = (ms) => {
  const hours = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const minutes = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const seconds = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  const milliseconds = String(ms % 1000).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
};

const formatDateTime = (date = new Date()) =>
  `${date.toISOString().slice(0, 10)} ${date.toLocaleTimeString('en-GB', {
    hour12: false,
  })}`;

const toWebmFilename = (taskId) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${taskId || 'task'}_${timestamp}.webm`;
};

const toTranscriptFilename = (taskId) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${taskId || 'task'}_${timestamp}_transcript.txt`;
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

const getAudioContext = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  return new AudioContextClass();
};

const buildWaveformLevels = (data) =>
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

const getPageFromLocation = () => {
  const pathname = window.location.pathname.replace(/\/+$/, '');
  return pathname === '/recording-collection-software' ? 'recording' : 'login';
};

function App() {
  const [page, setPage] = useState(() => getPageFromLocation());
  const [pageHistory, setPageHistory] = useState([]);
  const [canGoForward, setCanGoForward] = useState(false);
  const [forwardPage, setForwardPage] = useState(null);
  const [email, setEmail] = useState('jarren.dave');
  const [password, setPassword] = useState('••••••••');
  const [taskId, setTaskId] = useState('TASK-1001');
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [activePrompt, setActivePrompt] = useState(initialPromptSequence[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  // IMPORTANT: freeze the final timer value once recording stops. Do not replace
  // this with a live timer render unless the user explicitly requests a change.
  const [recordingTime, setRecordingTime] = useState(0);
  const [frozenTimerMs, setFrozenTimerMs] = useState(0);
  const [completedPrompts, setCompletedPrompts] = useState([]);
  const [downloadPromptIndex, setDownloadPromptIndex] = useState('all');
  const [isExportMode, setIsExportMode] = useState(false);
  const [savedRecordings, setSavedRecordings] = useState([]);
  const [playingRecordingId, setPlayingRecordingId] = useState(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [transcript, setTranscript] = useState([]);
  const [isAudioSupported, setIsAudioSupported] = useState(true);
  const [countdown, setCountdown] = useState(0);
  const [transitionCountdownMs, setTransitionCountdownMs] = useState(0);
  const [waveformLevels, setWaveformLevels] = useState(Array.from({ length: 8 }, () => 28));
  const [isStopped, setIsStopped] = useState(false);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const stopRequestedRef = useRef(false);
  const tickRef = useRef(null);
  const startRef = useRef(0);
  const recordedChunksRef = useRef([]);
  const promptStartRef = useRef(0);
  const promptElapsedMsRef = useRef(0);
  const pausedMsRef = useRef(0);
  const pauseStartedAtRef = useRef(0);
  const transcriptRef = useRef([]);
  const exportInProgressRef = useRef(false);
  const savedRecordingsRef = useRef([]);
  const playbackAudioRef = useRef(null);
  const playingIdRef = useRef(null);
  const previewAudioRef = useRef(null);
  const countdownRef = useRef(null);
  const countdownAudioRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const idleWaveformRef = useRef(null);
  const isPausedRef = useRef(false);
  const currentPromptIndexRef = useRef(0);
  const transitionGapTimerRef = useRef(null);
  const transitionCountdownRef = useRef(null);
  const transitionStartedAtRef = useRef(0);
  const transitionPauseStartedAtRef = useRef(0);
  const transitionPausedAtRef = useRef(0);
  const frozenProgressRef = useRef(0);
  const frozenTimeRef = useRef(0);
  const frozenCompletedRef = useRef([]);
  const frozenActiveIndexRef = useRef(0);
  const frozenStatusRef = useRef('');
  const timerFrozenRef = useRef(false);
  // Per-prompt recording storage: array of { promptIndex, blob, mimeType, entry }
  const perPromptRecordingsRef = useRef([]);
  // Blocks the tick from triggering another boundary crossing while a recorder
  // hand-off (stop old → start new) is in flight.
  const recorderReadyRef = useRef(true);

  const localDateLabel = useMemo(() => new Date().toLocaleString(), []);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    currentPromptIndexRef.current = currentPromptIndex;
  }, [currentPromptIndex]);

  useEffect(() => {
    if (!('MediaRecorder' in window)) {
      setIsAudioSupported(false);
      setStatus('Microphone recording is not supported by this browser.');
      return undefined;
    }

    startIdleWaveform();
    return () => {
      if (idleWaveformRef.current) {
        cancelAnimationFrame(idleWaveformRef.current);
        idleWaveformRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    savedRecordingsRef.current = savedRecordings;
  }, [savedRecordings]);

  useEffect(() => {
    const handleLocationChange = () => {
      const nextPage = getPageFromLocation();
      if (nextPage === 'recording') {
        setPage('recording');
      }
    };

    window.addEventListener('popstate', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const rec of savedRecordingsRef.current) {
        if (rec.audioUrl) URL.revokeObjectURL(rec.audioUrl);
      }
    };
  }, []);

  useEffect(() => {
    const finishTranscriptEntry = () => {
      if (transcriptRef.current.length === 0) return;
      const last = transcriptRef.current[transcriptRef.current.length - 1];
      if (last && last.end === null) {
        last.end = formatTime(Date.now() - last.startTs);
      }
    };

    return () => finishTranscriptEntry();
  }, []);

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

  const clearWaveform = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

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

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(updateWaveform);
  };

  const restartLiveWaveform = () => {
    if (!streamRef.current) return;
    setupAudioWaveform(streamRef.current);
  };

  const resetRecordingState = ({ clearSavedRecordings = false } = {}) => {
    if (clearSavedRecordings) {
      for (const rec of savedRecordingsRef.current) {
        if (rec.audioUrl) URL.revokeObjectURL(rec.audioUrl);
      }
      savedRecordingsRef.current = [];
      setSavedRecordings([]);
    }

    setIsRecording(false);
    setIsPaused(false);
    isPausedRef.current = false;
    setRecordingTime(0);
    setFrozenTimerMs(0);
    setProgress(0);
    setCurrentPromptIndex(0);
    currentPromptIndexRef.current = 0;
    setActivePrompt(initialPromptSequence[0]);
    setCompletedPrompts([]);
    transcriptRef.current = [];
    setTranscript([]);
    promptStartRef.current = 0;
    promptElapsedMsRef.current = 0;
    pausedMsRef.current = 0;
    pauseStartedAtRef.current = 0;
    startRef.current = 0;
    frozenProgressRef.current = 0;
    frozenTimeRef.current = 0;
    frozenCompletedRef.current = [];
    frozenActiveIndexRef.current = 0;
    frozenStatusRef.current = '';
    timerFrozenRef.current = false;
    perPromptRecordingsRef.current = [];
    recorderReadyRef.current = true;
    clearInterval(timerRef.current);
    clearInterval(countdownRef.current);
    if (transitionGapTimerRef.current) {
      clearTimeout(transitionGapTimerRef.current);
      transitionGapTimerRef.current = null;
    }
    if (transitionCountdownRef.current) {
      clearInterval(transitionCountdownRef.current);
      transitionCountdownRef.current = null;
    }
    transitionStartedAtRef.current = 0;
    transitionPauseStartedAtRef.current = 0;
    transitionPausedAtRef.current = 0;
    setCountdown(0);
    setTransitionCountdownMs(0);
  };

  // Called when the final recorder stops (after Stop button or last prompt).
  // Only finalized prompt recordings are saved. If Stop is pressed mid-task,
  // we keep the recorded prompts already completed and discard the current partial.
  const finalizeRecordingExport = async () => {
    if (exportInProgressRef.current) {
      return;
    }
    exportInProgressRef.current = true;

    setTranscript([...transcriptRef.current]);
    setIsRecording(false);
    setIsPaused(false);
    isPausedRef.current = false;
    stopRequestedRef.current = false;
    clearWaveform();

    const newRecordings = perPromptRecordingsRef.current
      .filter((rec) => rec && rec.blob)
      .map((rec) => {
        const audioUrl = URL.createObjectURL(rec.blob);
        return {
          id: `${taskId}-p${rec.promptIndex}-${Date.now()}`,
          taskId,
          promptIndex: rec.promptIndex,
          transcript: rec.entry ? [rec.entry] : [],
          blob: rec.blob,
          audioUrl,
          createdAt: new Date().toISOString(),
        };
      });

    setSavedRecordings((previous) => mergeSavedRecordings(previous, newRecordings).slice(0, 100));
    setStatus(`${newRecordings.length} task recording${newRecordings.length !== 1 ? 's' : ''} saved. Export when you are ready.`);

    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    exportInProgressRef.current = false;
  };

  // Starts a fresh MediaRecorder on the existing stream for the given prompt index.
  const startRecorderForPrompt = (promptIndex) => {
    if (!streamRef.current) return;

    const chunks = [];
    recordedChunksRef.current = chunks;

    const recorder = new MediaRecorder(streamRef.current);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onstop = () => {
      const finishedChunks = [...chunks];
      const isFinalPrompt = promptIndex >= initialPromptSequence.length;
      const shouldSaveChunk = shouldKeepRecordingChunk({
        stopRequested: stopRequestedRef.current,
        promptIndex,
        totalPrompts: initialPromptSequence.length,
      });

      if (!shouldSaveChunk || finishedChunks.length === 0) {
        return;
      }

      const mimeType = recorder.mimeType || 'audio/webm';
      const entry = transcriptRef.current.find((e) => e.promptIndex === promptIndex) || null;
      perPromptRecordingsRef.current.push({
        promptIndex,
        blob: new Blob(finishedChunks, { type: mimeType }),
        mimeType,
        entry,
      });

      if (isFinalPrompt) {
        setStatus('Recording finished.');
        setIsStopped(true);
        frozenStatusRef.current = 'Recording finished.';
      }
    };

    recorder.start();
    recorderReadyRef.current = true;
  };

  const requestRecordingPermission = async () => {
    if (!isAudioSupported) return false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setupAudioWaveform(stream);
      setStatus('Microphone permission granted. Press Record to begin.');
      return true;
    } catch (error) {
      console.error('Unable to access microphone', error);
      setStatus('Microphone permission denied.');
      return false;
    }
  };

  const startPromptSequence = async () => {
    const permissionGranted = await requestRecordingPermission();
    if (!permissionGranted) {
      return;
    }

    resetRecordingState();
    setIsStopped(false);
    setPage('recording');
    window.history.pushState({}, '', '/recording-collection-software');
    setCurrentPromptIndex(0);
    setActivePrompt(initialPromptSequence[0]);
    setStatus('Microphone ready. Press Record to begin.');
  };

  const startCountdownAndRecording = () => {
    if (isRecording || countdownRef.current) return;

    setIsStopped(false);
    setStatus('Recording starts in 3...');
    setCountdown(3);

    // Play countdown audio — the file is 3 s (3-2-1-go), starts immediately
    if (countdownAudioRef.current) {
      countdownAudioRef.current.currentTime = 0;
      countdownAudioRef.current.play().catch(() => undefined);
    }

    countdownRef.current = setInterval(() => {
      setCountdown((previous) => {
        if (previous <= 1) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
          startActualRecording();
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
  };

  const startActualRecording = async () => {
    // Revoke previous preview URLs and stop any active playback
    for (const rec of savedRecordingsRef.current) {
      if (rec.audioUrl) URL.revokeObjectURL(rec.audioUrl);
    }
    if (previewAudioRef.current) previewAudioRef.current.pause();
    setIsPlayingPreview(false);

    if (!streamRef.current) {
      const granted = await requestRecordingPermission();
      if (!granted) return;
    }

    if (streamRef.current) {
      restartLiveWaveform();
    }

    stopRequestedRef.current = false;
    perPromptRecordingsRef.current = [];
    recorderReadyRef.current = true;
    setIsRecording(true);
    setTranscript([]);
    transcriptRef.current = [];
    setStatus('Recording in progress');

    try {
      startRef.current = Date.now();
      promptStartRef.current = Date.now();
      pausedMsRef.current = 0;
      pauseStartedAtRef.current = 0;
      promptElapsedMsRef.current = 0;

      // Start the first per-prompt recorder
      startRecorderForPrompt(1);

      const tick = () => {
        if (timerFrozenRef.current || stopRequestedRef.current || isStopped) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          return;
        }

        if (isPausedRef.current) {
          return;
        }

        // Don't process a boundary while a recorder hand-off is in progress
        if (!recorderReadyRef.current) {
          return;
        }

        const now = Date.now();
        const currentIndex = currentPromptIndexRef.current;
        const currentItem = initialPromptSequence[currentIndex];
        if (!currentItem) {
          return;
        }

        const promptStart = promptStartRef.current;
        const elapsedInPrompt = now - promptStart;
        const durationMs = currentItem.duration * 1000;
        const newProgress = Math.min((elapsedInPrompt / durationMs) * 100, 100);

        if (elapsedInPrompt >= durationMs) {
          const nextIndex = currentIndex + 1;
          const nextPrompt = initialPromptSequence[nextIndex];
          const entry = {
            promptIndex: currentIndex + 1,
            text: currentItem.text,
            start: formatTime(promptStart - startRef.current),
            end: formatTime(now - startRef.current),
            startTs: promptStart - startRef.current,
            endTs: now - startRef.current,
          };

          transcriptRef.current.push(entry);
          setTranscript([...transcriptRef.current]);
          setCompletedPrompts((previous) => (previous.includes(currentIndex) ? previous : [...previous, currentIndex]));

          if (nextPrompt) {
            const gapMs = 2000;
            setStatus(`Task ${currentIndex + 1} complete. Next task starts in ${gapMs / 1000}s...`);

            setCurrentPromptIndex(nextIndex);
            currentPromptIndexRef.current = nextIndex;
            setActivePrompt(nextPrompt);
            setTransitionCountdownMs(gapMs);
            transitionStartedAtRef.current = Date.now();
            transitionPauseStartedAtRef.current = Date.now();
            transitionPausedAtRef.current = 0;

            if (transitionCountdownRef.current) {
              clearInterval(transitionCountdownRef.current);
            }
            const resumeNextPrompt = () => {
              if (transitionPauseStartedAtRef.current > 0) {
                pausedMsRef.current += Date.now() - transitionPauseStartedAtRef.current;
                transitionPauseStartedAtRef.current = 0;
              }

              setCurrentPromptIndex(nextIndex);
              currentPromptIndexRef.current = nextIndex;
              setActivePrompt(nextPrompt);
              setTransitionCountdownMs(0);
              transitionStartedAtRef.current = 0;
              transitionPausedAtRef.current = 0;
              promptStartRef.current = Date.now();
              promptElapsedMsRef.current = 0;
              setStatus(`Task ${nextIndex + 1} of ${initialPromptSequence.length}`);

              startRecorderForPrompt(nextIndex + 1);
              recorderReadyRef.current = true;
            };

            transitionCountdownRef.current = setInterval(() => {
              if (isPausedRef.current) {
                if (transitionPausedAtRef.current === 0) {
                  transitionPausedAtRef.current = Date.now();
                }
                return;
              }

              if (transitionPausedAtRef.current > 0) {
                const pausedForMs = Date.now() - transitionPausedAtRef.current;
                transitionStartedAtRef.current += pausedForMs;
                transitionPausedAtRef.current = 0;
              }

              const elapsedTransitionMs = Date.now() - transitionStartedAtRef.current;
              const remainingMs = getRemainingTransitionMs(elapsedTransitionMs, gapMs);
              setTransitionCountdownMs(remainingMs);

              if (remainingMs <= 0) {
                clearInterval(transitionCountdownRef.current);
                transitionCountdownRef.current = null;
                resumeNextPrompt();
              }
            }, 100);

            recorderReadyRef.current = false;
            const currentRecorder = mediaRecorderRef.current;

            if (currentRecorder && currentRecorder.state !== 'inactive') {
              const originalOnStop = currentRecorder.onstop;
              currentRecorder.onstop = (e) => {
                if (originalOnStop) originalOnStop(e);
              };
              currentRecorder.stop();
            }
          } else {
            const finishedElapsed = Date.now() - startRef.current - pausedMsRef.current;
            timerFrozenRef.current = true;
            stopRequestedRef.current = true;
            frozenTimeRef.current = finishedElapsed;
            setFrozenTimerMs(finishedElapsed);
            clearInterval(timerRef.current);
            timerRef.current = null;
            setIsStopped(true);
            setRecordingTime(finishedElapsed);
            setStatus('Recording finished.');
            frozenStatusRef.current = 'Recording finished.';
            setProgress(100);
            stopRecordingAndExport();
            return;
          }
        }

        const elapsed = now - startRef.current - pausedMsRef.current;
        setRecordingTime(elapsed);
        setProgress(newProgress);
      };

      tickRef.current = tick;
      timerRef.current = setInterval(tick, 100);
      setStatus(`Task 1 of ${initialPromptSequence.length}`);
    } catch (error) {
      console.error('Unable to start recording', error);
      setStatus('Recording could not start.');
      setIsRecording(false);
    }
  };

  const stopRecordingAndExport = () => {
    // Snapshot exact values into refs BEFORE any async work or state batching
    const now = Date.now();
    const finalElapsed = startRef.current ? now - startRef.current - pausedMsRef.current : 0;
    frozenTimeRef.current = finalElapsed;

    const currentIndex = currentPromptIndexRef.current;
    const currentItem = initialPromptSequence[currentIndex];
    if (currentItem && promptStartRef.current) {
      const elapsedInPrompt = now - promptStartRef.current;
      const durationMs = currentItem.duration * 1000;
      frozenProgressRef.current = Math.min((elapsedInPrompt / durationMs) * 100, 100);
    }
    frozenCompletedRef.current = [...completedPrompts];
    frozenActiveIndexRef.current = currentPromptIndexRef.current;
    frozenStatusRef.current = currentIndex >= initialPromptSequence.length - 1 ? 'Recording finished.' : status;

    timerFrozenRef.current = true;
    stopRequestedRef.current = true;
    frozenTimeRef.current = finalElapsed;
    setFrozenTimerMs(finalElapsed);
    setIsRecording(false);
    setIsPaused(false);
    isPausedRef.current = false;
    setIsStopped(true);
    setRecordingTime(finalElapsed);

    const recorder = mediaRecorderRef.current;

    clearInterval(timerRef.current);
    timerRef.current = null;
    tickRef.current = null;

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(0);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (recorder && recorder.state !== 'inactive') {
      // Wire finalizeRecordingExport to fire after the last recorder seals its blob
      const originalOnStop = recorder.onstop;
      recorder.onstop = (e) => {
        if (originalOnStop) originalOnStop(e);
        finalizeRecordingExport();
      };
      recorder.stop();
    } else {
      finalizeRecordingExport();
    }
  };

  const stopPlaybackAudio = () => {
    if (playbackAudioRef.current) {
      playbackAudioRef.current.onended = null;
      playbackAudioRef.current.pause();
      playbackAudioRef.current.src = '';
      playbackAudioRef.current = null;
    }

    if (playingIdRef.current) {
      playingIdRef.current = null;
      setPlayingRecordingId(null);
    }
  };

  const handlePauseResume = () => {
    if (!isRecording) return;

    const recorder = mediaRecorderRef.current;

    if (isPausedRef.current) {
      if (recorder && recorder.state === 'paused') {
        recorder.resume();
      }

      if (tickRef.current && !timerRef.current) {
        timerRef.current = setInterval(tickRef.current, 100);
      }

      if (transitionStartedAtRef.current > 0 && transitionPausedAtRef.current > 0) {
        const transitionPauseDuration = Date.now() - transitionPausedAtRef.current;
        transitionStartedAtRef.current += transitionPauseDuration;
        transitionPausedAtRef.current = 0;
      }
      if (transitionPauseStartedAtRef.current > 0) {
        pausedMsRef.current += Date.now() - transitionPauseStartedAtRef.current;
        transitionPauseStartedAtRef.current = 0;
      }

      restartLiveWaveform();

      const pauseDuration = Date.now() - pauseStartedAtRef.current;
      pausedMsRef.current += pauseDuration;
      pauseStartedAtRef.current = 0;
      promptStartRef.current = Date.now() - promptElapsedMsRef.current;
      setIsPaused(false);
      isPausedRef.current = false;
      setStatus('Recording resumed');
      return;
    }

    if (recorder && recorder.state === 'recording') {
      recorder.pause();
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (transitionStartedAtRef.current > 0 && transitionPausedAtRef.current === 0) {
      transitionPausedAtRef.current = Date.now();
    }
    if (transitionPauseStartedAtRef.current > 0) {
      pausedMsRef.current += Date.now() - transitionPauseStartedAtRef.current;
      transitionPauseStartedAtRef.current = 0;
    }

    promptElapsedMsRef.current = Date.now() - promptStartRef.current;
    pauseStartedAtRef.current = Date.now();
    setIsPaused(true);
    isPausedRef.current = true;
    setStatus('Recording paused');
  };

  const handleStop = () => {
    stopRecordingAndExport();
  };

  const handleReRecord = () => {
    resetRecordingState();
    setIsStopped(false);
    setStatus('Microphone ready. Press Record to begin.');
  };

  const handleStartOver = () => {
    stopPlaybackAudio();
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.src = '';
    }

    setIsPlayingPreview(false);
    setIsStopped(false);
    setPageHistory([]);
    setCanGoForward(false);
    setForwardPage(null);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    clearWaveform();
    resetRecordingState({ clearSavedRecordings: true });
    sessionStorage.clear();
    localStorage.clear();
    window.location.replace('/recording-collection-software');
  };

  const downloadTranscript = (taskIdValue, entries) => {
    const lines = [
      '========================================',
      `TASK ID: ${taskIdValue}`,
      `USER: Jarren Dave`,
      `DATE: ${formatDateTime()}`,
      '========================================',
      '',
    ];

    const contentEntries = entries.map((item, index) => {
      const promptText = item.text || `Task ${index + 1}`;
      const range = item.start && item.end ? `[${item.start} -> ${item.end}]` : '';
      return `${range} Task ${index + 1}: ${promptText}`;
    });

    const text = [...lines, ...contentEntries, '', '------------'].join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, toTranscriptFilename(taskIdValue));
  };

  const buildTimestampTranscript = (recordings) => {
    const sessionEntries = recordings.map((recording) => {
      const entry = recording.transcript?.[0];
      const range = entry?.start && entry?.end ? `[${entry.start} -> ${entry.end}]` : '';
      const promptText = entry?.text || `Task ${recording.promptIndex}`;
      return `${range} Task ${recording.promptIndex}: ${promptText}`;
    });

    return [
      '========================================',
      `TASK ID: ${taskId}`,
      `USER: Jarren Dave`,
      `DATE: ${formatDateTime()}`,
      '========================================',
      '',
      ...sessionEntries,
      '',
      '------------',
    ].join('\n');
  };

  const exportTimestampFile = () => {
    if (savedRecordings.length === 0) {
      setStatus('No recordings available for timestamp export.');
      return;
    }

    const text = buildTimestampTranscript(savedRecordings);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob(blob, `${taskId || 'task'}_${timestamp}_timestamps.txt`);
    setStatus('Timestamp transcript exported.');
  };

  const exportIndividualRecordingFiles = async () => {
    if (savedRecordings.length === 0) {
      setStatus('No recordings available for individual export.');
      return;
    }

    const validRecordings = savedRecordings.filter((rec) => rec.blob);
    if (validRecordings.length === 0) {
      setStatus('No valid recordings available for export.');
      return;
    }

    for (const rec of validRecordings) {
      const wavBlob = await convertBlobToWav(rec.blob);
      if (!wavBlob) continue;

      const effectiveTaskId = rec.taskId || taskId;
      const label = `task${rec.promptIndex}_${effectiveTaskId}`;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadBlob(wavBlob, `${label}_${timestamp}.wav`);
    }

    setStatus(`Exported ${validRecordings.length} individual recordings as WAV.`);
  };

  const audioBufferToWavBlob = (audioBuffer) => {
    const channels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    const wavBuffer = new ArrayBuffer(44 + length * channels * 2);
    const view = new DataView(wavBuffer);

    const writeString = (offset, text) => {
      for (let i = 0; i < text.length; i += 1) {
        view.setUint8(offset + i, text.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * channels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * channels * 2, true);

    let offset = 44;
    for (let i = 0; i < length; i += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i] || 0));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([wavBuffer], { type: 'audio/wav' });
  };

  const convertBlobToWav = async (blob) => {
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

  const mergeAudioBuffersToWav = (audioBuffers) => {
    if (!audioBuffers.length) {
      return null;
    }

    const totalLength = audioBuffers.reduce((sum, buffer) => sum + buffer.length, 0);
    const channels = Math.max(...audioBuffers.map((buffer) => buffer.numberOfChannels));
    const sampleRate = audioBuffers[0].sampleRate;
    const mergedBuffer = new AudioContext().createBuffer(channels, totalLength, sampleRate);

    for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
      const mergedChannel = mergedBuffer.getChannelData(channelIndex);
      let offset = 0;

      for (const sourceBuffer of audioBuffers) {
        const sourceChannelCount = sourceBuffer.numberOfChannels;
        const sourceData = sourceBuffer.numberOfChannels > channelIndex
          ? sourceBuffer.getChannelData(channelIndex)
          : sourceBuffer.getChannelData(0);

        mergedChannel.set(sourceData, offset);
        offset += sourceData.length;

        if (sourceChannelCount < channels && channelIndex >= sourceChannelCount) {
          mergedChannel.fill(0, offset - sourceData.length, offset);
        }
      }
    }

    return audioBufferToWavBlob(mergedBuffer);
  };

  const exportSessionAudioFile = async () => {
    if (savedRecordings.length === 0) {
      setStatus('No recordings available for session export.');
      return;
    }

    const validRecordings = savedRecordings.filter((rec) => rec.blob);
    if (validRecordings.length === 0) {
      setStatus('No valid audio blobs available for session export.');
      return;
    }

    const audioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!audioContextClass) {
      setStatus('This browser cannot render session audio exports.');
      return;
    }

    const context = new audioContextClass();
    try {
      const buffers = await Promise.all(validRecordings.map(async (recording) => {
        const arrayBuffer = await recording.blob.arrayBuffer();
        return context.decodeAudioData(arrayBuffer.slice(0));
      }));

      const wavBlob = mergeAudioBuffersToWav(buffers);
      if (!wavBlob) {
        setStatus('Unable to create the session audio file.');
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadBlob(wavBlob, `${taskId || 'task'}_${timestamp}_session.wav`);
      setStatus('Session audio exported as a single file.');
    } catch (error) {
      console.error('Unable to merge session recording', error);
      setStatus('Session export failed. Try exporting individual files instead.');
    } finally {
      context.close().catch(() => undefined);
    }
  };

  const exportAllFiles = async () => {
    if (savedRecordings.length === 0) {
      setStatus('No recordings available for full export.');
      return;
    }

    exportTimestampFile();
    exportIndividualRecordingFiles();
    await exportSessionAudioFile();
    setStatus(`All exports generated for ${taskId}.`);
  };

  // Download all per-prompt audio and transcript files from the current session.
  const downloadSelectedPrompt = async () => {
    if (savedRecordings.length === 0) {
      setStatus('No recordings available for export.');
      return;
    }

    // Determine which recordings to export
    const recordingsToExport = downloadPromptIndex === 'all'
      ? savedRecordings
      : savedRecordings.filter((r) => r.promptIndex === Number(downloadPromptIndex) + 1);

    if (recordingsToExport.length === 0) {
      setStatus('No task text available for download.');
      return;
    }

    for (const rec of recordingsToExport) {
      const effectiveTaskId = rec.taskId || taskId;
      const label = `task${rec.promptIndex}_${effectiveTaskId}`;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      // Audio file
      if (rec.blob) {
        downloadBlob(rec.blob, `${label}_${timestamp}.webm`);
      }

      // Transcript file
      const entry = rec.transcript?.[0];
      const lines = [
        '========================================',
        `TASK ID: ${effectiveTaskId}`,
        `TASK: ${rec.promptIndex}`,
        `USER: Jarren Dave`,
        `DATE: ${formatDateTime()}`,
        '========================================',
        '',
        entry
          ? `${entry.start && entry.end ? `[${entry.start} -> ${entry.end}] ` : ''}${entry.text || `Task ${rec.promptIndex}`}`
          : `Task ${rec.promptIndex}`,
        '',
        '------------',
      ];
      const txtBlob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      downloadBlob(txtBlob, `${label}_${timestamp}_transcript.txt`);
    }

    setStatus(
      downloadPromptIndex === 'all'
        ? `All ${recordingsToExport.length} task files exported`
        : `Task ${Number(downloadPromptIndex) + 1} exported`
    );
    setIsExportMode(false);
  };

  const handleTogglePreview = () => {
    const url = savedRecordingsRef.current[0]?.audioUrl;
    if (!url || !previewAudioRef.current) return;

    if (isPlayingPreview) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      previewAudioRef.current.play();
      setIsPlayingPreview(true);
    }
  };

  const handlePlayRecording = (recording) => {
    if (playingIdRef.current === recording.id) {
      stopPlaybackAudio();
      return;
    }

    stopPlaybackAudio();

    const audio = new Audio(recording.audioUrl);
    playbackAudioRef.current = audio;
    playingIdRef.current = recording.id;
    setPlayingRecordingId(recording.id);

    audio.onended = () => stopPlaybackAudio();
    audio.play().catch(() => stopPlaybackAudio());
  };

  const navigateTo = (nextPage) => {
    setPageHistory((prev) => [...prev, page]);
    setPage(nextPage);
    if (nextPage === 'recording') {
      window.history.pushState({}, '', '/recording-collection-software');
    } else {
      window.history.pushState({}, '', '/');
    }
    setCanGoForward(false);
    setForwardPage(null);
  };

  const handleBack = () => {
    if (pageHistory.length === 0) return;
    const prev = pageHistory[pageHistory.length - 1];
    setForwardPage(page);
    setCanGoForward(true);
    setPage(prev);
    setPageHistory((h) => h.slice(0, -1));
  };

  const handleForward = () => {
    if (!canGoForward || !forwardPage) return;
    setPageHistory((prev) => [...prev, page]);
    setPage(forwardPage);
    setCanGoForward(false);
    setForwardPage(null);
  };

  const handleLogin = () => {
    navigateTo('home');
  };

  const handleReset = () => {
    setEmail('');
    setPassword('');
    setPage('login');
    setPageHistory([]);
    setCanGoForward(false);
    setForwardPage(null);
  };

  const handleGuestLogin = () => {
    navigateTo('home');
  };

  return (
    <div className="app-shell">
      {/* Hidden countdown audio */}
      <audio ref={countdownAudioRef} src="/countdown.wav" preload="auto" style={{ display: 'none' }} />

      {/* Global back/forward nav — visible on all pages except login */}
      {page !== 'login' && (
        <div className="nav-controls">
          <button
            className="nav-btn"
            onClick={handleBack}
            disabled={pageHistory.length === 0}
            aria-label="Go back"
            title="Back"
          >
            ← Back
          </button>
          {canGoForward && (
            <button
              className="nav-btn"
              onClick={handleForward}
              aria-label="Go forward"
              title="Forward"
            >
              Forward →
            </button>
          )}
        </div>
      )}

      {page === 'login' && (
        <div className="auth-panel panel glass">
          <div className="auth-brand">ThothAI</div>
          <h1>Welcome back</h1>
          <div className="field-group">
            <label>Email</label>
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
          </div>
          <div className="field-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
            />
          </div>
          <div className="auth-actions">
            <button className="primary" onClick={handleLogin}>Login</button>
            <button className="ghost" onClick={handleReset}>Reset</button>
          </div>
        </div>
      )}

      {page === 'home' && (
        <div className="dashboard-wrap">
          <header className="topbar panel glass">
            <div>
              <span className="meta-label">User</span>
              <div className="user-name">Jarren Dave</div>
            </div>
            <div className="access-badge">Employee</div>
            <div className="time-indicator">{localDateLabel}</div>
          </header>

          <div className="task-panel panel glass">
            <label className="field-label">Project</label>
            <div className="task-input-row">
              <select value={taskId} onChange={(event) => setTaskId(event.target.value)}>
                {taskOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <button className="primary" onClick={() => navigateTo('instructions')}>Load</button>
            </div>
          </div>
        </div>
      )}

      {page === 'instructions' && (
        <div className="instruction-wrap">
          <div className="notice-panel panel glass">
            <div className="notice-title">Recording Notice</div>
            <p>
              Once you start recording, you will need to finish the recording. Please record in a quiet
              environment. Do not use headset.
            </p>
            <button className="primary start-btn" onClick={startPromptSequence}>START</button>
          </div>
        </div>
      )}

      {page === 'recording' && (
        <div className="recording-layout">
        <div className="recording-page panel glass">
          <div className="recording-header">
            <div>
              <div className="recording-tag">Recording Collection Software</div>
              <h2>Hi Celia</h2>
            </div>
            <div className="status-pill">{isStopped ? frozenStatusRef.current : status}</div>
          </div>

          <div className="teleprompter-display">
  {transitionCountdownMs > 0 ? (
    <div className="transition-buffer" aria-live="polite">
      <div className="transition-ring">
        <svg viewBox="0 0 100 100" className="spinner-svg">
          <defs>
            <linearGradient id="spinner-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#C4B5FD" />
              <stop offset="50%" stopColor="#0EA5E9" />
              <stop offset="100%" stopColor="#14B8A6" />
            </linearGradient>
          </defs>
          
          {/* Background Track */}
          <circle cx="50" cy="50" r="42" className="spinner-track" />
          
          {/* Dynamic Progress Ring (Circumference ~ 264) */}
          <circle 
            cx="50" 
            cy="50" 
            r="42" 
            className="spinner-head"
            style={{
              strokeDashoffset: 264 * (1 - transitionCountdownMs / 2000)
            }}
          />
        </svg>

        <span>{Math.max(1, Math.ceil(transitionCountdownMs / 1000))}</span>
      </div>

      <div className="transition-copy">
        <div className="prompt-index">Next task</div>
        <div className="prompt-text prompt-text--buffer">Prepare</div>
      </div>
    </div>
  ) : isRecording || isStopped || countdown > 0 ? (
    <>
      <div className="prompt-index">Task {currentPromptIndex + 1}</div>
      <div className="prompt-text">{activePrompt.text}</div>
      <div className="prompt-timer">
        {countdown > 0 ? `Starts in ${countdown}` : formatTime(isStopped ? frozenTimerMs : recordingTime)}
      </div>
    </>
  ) : (
    <div className="prompt-text prompt-text--idle">Select a task below and press record to begin.</div>
  )}
</div>

          <div className="waveform" aria-label="Audio waveform">
            {waveformLevels.map((level, index) => (
              <span
                key={`bar-${index}`}
                className="bar"
                style={{ height: `${level}%` }}
              />
            ))}
          </div>

          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${isStopped ? frozenProgressRef.current : progress}%` }} />
          </div>

          <div className={`prompt-selector ${isExportMode ? 'export-mode' : ''}`} aria-label="Task selector">
            {initialPromptSequence.map((prompt, index) => {
              const isActive = index === (isStopped ? frozenActiveIndexRef.current : currentPromptIndex);
              const isCompleted = (isStopped ? frozenCompletedRef.current : completedPrompts).includes(index);
              const isExportSelected = isExportMode && downloadPromptIndex !== 'all' && Number(downloadPromptIndex) === index;
              const isAllSelected = isExportMode && downloadPromptIndex === 'all' && index === 0;
              return (
                <button
                  key={`prompt-box-${prompt}-${index}`}
                  type="button"
                  className={`prompt-box ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isExportSelected || isAllSelected ? 'export-selected' : ''}`}
                  onClick={() => {
                    if (isExportMode) {
                      setDownloadPromptIndex(index === 0 && downloadPromptIndex === 'all' ? 'all' : String(index));
                      setStatus(index === 0 && downloadPromptIndex === 'all' ? 'All tasks selected for export' : `Task ${index + 1} selected for export`);
                      return;
                    }

                    setCurrentPromptIndex(index);
                    currentPromptIndexRef.current = index;
                    setActivePrompt(initialPromptSequence[index]);
                    promptStartRef.current = Date.now();
                    promptElapsedMsRef.current = 0;
                    setProgress(0);
                    setStatus(`Task ${index + 1} of ${initialPromptSequence.length}`);
                  }}
                >
                  <span>Task {index + 1}</span>
                </button>
              );
            })}
          </div>

          <div className="action-panel">
            {savedRecordings.length > 0 && (
              <audio
                ref={previewAudioRef}
                src={savedRecordings[0]?.audioUrl ?? ''}
                onEnded={() => setIsPlayingPreview(false)}
                style={{ display: 'none' }}
              />
            )}
            <div className="controls">
              {!isRecording && !countdown && !isStopped ? (
                <button className="primary" onClick={startCountdownAndRecording}>Record</button>
              ) : null}
              {isStopped && (
                <>
                  <button className="secondary" onClick={handleReRecord}>Re-record Task</button>
                  <button className="danger" onClick={handleStartOver}>Start Over</button>
                </>
              )}
              {/* {!isRecording && !countdown && savedRecordings.length > 0 && (
                <button
                  className={`preview-play-btn${isPlayingPreview ? ' playing' : ''}`}
                  onClick={handleTogglePreview}
                  aria-label={isPlayingPreview ? 'Pause preview' : 'Play preview'}
                  title={isPlayingPreview ? 'Pause preview' : 'Play recording'}
                >
                  {isPlayingPreview ? '⏸' : '▶'}
                </button>
              )} */}
              {isRecording && (
                <>
                  <button className="secondary" onClick={handlePauseResume}>
                    {isPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button className="danger" onClick={handleStop}>Stop</button>
                </>
              )}
              {/* <button className="ghost compact export-toggle" onClick={() => setIsExportMode((previous) => !previous)}>
                {isExportMode ? 'Close export' : 'Export'}
              </button> */}
            </div>

            {isExportMode && (
              <div className="download-actions">
                <button className="primary compact" onClick={downloadSelectedPrompt}>Export</button>
              </div>
            )}
          </div>

          {savedRecordings.length > 0 && (
            <div className="saved-recordings">
              <div className="saved-recordings-header">Saved recordings — {savedRecordings.length} task{savedRecordings.length !== 1 ? 's' : ''}</div>
              {savedRecordings.map((recording) => {
                const entry = recording.transcript?.[0];
                const duration = entry?.start && entry?.end
                  ? `${entry.start} → ${entry.end}`
                  : null;
                const isPlaying = playingRecordingId === recording.id;

                return (
                  <div
                    key={recording.id}
                    className={`saved-recording-item${isPlaying ? ' playing' : ''}`}
                    onClick={() => handlePlayRecording(recording)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handlePlayRecording(recording);
                      }
                    }}
                    aria-label={`${isPlaying ? 'Pause' : 'Play'} Task ${recording.promptIndex}`}
                  >
                    <div className="saved-recording-main">
                      <span>{recording.taskId} — Task {recording.promptIndex}</span>
                      <small>{entry?.text ?? '—'}{duration ? ` • ${duration}` : ''}</small>
                    </div>
                    <div className="saved-recording-actions">
                      <button
                        type="button"
                        className={`saved-recording-play-btn${isPlaying ? ' playing' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          handlePlayRecording(recording);
                        }}
                        aria-label={`${isPlaying ? 'Pause' : 'Play'} Task ${recording.promptIndex}`}
                        title={`${isPlaying ? 'Pause' : 'Play'} recording`}
                      >
                        {isPlaying ? '⏸' : '▶'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="export-sidebar panel glass">
          <div className="export-sidebar-title">Export</div>
          <button className="export-sidebar-btn export-sidebar-btn--timestamp" onClick={exportTimestampFile}>Timestamp</button>
          <button className="export-sidebar-btn export-sidebar-btn--individual" onClick={exportIndividualRecordingFiles}>Individual Tasks</button>
          <button className="export-sidebar-btn export-sidebar-btn--session" onClick={exportSessionAudioFile}>Session</button>
          <button className="export-sidebar-btn export-sidebar-btn--all" onClick={exportAllFiles}>All</button>
        </div>

        </div>
      )}
    </div>
  );
}

export default App;
