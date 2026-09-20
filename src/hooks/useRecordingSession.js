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
//        frozenTimeRef         — prompt-timer elapsed ms (owned by useTimers)
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
import { TASK_TRANSITION_GAP_MS } from '../timing.js';
import { formatTime } from '../utils/format.js';
import { useRecorder } from './useRecorder.js';
import { useTimers } from './useTimers.js';
import { useWaveform } from './useWaveform.js';

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
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [activePrompt, setActivePrompt] = useState(initialPromptSequence[0]);
  const [completedPrompts, setCompletedPrompts] = useState([]);
  const [transcript, setTranscript] = useState([]);
  const [savedRecordings, setSavedRecordings] = useState([]);

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
    recorder.stopRequestedRef.current = false;
    waveform.clearWaveform();

    const newRecordings = recorder.perPromptRecordingsRef.current
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

    recorder.stopStream();

    exportInProgressRef.current = false;
  };

  // Runs when the inter-task transition gap ends: fold the gap into paused
  // time, reset the prompt clock, unmute the mic, and start the next recorder.
  const resumeNextPrompt = (nextIndex, nextPrompt) => {
    timers.completeTransition();

    setCurrentPromptIndex(nextIndex);
    currentPromptIndexRef.current = nextIndex;
    setActivePrompt(nextPrompt);
    setStatus(`Task ${nextIndex + 1} of ${initialPromptSequence.length}`);

    recorder.setMicrophoneEnabled(true);
    recorder.startRecorderForPrompt(nextIndex + 1);
  };

  // Prompt-boundary reaction, invoked by the timer tick. Returns { final }
  // so the tick knows whether the session just ended.
  const handleBoundary = ({ now, currentIndex, currentItem, promptStartMs }) => {
    const nextIndex = currentIndex + 1;
    const nextPrompt = initialPromptSequence[nextIndex];
    const entry = {
      promptIndex: currentIndex + 1,
      text: currentItem.text,
      start: formatTime(promptStartMs - timers.startRef.current),
      end: formatTime(now - timers.startRef.current),
      startTs: promptStartMs - timers.startRef.current,
      endTs: now - timers.startRef.current,
    };

    transcriptRef.current.push(entry);
    setTranscript([...transcriptRef.current]);
    markPromptCompleted(currentIndex);

    if (nextPrompt) {
      const gapMs = TASK_TRANSITION_GAP_MS;
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

    // Final prompt completed — freeze the clock and stop.
    const finishedElapsed = timers.getElapsedMs();
    recorder.stopRequestedRef.current = true;
    setIsStopped(true);
    setStatus('Recording finished.');
    frozenStatusRef.current = 'Recording finished.';
    timers.setProgress(100);
    timers.freezeClocks(finishedElapsed);
    stopRecordingAndExport();
    return { final: true };
  };

  const startActualRecording = async () => {
    // Revoke previous preview URLs and stop any active playback
    for (const rec of savedRecordingsRef.current) {
      if (rec.audioUrl) URL.revokeObjectURL(rec.audioUrl);
    }
    if (playback?.previewAudioRef?.current) playback.previewAudioRef.current.pause();
    playback?.setIsPlayingPreview(false);

    if (!recorder.streamRef.current) {
      const granted = await recorder.requestRecordingPermission();
      if (!granted) return;
    }

    if (recorder.streamRef.current) {
      waveform.restartLiveWaveform(recorder.streamRef.current);
    }

    recorder.stopRequestedRef.current = false;
    recorder.perPromptRecordingsRef.current = [];
    recorder.recorderReadyRef.current = true;
    setIsRecording(true);
    setTranscript([]);
    transcriptRef.current = [];
    setStatus('Recording in progress');

    try {
      timers.markSessionStart();

      // Start the first per-prompt recorder
      recorder.startRecorderForPrompt(1);

      timers.beginTick({ onBoundary: handleBoundary });
      setStatus(`Task 1 of ${initialPromptSequence.length}`);
    } catch (error) {
      console.error('Unable to start recording', error);
      setStatus('Recording could not start.');
      setIsRecording(false);
    }
  };

  const startCountdownAndRecording = () => {
    if (isRecording || timers.isCountdownActive()) return;

    setIsStopped(false);
    setStatus('Recording starts in 3...');

    // Play countdown audio — the file is 3 s (3-2-1-go), starts immediately
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

  const handleReRecord = () => {
    resetRecordingState();
    setIsStopped(false);
    setStatus('Microphone ready. Press Record to begin.');
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
    currentPromptIndex,
    activePrompt,
    completedPrompts,
    transcript,
    savedRecordings,
    isAudioSupported,
    countdown: timers.countdown,
    transitionCountdownMs: timers.transitionCountdownMs,
    recordingTime: timers.recordingTime,
    frozenTimerMs: timers.frozenTimerMs,
    progress: timers.progress,
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
