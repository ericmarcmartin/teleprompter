// Export helpers — plain functions over saved recordings. They trigger downloads
// and return a status message string; callers own setting status in the UI.

import { initialPromptSequence } from '../data/prompts.js';
import { downloadBlob, formatDecimalTime } from './format.js';
import { convertBlobToWav, mergeAudioBuffersToWav } from './wav.js';

const TIMESTAMP_CSV_HEADER = 'Task Name,Start,Duration,Time Format (Decimal),Type (Cue),Description';

const csvEscape = (value) => {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

// Builds the contiguous Start/Duration chain: recordings are stitched back to
// back with no gaps (trimmed silence removed), so start[i] = start[i-1] +
// duration[i-1] — only the first row's start comes from its own leading-silence offset.
export const buildTimestampRows = (recordings) => {
  const sorted = [...recordings].sort((a, b) => (a.promptIndex ?? 0) - (b.promptIndex ?? 0));
  const rows = [];
  let nextStartMs = null;

  for (const rec of sorted) {
    const fallbackDurationMs = (initialPromptSequence[(rec.promptIndex ?? 1) - 1]?.duration ?? 0) * 1000;
    const durationMs = rec.trimmedDurationMs ?? fallbackDurationMs;
    const startMs = nextStartMs === null ? (rec.trimStartMs ?? 0) : nextStartMs;

    rows.push({ taskName: `Task ${rec.promptIndex}`, startMs, durationMs, promptIndex: rec.promptIndex });
    nextStartMs = startMs + durationMs;
  }

  return rows;
};

const rowToCsvLine = (row) => [
  csvEscape(row.taskName),
  formatDecimalTime(row.startMs),
  formatDecimalTime(row.durationMs),
  'decimal',
  'Cue',
  '',
].join(',');

export const buildTimestampCsv = (recordings) => {
  const rows = buildTimestampRows(recordings);
  return [TIMESTAMP_CSV_HEADER, ...rows.map(rowToCsvLine)].join('\n');
};

export const exportTimestampFile = (recordings, taskId) => {
  if (recordings.length === 0) {
    return 'No recordings available for timestamp export.';
  }

  const csv = buildTimestampCsv(recordings);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadBlob(blob, `${taskId || 'task'}_${timestamp}_timestamps.csv`);
  return 'Timestamp CSV exported.';
};

export const exportIndividualRecordingFiles = async (recordings, taskId) => {
  if (recordings.length === 0) {
    return 'No recordings available for individual export.';
  }

  const validRecordings = recordings.filter((rec) => rec.blob);
  if (validRecordings.length === 0) {
    return 'No valid recordings available for export.';
  }

  for (const rec of validRecordings) {
    const wavBlob = rec.blob.type === 'audio/wav' ? rec.blob : await convertBlobToWav(rec.blob);
    if (!wavBlob) continue;

    const effectiveTaskId = rec.taskId || taskId;
    const label = `task${rec.promptIndex}_${effectiveTaskId}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob(wavBlob, `${label}_${timestamp}.wav`);
  }

  return `Exported ${validRecordings.length} individual recordings as WAV.`;
};

export const exportSessionAudioFile = async (recordings, taskId) => {
  if (recordings.length === 0) {
    return 'No recordings available for session export.';
  }

  const validRecordings = recordings.filter((rec) => rec.blob || rec.audioBuffer);
  if (validRecordings.length === 0) {
    return 'No valid audio blobs available for session export.';
  }

  const sortedRecordings = [...validRecordings].sort((a, b) => (a.promptIndex ?? 0) - (b.promptIndex ?? 0));
  // Reuse each recording's already-trimmed buffer (the same one backing its
  // Saved Recordings preview) instead of re-decoding the WAV blob, so the
  // session export always matches what plays back in the saved list.
  const needsDecode = sortedRecordings.some((rec) => !rec.audioBuffer);

  let context = null;
  if (needsDecode) {
    const audioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!audioContextClass) {
      return 'This browser cannot render session audio exports.';
    }
    context = new audioContextClass();
  }

  try {
    const buffers = await Promise.all(sortedRecordings.map(async (recording) => {
      if (recording.audioBuffer) return recording.audioBuffer;
      const arrayBuffer = await recording.blob.arrayBuffer();
      return context.decodeAudioData(arrayBuffer.slice(0));
    }));

    const wavBlob = mergeAudioBuffersToWav(buffers);
    if (!wavBlob) {
      return 'Unable to create the session audio file.';
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob(wavBlob, `${taskId || 'task'}_${timestamp}_session.wav`);
    return 'Session audio exported as a single file.';
  } catch (error) {
    console.error('Unable to merge session recording', error);
    return 'Session export failed. Try exporting individual files instead.';
  } finally {
    if (context) context.close().catch(() => undefined);
  }
};

export const exportAllFiles = async (recordings, taskId) => {
  if (recordings.length === 0) {
    return 'No recordings available for full export.';
  }

  exportTimestampFile(recordings, taskId);
  await exportIndividualRecordingFiles(recordings, taskId);
  await exportSessionAudioFile(recordings, taskId);
  return `All exports generated for ${taskId}.`;
};

// Downloads per-prompt audio + timestamp CSV files for the selected task (or all).
// Returns { status, completed } — completed=true means the caller should close export mode.
export const downloadSelectedPrompt = async (recordings, selection, taskId) => {
  if (recordings.length === 0) {
    return { status: 'No recordings available for export.', completed: false };
  }

  // Rows are computed from the FULL session so Start values stay correct even
  // when only a subset of tasks is being downloaded.
  const rowsByIndex = new Map(buildTimestampRows(recordings).map((row) => [row.promptIndex, row]));

  const recordingsToExport = selection === 'all'
    ? recordings
    : recordings.filter((r) => r.promptIndex === Number(selection) + 1);

  if (recordingsToExport.length === 0) {
    return { status: 'No task text available for download.', completed: false };
  }

  for (const rec of recordingsToExport) {
    const effectiveTaskId = rec.taskId || taskId;
    const label = `task${rec.promptIndex}_${effectiveTaskId}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (rec.blob) {
      downloadBlob(rec.blob, `${label}_${timestamp}.wav`);
    }

    const row = rowsByIndex.get(rec.promptIndex) || { taskName: `Task ${rec.promptIndex}`, startMs: 0, durationMs: 0 };
    const csv = [TIMESTAMP_CSV_HEADER, rowToCsvLine(row)].join('\n');
    const csvBlob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(csvBlob, `${label}_${timestamp}_timestamps.csv`);
  }

  return {
    status: selection === 'all'
      ? `All ${recordingsToExport.length} task files exported`
      : `Task ${Number(selection) + 1} exported`,
    completed: true,
  };
};
