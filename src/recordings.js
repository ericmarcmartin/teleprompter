export const mergeSavedRecordings = (previous = [], incoming = []) => {
  const merged = new Map();

  for (const item of [...previous, ...incoming]) {
    if (!item || item.promptIndex == null) continue;
    const key = `${item.taskId || 'unknown'}::${item.promptIndex}`;
    merged.set(key, item);
  }

  return [...merged.values()].sort((a, b) => (a.promptIndex ?? 0) - (b.promptIndex ?? 0));
};

export const shouldKeepRecordingChunk = ({ stopRequested, promptIndex, totalPrompts }) => {
  if (promptIndex == null || totalPrompts == null) return true;

  if (promptIndex >= totalPrompts) {
    return true;
  }

  return !stopRequested;
};
