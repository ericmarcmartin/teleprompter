export const getAdjustedElapsedMs = (nowMs, startMs, cumulativePausedMs) => {
  return nowMs - startMs - cumulativePausedMs;
};

export const getResumedPromptStartTimestamp = (nowMs, elapsedBeforePauseMs) => {
  return nowMs - elapsedBeforePauseMs;
};
