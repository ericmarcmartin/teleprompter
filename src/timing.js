export const getAdjustedElapsedMs = (nowMs, startMs, cumulativePausedMs) => {
  return nowMs - startMs - cumulativePausedMs;
};

export const getResumedPromptStartTimestamp = (nowMs, elapsedBeforePauseMs) => {
  return nowMs - elapsedBeforePauseMs;
};

export const getRemainingTransitionMs = (elapsedMs, totalMs) => {
  return Math.max(0, totalMs - elapsedMs);
};

export const getTaskTransitionStartTimestamp = (
  nowMs,
  promptStartMs,
  currentDurationMs,
  gapMs,
) => {
  const elapsedInPrompt = nowMs - promptStartMs;
  if (elapsedInPrompt < currentDurationMs) {
    return null;
  }

  return nowMs + gapMs;
};

// Canonical transcript window for a task: contiguous exact-second blocks with
// zero millisecond offsets (Task 1: 0.000-2.000, Task 2: 2.000-4.000 for 2s
// durations). The per-task buffer (the inter-task transition gap) never
// appears in these labels, and windows are canonical per position even when a
// task is recorded alone via manual task selection.
export const getTaskWindowMs = (sequence, index) => {
  let startMs = 0;
  for (let i = 0; i < index; i += 1) {
    startMs += (sequence[i]?.duration ?? 0) * 1000;
  }
  const endMs = startMs + (sequence[index]?.duration ?? 0) * 1000;
  return { startMs, endMs };
};
