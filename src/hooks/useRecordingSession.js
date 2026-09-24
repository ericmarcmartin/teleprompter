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
//        frozenProgressRef     — progress-bar width %   (owned by useTimers)
//        frozenTimeRef         — prompt-timer per-task elapsed ms (owned by
//                                useTimers; the prompt-timer counts per task,
//                                00:00:00.000 → task duration)
//        frozenStatusRef       — status-pill text
//      These refs are written BEFORE stopRequestedRef is set and BEFORE any
//      React state setters are called, so they capture the true stop-moment
//      values with no batching delay.
//
//   2. While isStopped === true, the recording-page JSX reads exclusively from
//      these frozen refs instead of the live state values (currentPromptIndex,
//      completedPrompts, progress, recordingTime, status).
//
//   3. resetRecordingState() clears all five frozen refs back to their zero
//      values (via timers.resetTimers() for the timer-owned two) so a
//      Re-record or Start Over starts clean.
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

import { useEffect, useRef, useState } from 'react';

import { initialPromptSequence } from '../data/prompts.js';
import { mergeSavedRecordings } from '../recordings.js';
import { getTaskWindowMs } from '../timing.js';
import { trimSilenceFromAudioBuffer } from '../utils/audioTrim.js';
import { encodeAudioBufferInWorker } from '../utils/audioExportWorker.js';
import { formatTime } from '../utils/format.js';
import { useRecorder } from './useRecorder.js';
import { useTimers } from './useTimers.js';
import { useWaveform } from './useWaveform.js';

// Decodes a raw per-prompt blob, trims leading/trailing silence, and
// re-encodes as WAV. On any decode failure, keeps the original blob so one
// bad clip doesn't fail the whole export batch.
const trimPerPromptRecording = async (rec, audioContext) => {
  if (!audioContext) {
    return {
      ...rec,
      untrimmedBlob: rec.blob,
      rawDurationMs: null,
      trimStartMs: 0,
      trimmedDurationMs: null,
    };
  }

  try {
    const arrayBuffer = await rec.blob.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const { trimmedBuffer, onsetMs, durationMs } = trimSilenceFromAudioBuffer(decoded);
    const wavBlob = await encodeAudioBufferInWorker(trimmedBuffer);
    return {
      ...rec,
      untrimmedBlob: rec.blob,
      rawDurationMs: (decoded.length / decoded.sampleRate) * 1000,
      blob: wavBlob,
      mimeType: 'audio/wav',
      trimStartMs: onsetMs,
      trimmedDurationMs: durationMs,
      // Cached so session export can reuse the exact trimmed samples instead
      // of re-decoding the WAV blob a second time.
      audioBuffer: trimmedBuffer,
    };
  } catch (error) {
    console.error('Unable to trim recording, keeping untrimmed audio', error);
    return { ...rec, untrimmedBlob: rec.blob, rawDurationMs: null, trimStartMs: 0, trimmedDurationMs: null };
  }
};

