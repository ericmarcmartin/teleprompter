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

const promptEntries = [
  'Hey Celia!',
  'Hey Celia!',
  'Hey Celia!',
  'Hey Celia!',
  'Hey Celia!',
  'Hey Celia!',
  'Hey Celia!',
  'Hey Celia!',
  'Hey Celia!',
  'Hey Celia!',
  'Hey Celia!',
  'Hey Celia!',
  'Hey Celia!',
  'Hey Celia!',
  'Hey Celia!',
  'Hey Celia!',
  'Hey Celia!',
  'Hey Celia!'
];

const promptTimings = [
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2
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
    return Math.max(18, Math.min(100, normalized * 1.2 + 8));
  });

function App() {
  const [page, setPage] = useState('login');
  const [pageHistory, setPageHistory] = useState([]);
  const [canGoForward, setCanGoForward] = useState(false);
  const [forwardPage, setForwardPage] = useState(null);
  const [email, setEmail] = useState('john.michael@thot.ai');
  const [password, setPassword] = useState('••••••••');
  const [taskId, setTaskId] = useState('TASK-1001');
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [activePrompt, setActivePrompt] = useState(initialPromptSequence[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [completedPrompts, setCompletedPrompts] = useState([]);
  const [downloadPromptIndex, setDownloadPromptIndex] = useState('all');
  const [isExportMode, setIsExportMode] = useState(false);
  const [savedRecordings, setSavedRecordings] = useState([]);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [transcript, setTranscript] = useState([]);
  const [isAudioSupported, setIsAudioSupported] = useState(true);
  const [countdown, setCountdown] = useState(0);
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
  const previewAudioRef = useRef(null);
  const countdownRef = useRef(null);
  const countdownAudioRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const isPausedRef = useRef(false);
  const currentPromptIndexRef = useRef(0);
  const frozenProgressRef = useRef(0);
  const frozenTimeRef = useRef(0);
  const frozenCompletedRef = useRef([]);
  const frozenActiveIndexRef = useRef(0);
  const frozenStatusRef = useRef('');

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
    }
  }, []);

  useEffect(() => {
    savedRecordingsRef.current = savedRecordings;
  }, [savedRecordings]);

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

  const clearWaveform = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    setWaveformLevels(Array.from({ length: 8 }, () => 22));
    analyserRef.current = null;

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  };

  const setupAudioWaveform = (stream) => {
    if (!stream) return;

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

  const resetRecordingState = () => {
    setIsRecording(false);
    setIsPaused(false);
    isPausedRef.current = false;
    setRecordingTime(0);
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
    clearInterval(timerRef.current);
    clearInterval(countdownRef.current);
    setCountdown(0);
  };

  const finalizeRecordingExport = async () => {
    if (exportInProgressRef.current) {
      return;
    }
    exportInProgressRef.current = true;

    const finalChunks = [...recordedChunksRef.current];
    if (!finalChunks.length) {
      setStatus('No recording data was captured.');
      exportInProgressRef.current = false;
      return;
    }

    const recorder = mediaRecorderRef.current;
    const audioBlob = new Blob(finalChunks, {
      type: recorder?.mimeType || 'audio/webm',
    });

    const transcriptPayload = [...transcriptRef.current];
    if (transcriptPayload.length === 0) {
      transcriptRef.current.push({
        promptIndex: 1,
        text: activePrompt.text,
        start: '00:00:00.000',
        end: formatTime(recordingTime),
      });
    }

    setTranscript([...transcriptRef.current]);
    setIsRecording(false);
    setIsPaused(false);
    isPausedRef.current = false;
    stopRequestedRef.current = false;
    clearWaveform();

    const finalizedTranscript = transcriptPayload.length ? transcriptPayload : transcriptRef.current;
    const audioUrl = URL.createObjectURL(audioBlob);
    const sessionSnapshot = {
      id: `${taskId}-${Date.now()}`,
      taskId,
      transcript: finalizedTranscript,
      duration: recordingTime,
      blob: audioBlob,
      audioUrl,
      createdAt: new Date().toISOString(),
    };
    setSavedRecordings((previous) => [sessionSnapshot, ...previous].slice(0, 10));
    setStatus('Recording saved. Export when you are ready.');

    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    exportInProgressRef.current = false;
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
    navigateTo('recording');
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
    // Revoke previous preview URL and stop any active playback
    const prevUrl = savedRecordingsRef.current[0]?.audioUrl;
    if (prevUrl) URL.revokeObjectURL(prevUrl);
    if (previewAudioRef.current) previewAudioRef.current.pause();
    setIsPlayingPreview(false);

    if (!streamRef.current) {
      const granted = await requestRecordingPermission();
      if (!granted) return;
    }

    if (streamRef.current) {
      setupAudioWaveform(streamRef.current);
    }

    stopRequestedRef.current = false;
    setIsRecording(true);
    setTranscript([]);
    transcriptRef.current = [];
    setStatus('Recording in progress');

    try {
      const recorder = new MediaRecorder(streamRef.current);
      const chunks = [];
      recordedChunksRef.current = chunks;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        await finalizeRecordingExport();
      };

      recorder.start();
      startRef.current = Date.now();
      promptStartRef.current = Date.now();
      pausedMsRef.current = 0;
      pauseStartedAtRef.current = 0;
      promptElapsedMsRef.current = 0;

      const tick = () => {
        if (stopRequestedRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          return;
        }

        if (isPausedRef.current) {
          return;
        }

        const now = Date.now();
        const elapsed = now - startRef.current - pausedMsRef.current;
        setRecordingTime(elapsed);

        const currentIndex = currentPromptIndexRef.current;
        const currentItem = initialPromptSequence[currentIndex];
        if (!currentItem) {
          return;
        }

        const promptStart = promptStartRef.current;
        const elapsedInPrompt = now - promptStart;
        const durationMs = currentItem.duration * 1000;
        const newProgress = Math.min((elapsedInPrompt / durationMs) * 100, 100);
        setProgress(newProgress);

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
            setCurrentPromptIndex(nextIndex);
            currentPromptIndexRef.current = nextIndex;
            setActivePrompt(nextPrompt);
            promptStartRef.current = now;
            promptElapsedMsRef.current = 0;
            setStatus(`Task ${nextIndex + 1} of ${initialPromptSequence.length}`);
          } else {
            clearInterval(timerRef.current);
            stopRecordingAndExport();
          }
        }
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
    if (startRef.current) {
      frozenTimeRef.current = now - startRef.current - pausedMsRef.current;
    }
    const currentIndex = currentPromptIndexRef.current;
    const currentItem = initialPromptSequence[currentIndex];
    if (currentItem && promptStartRef.current) {
      const elapsedInPrompt = now - promptStartRef.current;
      const durationMs = currentItem.duration * 1000;
      frozenProgressRef.current = Math.min((elapsedInPrompt / durationMs) * 100, 100);
    }
    frozenCompletedRef.current = [...completedPrompts];
    frozenActiveIndexRef.current = currentPromptIndexRef.current;
    frozenStatusRef.current = status;

    stopRequestedRef.current = true;
    setIsRecording(false);
    setIsPaused(false);
    isPausedRef.current = false;
    setIsStopped(true);

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
      recorder.stop();
    }

    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
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
    resetRecordingState();
    setIsStopped(false);
    setSavedRecordings([]);
    setPage('login');
    setPageHistory([]);
    setCanGoForward(false);
    setForwardPage(null);
  };

  const downloadTranscript = (taskIdValue, entries) => {
    const lines = [
      '========================================',
      `TASK ID: ${taskIdValue}`,
      `USER: John Michael`,
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

  const downloadSelectedPrompt = async () => {
    const latestRecording = savedRecordings[0];

    if (latestRecording?.blob) {
      downloadBlob(latestRecording.blob, toWebmFilename(latestRecording.taskId || taskId));
    }

    const entries = latestRecording?.transcript?.length
      ? latestRecording.transcript
      : (transcriptRef.current.length ? transcriptRef.current : initialPromptSequence.map((prompt, index) => ({
          promptIndex: index + 1,
          text: prompt.text,
          start: '00:00:00.000',
          end: formatTime(prompt.duration * 1000),
        })));

    const selectedPromptValue = Number(downloadPromptIndex);
    const selectedEntries = downloadPromptIndex === 'all'
      ? entries
      : entries.filter((entry) => entry.promptIndex === selectedPromptValue + 1);

    if (!selectedEntries.length) {
      setStatus('No task text available for download.');
      return;
    }

    const promptText = selectedEntries
      .map((entry) => `${entry.text || `Task ${entry.promptIndex}`}\n${entry.start && entry.end ? `[${entry.start} -> ${entry.end}]` : ''}`)
      .join('\n\n');

    const filename = downloadPromptIndex === 'all'
      ? toTranscriptFilename(latestRecording?.taskId || taskId)
      : `task_${selectedPromptValue + 1}_${latestRecording?.taskId || taskId}.txt`;

    const blob = new Blob([
      `TASK ID: ${latestRecording?.taskId || taskId}\n`,
      `Task selection: ${downloadPromptIndex === 'all' ? 'All tasks' : `Task ${selectedPromptValue + 1}`}\n\n`,
      promptText,
    ], { type: 'text/plain;charset=utf-8' });

    downloadBlob(blob, filename);
    setStatus(downloadPromptIndex === 'all' ? 'Recording and transcript exported' : `Task ${selectedPromptValue + 1} exported`);
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

  const navigateTo = (nextPage) => {
    setPageHistory((prev) => [...prev, page]);
    setPage(nextPage);
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
          <div className="auth-brand">THOT AI</div>
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
              <div className="user-name">John Michael</div>
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
        <div className="recording-page panel glass">
          <div className="recording-header">
            <div>
              <div className="recording-tag">Recording Collection Software</div>
              <h2>Hey Celia</h2>
            </div>
            <div className="status-pill">{isStopped ? frozenStatusRef.current : status}</div>
          </div>

          <div className="teleprompter-display">
            <div className="prompt-index">Task {currentPromptIndex + 1}</div>
            {(isRecording || isStopped || countdown > 0) ? (
              <>
                <div className="prompt-text">{activePrompt.text}</div>
                <div className="prompt-timer">
                  {countdown > 0
                    ? `Starts in ${countdown}`
                    : formatTime(isStopped ? frozenTimeRef.current : recordingTime)}
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
              {!isRecording && !countdown && savedRecordings.length > 0 && (
                <button
                  className={`preview-play-btn${isPlayingPreview ? ' playing' : ''}`}
                  onClick={handleTogglePreview}
                  aria-label={isPlayingPreview ? 'Pause preview' : 'Play preview'}
                  title={isPlayingPreview ? 'Pause preview' : 'Play recording'}
                >
                  {isPlayingPreview ? '⏸' : '▶'}
                </button>
              )}
              {isRecording && (
                <>
                  <button className="secondary" onClick={handlePauseResume}>
                    {isPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button className="danger" onClick={handleStop}>Stop</button>
                </>
              )}
              <button className="ghost compact export-toggle" onClick={() => setIsExportMode((previous) => !previous)}>
                {isExportMode ? 'Close export' : 'Export'}
              </button>
            </div>

            {isExportMode && (
              <div className="download-actions">
                <button className="primary compact" onClick={downloadSelectedPrompt}>Export</button>
              </div>
            )}
          </div>

          {savedRecordings.length > 0 && (
            <div className="saved-recordings">
              <div className="saved-recordings-header">Saved recordings</div>
              {savedRecordings.map((recording) => (
                <div key={recording.id} className="saved-recording-item">
                  <span>{recording.taskId}</span>
                  <small>{recording.transcript.length} tasks • {formatTime(recording.duration)}</small>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
