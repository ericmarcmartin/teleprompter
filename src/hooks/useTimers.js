// =============================================================================
// SINGLE TIMER HOME — every timer/clock in the app lives in this hook.
//
// All setInterval loops and all timing refs/state are owned here so timing
// behavior can be tracked in one place:
//   - Recording tick (100ms)     — timerRef / tickRef
//   - 3-2-1 pre-record countdown — countdownRef
//   - Inter-task transition (2s) — transitionCountdownRef
//   - Timing refs: startRef, promptStartRef, promptElapsedMsRef, pausedMsRef,
//     pauseStartedAtRef, transitionStartedAtRef, transitionPauseStartedAtRef,
//     transitionPausedAtRef, transitionCountdownMsRef, timerFrozenRef
//   - Frozen stop-moment display refs: frozenTimeRef, frozenProgressRef
//     (part of the freeze-on-stop invariant — see useRecordingSession.js)
//
// Pure elapsed/remaining math stays in src/timing.js (unit-tested). The
// waveform requestAnimationFrame loops are visualization, not timers, and
// live in useWaveform.js.
//
// External refs the tick depends on (recorder/session owned) are injected via
// deps so this hook never imports recorder or session code.
// =============================================================================

import { useRef, useState } from 'react';

import { initialPromptSequence } from '../data/prompts.js';
import {
  TASK_TRANSITION_GAP_MS,
  getAdjustedElapsedMs,
  getRemainingTransitionMs,
  getResumedPromptStartTimestamp,
} from '../timing.js';