// Orchestrates one recording session: composes the timer clock (useTimers),
// the MediaRecorder lifecycle (useRecorder), and the waveform (useWaveform),
// and owns session state (current prompt, completed prompts, transcript,
// saved recordings, status) plus the freeze-on-stop refs.
export const useRecordingSession = ({ taskId, playback }) => {
  const [isAudioSupported, setIsAudioSupported] = useState(true);
  const [status, setStatus] = useState('Ready');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  // True from countdown-end until the recorder is actually running — bridges
  // the async mic-permission gap so the UI never flashes the idle message.
  const [isStarting, setIsStarting] = useState(false);
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [activePrompt, setActivePrompt] = useState(initialPromptSequence[0]);
  const [completedPrompts, setCompletedPrompts] = useState([]);
  const [transcript, setTranscript] = useState([]);
  const [savedRecordings, setSavedRecordings] = useState([]);
  const [isPreparingRecordings, setIsPreparingRecordings] = useState(false);
  // True only when the timer crossed the FINAL task boundary naturally —
  // a manual Stop (even on the last task) leaves this false so the display
  // can distinguish "session complete" from "stopped early".
  const [isSessionComplete, setIsSessionComplete] = useState(false);

  const isPausedRef = useRef(false);
  const isStoppedRef = useRef(false);
  const currentPromptIndexRef = useRef(0);
  // Mirror of completedPrompts that updates synchronously at each boundary, so
  // the freeze-on-stop snapshot is correct even when stop happens in the same
  // tick that completed the final prompt (state would still be stale there).
  const completedPromptsRef = useRef([]);
  const transcriptRef = useRef([]);
  const savedRecordingsRef = useRef([]);
  const exportInProgressRef = useRef(false);
  const countdownAudioRef = useRef(null);
  const frozenCompletedRef = useRef([]);
  const frozenActiveIndexRef = useRef(0);
  const frozenStatusRef = useRef('');

  const waveform = useWaveform();

  const recorder = useRecorder({
    setStatus,
    transcriptRef,
    isAudioSupported,
    onStreamReady: (stream) => waveform.setupAudioWaveform(stream),
    onPromptRecorded: (index) => markPromptCompleted(index),
    onFinalPromptRecorded: () => {
      setStatus('Recording finished.');
      setIsStopped(true);
      frozenStatusRef.current = 'Recording finished.';
    },
  });

  const timers = useTimers({
    stopRequestedRef: recorder.stopRequestedRef,
    recorderReadyRef: recorder.recorderReadyRef,
    isPausedRef,
    isStoppedRef,
    currentPromptIndexRef,
  });

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    isStoppedRef.current = isStopped;
  }, [isStopped]);

  useEffect(() => {
    currentPromptIndexRef.current = currentPromptIndex;
  }, [currentPromptIndex]);

  useEffect(() => {
    savedRecordingsRef.current = savedRecordings;
  }, [savedRecordings]);

  useEffect(() => {
    if (!('MediaRecorder' in window)) {
      setIsAudioSupported(false);
      setStatus('Microphone recording is not supported by this browser.');
    }
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

  const markPromptCompleted = (index) => {
    if (!completedPromptsRef.current.includes(index)) {
      completedPromptsRef.current = [...completedPromptsRef.current, index];
    }
    setCompletedPrompts((previous) => (previous.includes(index) ? previous : [...previous, index]));
  };

  // Called when the final recorder stops (after Stop button or last prompt).
  // Non-empty recordings are saved, including the active prompt on manual stop.
  const finalizeRecordingExport = async () => {
    if (exportInProgressRef.current) {
      return;
    }
    exportInProgressRef.current = true;
    setIsPreparingRecordings(true);

    try {
      setTranscript([...transcriptRef.current]);
      setIsRecording(false);
      setIsPaused(false);
      isPausedRef.current = false;
      recorder.stopRequestedRef.current = false;
      waveform.clearWaveform();

      const rawRecordings = recorder.perPromptRecordingsRef.current.filter((rec) => rec && rec.blob);

      const audioContextClass = window.AudioContext || window.webkitAudioContext;
      let trimmedRecordings = rawRecordings;
      if (audioContextClass) {
        const audioContext = new audioContextClass();
        try {
          trimmedRecordings = await Promise.all(rawRecordings.map((rec) => trimPerPromptRecording(rec, audioContext)));
        } finally {
          audioContext.close().catch(() => undefined);
        }
      }

      const newRecordings = trimmedRecordings.map((rec) => {
        const audioUrl = URL.createObjectURL(rec.blob);
        return {
          id: `${taskId}-p${rec.promptIndex}-${Date.now()}`,
          taskId,
          promptIndex: rec.promptIndex,
          transcript: rec.entry ? [rec.entry] : [],
          blob: rec.blob,
          untrimmedBlob: rec.untrimmedBlob ?? rec.blob,
          audioUrl,
          rawDurationMs: rec.rawDurationMs ?? null,
          trimStartMs: rec.trimStartMs ?? 0,
          trimmedDurationMs: rec.trimmedDurationMs ?? null,
          audioBuffer: rec.audioBuffer ?? null,
          createdAt: new Date().toISOString(),
        };
      });

      // Keep every merged take — no cap: sessions can have more than 100 tasks.
      setSavedRecordings((previous) => mergeSavedRecordings(previous, newRecordings));
      setStatus(`${newRecordings.length} task recording${newRecordings.length !== 1 ? 's' : ''} saved. Export when you are ready.`);

      recorder.stopStream();
    } finally {
      setIsPreparingRecordings(false);
      exportInProgressRef.current = false;
    }
  };

  // Runs when the inter-task transition gap ends: fold the gap into paused
  // time, reset the prompt clock, unmute the mic, and start the next recorder.
  const resumeNextPrompt = async (nextIndex, nextPrompt) => {
    setCurrentPromptIndex(nextIndex);
    currentPromptIndexRef.current = nextIndex;
    setActivePrompt(nextPrompt);
    setStatus(`Task ${nextIndex + 1} of ${initialPromptSequence.length}`);

    recorder.setMicrophoneEnabled(true);
    try {
      await recorder.waitForRecorderStopped();
      recorder.startRecorderForPrompt(nextIndex + 1);
    } catch (error) {
      console.error('Unable to continue recording', error);
      recorder.recorderReadyRef.current = true;
      recorder.stopRequestedRef.current = true;
      setIsRecording(false);
      setIsStopped(true);
      setStatus('Recording could not continue.');
      return;
    }
    timers.completeTransition();
  };

  // Prompt-boundary reaction, invoked by the timer tick. Returns { final }
  // so the tick knows whether the session just ended.
  // Transcript timestamps come from getTaskWindowMs — canonical exact-second
  // windows (Task 1: 0.000-2.000, Task 2: 2.000-4.000) with the inter-task
  // gap excluded — not from wall-clock capture times.
  const handleBoundary = ({ currentIndex, currentItem }) => {
    const nextIndex = currentIndex + 1;
    const nextPrompt = initialPromptSequence[nextIndex];
    const window = getTaskWindowMs(initialPromptSequence, currentIndex);
    const entry = {
      promptIndex: currentIndex + 1,
      text: currentItem.text,
      start: formatTime(window.startMs),
      end: formatTime(window.endMs),
      startTs: window.startMs,
      endTs: window.endMs,
    };

    transcriptRef.current.push(entry);
    setTranscript([...transcriptRef.current]);
    markPromptCompleted(currentIndex);

    if (nextPrompt) {
      // Per-task buffer: transition gap after THIS task (seconds → ms).
      const gapMs = (currentItem.buffer ?? 0) * 1000;
      setStatus(`Task ${currentIndex + 1} complete. Next task starts in ${gapMs / 1000}s...`);

      setCurrentPromptIndex(nextIndex);
      currentPromptIndexRef.current = nextIndex;
      setActivePrompt(nextPrompt);

      timers.beginTransitionCountdown({
        gapMs,
        onComplete: () => resumeNextPrompt(nextIndex, nextPrompt),
      });

      recorder.recorderReadyRef.current = false;
      recorder.setMicrophoneEnabled(false);

      const currentRecorder = recorder.mediaRecorderRef.current;
      if (currentRecorder && currentRecorder.state !== 'inactive') {
        const originalOnStop = currentRecorder.onstop;
        currentRecorder.onstop = (e) => {
          if (originalOnStop) originalOnStop(e);
        };
        currentRecorder.stop();
      }

      return { final: false };
    }

    // Final prompt completed — freeze the per-task clock at exactly the task
    // duration (e.g. 00:00:02.000) and stop.
    const finishedElapsed = currentItem.duration * 1000;
    recorder.stopRequestedRef.current = true;
    setIsStopped(true);
    setIsSessionComplete(true);
    setStatus('Recording finished.');
    frozenStatusRef.current = 'Recording finished.';
    timers.freezeClocks(finishedElapsed);
    stopRecordingAndExport();
    return { final: true };
  };

  const startActualRecording = async () => {
    // Bridge the countdown-end → recorder-running gap: the mic stream is
    // released at every finalize, so the permission await below can take
    // real time, during which countdown is 0 and isRecording is still false.
    setIsStarting(true);

    // Fresh runs start at task 1; after Re-record Task they resume at the
    // stopped-at task (currentPromptIndexRef survives the re-record reset).
    const startIndex = currentPromptIndexRef.current;
    const startPromptNumber = startIndex + 1; // recordings/transcript are 1-based

    // Revoke preview URLs only for takes this run will replace (a fresh run
    // replaces everything), so earlier kept takes stay playable.
    for (const rec of savedRecordingsRef.current) {
      if (rec.audioUrl && rec.promptIndex >= startPromptNumber) URL.revokeObjectURL(rec.audioUrl);
    }
    if (playback?.previewAudioRef?.current) playback.previewAudioRef.current.pause();
    playback?.setIsPlayingPreview(false);

    if (!recorder.streamRef.current) {
      const granted = await recorder.requestRecordingPermission();
      if (!granted) {
        setIsStarting(false);
        return;
      }
    }

    if (recorder.streamRef.current) {
      waveform.restartLiveWaveform(recorder.streamRef.current);
    }

    recorder.stopRequestedRef.current = false;
    recorder.perPromptRecordingsRef.current = [];
    recorder.recorderReadyRef.current = true;
    setIsRecording(true);
    // Transcript is NOT cleared here: fresh sessions already cleared it via
    // resetRecordingState, and a re-record run keeps earlier tasks' entries.
    setStatus('Recording in progress');

    try {
      // Recorder, session clock, and progress bar all start in this one
      // synchronous block (beginTick fires its first tick immediately), so
      // they are frame-aligned from the start.
      recorder.startRecorderForPrompt(startPromptNumber);

      timers.markSessionStart();

      timers.beginTick({ onBoundary: handleBoundary });
      setStatus(`Task ${startPromptNumber} of ${initialPromptSequence.length}`);
      setIsStarting(false);
    } catch (error) {
      console.error('Unable to start recording', error);
      recorder.recorderReadyRef.current = true;
      setStatus('Recording could not start.');
      setIsRecording(false);
      setIsStarting(false);
    }
  };

  const startCountdownAndRecording = () => {
    if (isRecording || isStarting || timers.isCountdownActive()) return;

    setIsStopped(false);
    setStatus('Recording starts in 3...');

    // Play countdown audio — the file is 3 s (3-2-1-go), starts immediately.
    // Recording itself starts 0.5 s after the visible countdown ends (hidden
    // settling beat inside beginCountdown), i.e. just after the "go".
    if (countdownAudioRef.current) {
      countdownAudioRef.current.currentTime = 0;
      countdownAudioRef.current.play().catch(() => undefined);
    }

    timers.beginCountdown({ onComplete: () => startActualRecording() });
  };

  const stopRecordingAndExport = () => {
    // Snapshot exact values into refs BEFORE any async work or state batching
    const currentIndex = currentPromptIndexRef.current;
    const finalElapsed = timers.snapshotStop(currentIndex);
    frozenCompletedRef.current = [...completedPromptsRef.current];
    frozenActiveIndexRef.current = currentIndex;
    frozenStatusRef.current = currentIndex >= initialPromptSequence.length - 1 ? 'Recording finished.' : status;

    if (!transcriptRef.current.some((entry) => entry.promptIndex === currentIndex + 1)) {
      const window = getTaskWindowMs(initialPromptSequence, currentIndex);
      const endMs = window.startMs + finalElapsed;
      const currentPrompt = initialPromptSequence[currentIndex];
      transcriptRef.current.push({
        promptIndex: currentIndex + 1,
        text: currentPrompt.text,
        start: formatTime(window.startMs),
        end: formatTime(endMs),
        startTs: window.startMs,
        endTs: endMs,
      });
    }

    recorder.stopRequestedRef.current = true;
    timers.freezeClocks(finalElapsed);
    setIsRecording(false);
    setIsPaused(false);
    isPausedRef.current = false;
    setIsStopped(true);

    waveform.stopLiveWaveform();

    const mediaRecorder = recorder.mediaRecorderRef.current;

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      // Wire finalizeRecordingExport to fire after the last recorder seals its blob
      const originalOnStop = mediaRecorder.onstop;
      mediaRecorder.onstop = (e) => {
        if (originalOnStop) originalOnStop(e);
        finalizeRecordingExport();
      };
      mediaRecorder.stop();
    } else {
      finalizeRecordingExport();
    }
  };

  const handlePauseResume = () => {
    if (!isRecording) return;

    const mediaRecorder = recorder.mediaRecorderRef.current;

    if (isPausedRef.current) {
      if (mediaRecorder && mediaRecorder.state === 'paused') {
        mediaRecorder.resume();
      }

      timers.resumeClocks();
      waveform.restartLiveWaveform(recorder.streamRef.current);

      setIsPaused(false);
      isPausedRef.current = false;
      setStatus('Recording resumed');
      return;
    }

    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.pause();
    }

    timers.pauseClocks();
    waveform.stopLiveWaveform();

    setIsPaused(true);
    isPausedRef.current = true;
    setStatus('Recording paused');
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
    setIsSessionComplete(false);
    timers.resetTimers();
    setCurrentPromptIndex(0);
    currentPromptIndexRef.current = 0;
    setActivePrompt(initialPromptSequence[0]);
    setCompletedPrompts([]);
    completedPromptsRef.current = [];
    transcriptRef.current = [];
    setTranscript([]);
    frozenCompletedRef.current = [];
    frozenActiveIndexRef.current = 0;
    frozenStatusRef.current = '';
    recorder.perPromptRecordingsRef.current = [];
    recorder.recorderReadyRef.current = true;
  };

  // Re-record the task that was active when Stop was pressed: reset the
  // clocks and frozen refs, then point the session back at that task so the
  // next Record run re-records it and proceeds normally through the rest.
  // Earlier tasks keep their completions, transcript entries, and saved
  // takes; takes for tasks being re-recorded are discarded now and replaced
  // at the next finalize.
  const handleReRecord = () => {
    const resumeIndex = frozenActiveIndexRef.current;
    const resumePromptNumber = resumeIndex + 1; // recordings/transcript are 1-based
    const keptCompleted = completedPromptsRef.current.filter((index) => index < resumeIndex);
    const keptTranscript = transcriptRef.current.filter((entry) => entry.promptIndex < resumePromptNumber);
    const keptRecordings = [];
    for (const rec of savedRecordingsRef.current) {
      if (rec.promptIndex < resumePromptNumber) {
        keptRecordings.push(rec);
      } else if (rec.audioUrl) {
        URL.revokeObjectURL(rec.audioUrl);
      }
    }

    resetRecordingState();

    savedRecordingsRef.current = keptRecordings;
    setSavedRecordings(keptRecordings);
    setCurrentPromptIndex(resumeIndex);
    currentPromptIndexRef.current = resumeIndex;
    setActivePrompt(initialPromptSequence[resumeIndex]);
    setCompletedPrompts(keptCompleted);
    completedPromptsRef.current = keptCompleted;
    transcriptRef.current = keptTranscript;
    setTranscript([...keptTranscript]);

    setIsStopped(false);
    setStatus(`Re-record Task ${resumePromptNumber}. Press Record to begin.`);
  };

  // Manual task-box selection (outside export mode): jump the session clock
  // to the chosen task.
  const selectTask = (index) => {
    setCurrentPromptIndex(index);
    currentPromptIndexRef.current = index;
    setActivePrompt(initialPromptSequence[index]);
    timers.markPromptStart();
    setStatus(`Task ${index + 1} of ${initialPromptSequence.length}`);
  };

  // Session-half of START on the instructions page: clean slate, then ready.
  const prepareRecordingSession = () => {
    resetRecordingState();
    setIsStopped(false);
    setCurrentPromptIndex(0);
    currentPromptIndexRef.current = 0;
    setActivePrompt(initialPromptSequence[0]);
    setStatus('Microphone ready. Press Record to begin.');
  };

  return {
    // state
    status,
    isRecording,
    isPaused,
    isStopped,
    isStarting,
    currentPromptIndex,
    activePrompt,
    completedPrompts,
    transcript,
    savedRecordings,
    isPreparingRecordings,
    isAudioSupported,
    isSessionComplete,
    countdown: timers.countdown,
    countdownSettling: timers.countdownSettling,
    transitionCountdownMs: timers.transitionCountdownMs,
    recordingTime: timers.recordingTime,
    frozenTimerMs: timers.frozenTimerMs,
    waveformLevels: waveform.waveformLevels,
    // refs read by the JSX (freeze-on-stop + audio element)
    frozenActiveIndexRef,
    frozenCompletedRef,
    frozenStatusRef,
    frozenProgressRef: timers.frozenProgressRef,
    countdownAudioRef,
    savedRecordingsRef,
    // setters exposed for App-level orchestration
    setStatus,
    setIsStopped,
    // handlers
    requestMicPermission: recorder.requestRecordingPermission,
    prepareRecordingSession,
    startCountdownAndRecording,
    handlePauseResume,
    stopRecordingAndExport,
    handleReRecord,
    selectTask,
    resetRecordingState,
    teardownRecorderAndStream: recorder.teardownRecorderAndStream,
    clearWaveform: waveform.clearWaveform,
  };
};
