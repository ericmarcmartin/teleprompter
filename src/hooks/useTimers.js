// =============================================================================
// SINGLE TIMER HOME — every timer/clock in the app lives in this hook.
//
// All timer loops and all timing refs/state are owned here so timing
// behavior can be tracked in one place:
//   - Recording tick            — self-rescheduling setTimeout chain
//                                 (timerRef / tickRef); reschedules at
//                                 min(100ms, time-to-boundary) so prompt
//                                 boundaries land on exact seconds, and fires
//                                 one synchronous tick from beginTick and
//                                 completeTransition so recorder, clock, and
//                                 progress bar start in the same frame
//   - 3-2-1 pre-record countdown — countdownRef (setInterval)
//   - Inter-task transition (2s) — transitionCountdownRef (setTimeout chain,
//                                 completes at exactly gapMs)
//   - Timing refs: startRef, promptStartRef, promptElapsedMsRef, pausedMsRef,
//     pauseStartedAtRef, transitionStartedAtRef, transitionPauseStartedAtRef,
//     transitionPausedAtRef, transitionCountdownMsRef, timerFrozenRef
//   - Frozen stop-moment display refs: frozenTimeRef, frozenProgressRef
//     (part of the freeze-on-stop invariant — see useRecordingSession.js)
//
// recordingTime / frozenTimerMs are PER-TASK values: the on-screen
// prompt-timer runs 00:00:00.000 → exactly the task duration (e.g.
// 00:00:02.000) for each task and resets at every boundary.
//
// Pure elapsed/remaining/window math stays in src/timing.js (unit-tested). The
// waveform requestAnimationFrame loops are visualization, not timers, and
// live in useWaveform.js.
//
// External refs the tick depends on (recorder/session owned) are injected via
// deps so this hook never imports recorder or session code.
// =============================================================================

import { useRef, useState } from 'react';