export const useTimers = ({
  stopRequestedRef,
  recorderReadyRef,
  isPausedRef,
  isStoppedRef,
  currentPromptIndexRef,
}) => {
  const [recordingTime, setRecordingTime] = useState(0);
  const [frozenTimerMs, setFrozenTimerMs] = useState(0);
  const [progress, setProgress] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [transitionCountdownMs, setTransitionCountdownMs] = useState(0);

  const timerRef = useRef(null);
  const countdownRef = useRef(null);
  const transitionCountdownRef = useRef(null);
  const tickRef = useRef(null);
  const startRef = useRef(0);
  const promptStartRef = useRef(0);
  const promptElapsedMsRef = useRef(0);
  const pausedMsRef = useRef(0);
  const pauseStartedAtRef = useRef(0);
  const transitionStartedAtRef = useRef(0);
  const transitionPauseStartedAtRef = useRef(0);
  const transitionPausedAtRef = useRef(0);
  const transitionCountdownMsRef = useRef(0);
  const timerFrozenRef = useRef(false);
  const frozenTimeRef = useRef(0);
  const frozenProgressRef = useRef(0);

  // Keep the ref in lockstep with state so interval callbacks never read stale values.
  const setTransitionCountdown = (ms) => {
    transitionCountdownMsRef.current = ms;
    setTransitionCountdownMs(ms);
  };

  // --- 3-2-1 pre-record countdown -------------------------------------------

  const isCountdownActive = () => countdownRef.current !== null;

  const beginCountdown = ({ onComplete }) => {
    if (countdownRef.current) return false;

    setCountdown(3);

    // Track remaining seconds in a local, NOT inside the state updater:
    // React StrictMode double-invokes updater functions in dev, and onComplete
    // (which starts the recording) must fire exactly once. A double start
    // orphans a tick interval that later wakes up after Re-record resets the
    // freeze flags and drives phantom boundary crossings.
    let remaining = 3;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        setCountdown(0);
        onComplete();
        return;
      }
      setCountdown(remaining);
    }, 1000);

    return true;
  };

  const cancelCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(0);
  };

  // --- Recording tick (100ms) ------------------------------------------------
  // The tick owns the clock only. When a prompt boundary is crossed it calls
  // onBoundary (session code) which decides what the boundary means; if the
  // session reports the final prompt, the tick stops updating afterwards.

  const beginTick = ({ onBoundary }) => {
    // Defensive: never allow two ticks to run concurrently. A leftover tick
    // would keep driving boundary crossings against reset (zeroed) timing
    // refs after Re-record, instantly "completing" prompts.
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const tick = () => {
      if (timerFrozenRef.current || stopRequestedRef.current || isStoppedRef.current) {
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

      // FREEZE timer and progress during inter-task transition buffer
      if (transitionCountdownMsRef.current > 0) {
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

      // Captured BEFORE onBoundary: the boundary handler starts the transition
      // countdown synchronously, and the final timer/progress update below must
      // still run on the boundary tick (as it did before the split).
      const transitionActive = transitionCountdownMsRef.current > 0;

      if (elapsedInPrompt >= durationMs) {
        const result = onBoundary({ now, currentIndex, currentItem, promptStartMs: promptStart });
        if (result?.final) {
          return;
        }
      }

      // Only update timer and progress when NOT in a transition buffer
      if (!transitionActive) {
        const elapsed = getAdjustedElapsedMs(now, startRef.current, pausedMsRef.current);
        setRecordingTime(elapsed);
        setProgress(newProgress);
      }
    };

    tickRef.current = tick;
    timerRef.current = setInterval(tick, 100);
  };

  const stopTick = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    tickRef.current = null;
  };

  // --- Inter-task transition countdown (2s, pause-aware) ---------------------

  const beginTransitionCountdown = ({ gapMs = TASK_TRANSITION_GAP_MS, onComplete }) => {
    setTransitionCountdown(gapMs);
    transitionStartedAtRef.current = Date.now();
    transitionPauseStartedAtRef.current = Date.now();
    transitionPausedAtRef.current = 0;

    if (transitionCountdownRef.current) {
      clearInterval(transitionCountdownRef.current);
    }

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
      setTransitionCountdown(remainingMs);

      if (remainingMs <= 0) {
        clearInterval(transitionCountdownRef.current);
        transitionCountdownRef.current = null;
        onComplete();
      }
    }, 100);
  };

  // Called when the transition gap ends: the gap time is folded into pausedMs
  // so it never counts toward the recording total, and the next prompt's clock
  // starts fresh.
  const completeTransition = () => {
    if (transitionPauseStartedAtRef.current > 0) {
      pausedMsRef.current += Date.now() - transitionPauseStartedAtRef.current;
      transitionPauseStartedAtRef.current = 0;
    }

    setTransitionCountdown(0);
    transitionStartedAtRef.current = 0;
    transitionPausedAtRef.current = 0;
    promptStartRef.current = Date.now();
    promptElapsedMsRef.current = 0;
  };

  // --- Pause / resume --------------------------------------------------------

  const pauseClocks = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
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
  };

  const resumeClocks = () => {
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

    const pauseDuration = Date.now() - pauseStartedAtRef.current;
    pausedMsRef.current += pauseDuration;
    pauseStartedAtRef.current = 0;
    promptStartRef.current = getResumedPromptStartTimestamp(Date.now(), promptElapsedMsRef.current);
  };

  // --- Session lifecycle -----------------------------------------------------

  const markSessionStart = () => {
    startRef.current = Date.now();
    promptStartRef.current = Date.now();
    pausedMsRef.current = 0;
    pauseStartedAtRef.current = 0;
    promptElapsedMsRef.current = 0;
  };

  // Manual task-box selection: restart the prompt clock and progress bar.
  const markPromptStart = () => {
    promptStartRef.current = Date.now();
    promptElapsedMsRef.current = 0;
    setProgress(0);
  };

  const getElapsedMs = () =>
    startRef.current ? getAdjustedElapsedMs(Date.now(), startRef.current, pausedMsRef.current) : 0;

  // FREEZE-ON-STOP: synchronously snapshot the stop-moment clock values into
  // frozen refs BEFORE any state setters run. Never skip these writes.
  const snapshotStop = (currentIndex) => {
    const now = Date.now();
    const finalElapsed = startRef.current ? getAdjustedElapsedMs(now, startRef.current, pausedMsRef.current) : 0;
    frozenTimeRef.current = finalElapsed;

    const currentItem = initialPromptSequence[currentIndex];
    if (currentItem && promptStartRef.current) {
      const elapsedInPrompt = now - promptStartRef.current;
      const durationMs = currentItem.duration * 1000;
      frozenProgressRef.current = Math.min((elapsedInPrompt / durationMs) * 100, 100);
    }

    return finalElapsed;
  };

  // Freeze all clocks at the given elapsed value and stop every interval.
  const freezeClocks = (finalElapsed) => {
    timerFrozenRef.current = true;
    frozenTimeRef.current = finalElapsed;
    setFrozenTimerMs(finalElapsed);
    clearInterval(timerRef.current);
    timerRef.current = null;
    tickRef.current = null;
    cancelCountdown();
    setRecordingTime(finalElapsed);
  };

  // Clear every timer, ref, and state value back to zero so a Re-record or
  // Start Over starts clean (freeze-on-stop invariant: always clear all five
  // frozen refs here — frozenTimeRef/frozenProgressRef live in this hook).
  const resetTimers = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    tickRef.current = null;
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (transitionCountdownRef.current) {
      clearInterval(transitionCountdownRef.current);
      transitionCountdownRef.current = null;
    }

    startRef.current = 0;
    promptStartRef.current = 0;
    promptElapsedMsRef.current = 0;
    pausedMsRef.current = 0;
    pauseStartedAtRef.current = 0;
    transitionStartedAtRef.current = 0;
    transitionPauseStartedAtRef.current = 0;
    transitionPausedAtRef.current = 0;
    transitionCountdownMsRef.current = 0;
    timerFrozenRef.current = false;
    frozenTimeRef.current = 0;
    frozenProgressRef.current = 0;

    setRecordingTime(0);
    setFrozenTimerMs(0);
    setProgress(0);
    setCountdown(0);
    setTransitionCountdownMs(0);
  };

  return {
    // state
    recordingTime,
    frozenTimerMs,
    progress,
    countdown,
    transitionCountdownMs,
    // refs needed by session code
    startRef,
    frozenTimeRef,
    frozenProgressRef,
    // setters used by session edge cases
    setProgress,
    // methods
    isCountdownActive,
    beginCountdown,
    cancelCountdown,
    beginTick,
    stopTick,
    beginTransitionCountdown,
    completeTransition,
    pauseClocks,
    resumeClocks,
    markSessionStart,
    markPromptStart,
    getElapsedMs,
    snapshotStop,
    freezeClocks,
    resetTimers,
  };
};
