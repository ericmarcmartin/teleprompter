export const TASK_TRANSITION_GAP_MS = 2000;

export const getAdjustedElapsedMs = (nowMs, startMs, cumulativePausedMs) => {
  return nowMs - startMs - cumulativePausedMs;
};

export const getResumedPromptStartTimestamp = (nowMs, elapsedBeforePauseMs) => {
  return nowMs - elapsedBeforePauseMs;
};

export const getRemainingTransitionMs = (elapsedMs, totalMs = TASK_TRANSITION_GAP_MS) => {
  return Math.max(0, totalMs - elapsedMs);
};

export const getTaskTransitionStartTimestamp = (
  nowMs,
  promptStartMs,
  currentDurationMs,
  gapMs = TASK_TRANSITION_GAP_MS,
) => {
  const elapsedInPrompt = nowMs - promptStartMs;
  if (elapsedInPrompt < currentDurationMs) {
    return null;
  }

  return nowMs + gapMs;
};