import { initialPromptSequence } from '../data/prompts.js';
import {
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
  const [recordingTime, setRecordingTime] = useState(0); // per-task elapsed ms
  const [frozenTimerMs, setFrozenTimerMs] = useState(0); // per-task, frozen at stop
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

  // --- Recording tick (self-rescheduling setTimeout chain) -------------------
  // The tick owns the per-task clock and progress bar. When a prompt boundary
  // is crossed it calls onBoundary (session code) which decides what the
  // boundary means; if the session reports the final prompt, the tick stops
  // updating afterwards.
  //
  // The chain reschedules itself at min(100ms, time-to-boundary) so boundary
  // crossings land exactly on the prompt's exact-second end (e.g. 2.000s)
  // instead of drifting by up to one 100ms interval.

  const scheduleNextTick = (delayMs) => {
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      tickRef.current?.();
    }, delayMs);
  };

  const beginTick = ({ onBoundary }) => {
    // Defensive: never allow two tick chains to run concurrently. A leftover
    // chain would keep driving boundary crossings against reset (zeroed) timing
    // refs after Re-record, instantly "completing" prompts.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const tick = () => {
      if (timerFrozenRef.current || stopRequestedRef.current || isStoppedRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        return;
      }

      if (isPausedRef.current) {
        return;
      }

      // Don't process a boundary while a recorder hand-off is in progress
      if (!recorderReadyRef.current) {
        scheduleNextTick(100);
        return;
      }

      // FREEZE timer and progress during inter-task transition buffer
      if (transitionCountdownMsRef.current > 0) {
        scheduleNextTick(100);
        return;
      }

      const now = Date.now();
      const currentIndex = currentPromptIndexRef.current;
      const currentItem = initialPromptSequence[currentIndex];
      if (!currentItem) {
        scheduleNextTick(100);
        return;
      }

      const promptStart = promptStartRef.current;
      const elapsedInPrompt = now - promptStart;
      const durationMs = currentItem.duration * 1000;
      const newProgress = Math.min((elapsedInPrompt / durationMs) * 100, 100);

      if (elapsedInPrompt >= durationMs) {
        // Snapshot the exact boundary-moment display values BEFORE onBoundary
        // runs: the handler starts the transition countdown synchronously, and
        // the final timer/progress update must still land on this tick.
        setRecordingTime(durationMs);
        setProgress(100);

        const result = onBoundary({ now, currentIndex, currentItem, promptStartMs: promptStart });
        if (result?.final) {
          return;
        }

        // Gap ticks continue so the chain wakes promptly if the session is
        // paused or stopped during the transition buffer.
        scheduleNextTick(100);
        return;
      }

      // Per-task clock: reads 00:00:00.000 at task start, exactly the task
      // duration (e.g. 00:00:02.000) at the boundary.
      setRecordingTime(elapsedInPrompt);
      setProgress(newProgress);
      scheduleNextTick(Math.min(100, durationMs - elapsedInPrompt));
    };

    tickRef.current = tick;
    // Fire one synchronous tick so the recorder, clock, and progress bar all
    // start in the same frame.
    tick();
  };

  const stopTick = () => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    tickRef.current = null;
  };

  // --- Inter-task transition countdown (per-task buffer, pause-aware) --------

  const beginTransitionCountdown = ({ gapMs, onComplete }) => {
    setTransitionCountdown(gapMs);
    transitionStartedAtRef.current = Date.now();
    transitionPauseStartedAtRef.current = Date.now();
    transitionPausedAtRef.current = 0;

    if (transitionCountdownRef.current) {
      clearTimeout(transitionCountdownRef.current);
    }

    // Self-rescheduling chain: each pass waits min(100ms, remainingMs) so the
    // completion callback fires at exactly gapMs and the next recorder starts
    // on the exact millisecond the gap ends.
    const transitionTick = () => {
      transitionCountdownRef.current = null;

      if (isPausedRef.current) {
        if (transitionPausedAtRef.current === 0) {
          transitionPausedAtRef.current = Date.now();
        }
        transitionCountdownRef.current = setTimeout(transitionTick, 100);
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
        onComplete();
        return;
      }

      transitionCountdownRef.current = setTimeout(transitionTick, Math.min(100, remainingMs));
    };

    transitionCountdownRef.current = setTimeout(transitionTick, 100);
  };

  // Called when the transition gap ends: the gap time is folded into pausedMs
  // so it never counts toward the recording total, and the next prompt's clock
  // starts fresh. The tick is invoked synchronously so the new task's timer,
  // progress bar, and recorder all start in the same frame.
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

    if (!timerFrozenRef.current) {
      tickRef.current?.();
    }
  };

  // --- Pause / resume --------------------------------------------------------

  const pauseClocks = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
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
      scheduleNextTick(0);
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

  // Manual task-box selection: restart the prompt clock, per-task timer, and
  // progress bar.
  const markPromptStart = () => {
    promptStartRef.current = Date.now();
    promptElapsedMsRef.current = 0;
    setRecordingTime(0);
    setProgress(0);
  };

  // FREEZE-ON-STOP: synchronously snapshot the stop-moment clock values into
  // frozen refs BEFORE any state setters run. Never skip these writes.
  // Returns the per-task elapsed ms (clamped to the task duration) so callers
  // can pass it straight to freezeClocks.
  const snapshotStop = (currentIndex) => {
    const now = Date.now();
    let finalElapsed = 0;

    const currentItem = initialPromptSequence[currentIndex];
    if (currentItem && promptStartRef.current) {
      const elapsedInPrompt = now - promptStartRef.current;
      const durationMs = currentItem.duration * 1000;
      finalElapsed = Math.min(elapsedInPrompt, durationMs);
      frozenProgressRef.current = Math.min((elapsedInPrompt / durationMs) * 100, 100);
    }

    frozenTimeRef.current = finalElapsed;

    return finalElapsed;
  };

  // Freeze all clocks at the given per-task elapsed value and stop every timer.
  const freezeClocks = (finalElapsed) => {
    timerFrozenRef.current = true;
    frozenTimeRef.current = finalElapsed;
    setFrozenTimerMs(finalElapsed);
    clearTimeout(timerRef.current);
    timerRef.current = null;
    tickRef.current = null;
    cancelCountdown();
    setRecordingTime(finalElapsed);
  };

  // Clear every timer, ref, and state value back to zero so a Re-record or
  // Start Over starts clean (freeze-on-stop invariant: always clear all five
  // frozen refs here — frozenTimeRef/frozenProgressRef live in this hook).
  const resetTimers = () => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    tickRef.current = null;
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (transitionCountdownRef.current) {
      clearTimeout(transitionCountdownRef.current);
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
    snapshotStop,
    freezeClocks,
    resetTimers,
  };
};
