export const mergeSavedRecordings = (previous = [], incoming = []) => {
  const merged = new Map();

  for (const item of [...previous, ...incoming]) {
    if (!item || item.promptIndex == null) continue;
    const key = `${item.taskId || 'unknown'}::${item.promptIndex}`;
    merged.set(key, item);
  }

  return [...merged.values()].sort((a, b) => (a.promptIndex ?? 0) - (b.promptIndex ?? 0));
};
