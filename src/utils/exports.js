// Export helpers — plain functions over saved recordings. They trigger downloads
// and return a status message string; callers own setting status in the UI.

import { initialPromptSequence } from '../data/prompts.js';
import JSZip from 'jszip';

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

const createTimestampBlob = (recordings) => new Blob([buildTimestampCsv(recordings)], {
  type: 'text/csv;charset=utf-8',
});

const createIndividualWavFiles = async (recordings, taskId) => {
  const validRecordings = recordings.filter((rec) => rec.blob);
  const files = [];

  for (const rec of validRecordings) {
    const wavBlob = rec.blob.type === 'audio/wav' ? rec.blob : await convertBlobToWav(rec.blob);
    if (!wavBlob) continue;

    const effectiveTaskId = rec.taskId || taskId;
    files.push({
      filename: `task${rec.promptIndex}_${effectiveTaskId}.wav`,
      blob: wavBlob,
    });
  }

  return files;
};

export const getSessionAudioSource = (recording) =>
  recording.untrimmedBlob || recording.audioBuffer || recording.blob;

export const exportTimestampFile = (recordings, taskId) => {
  if (recordings.length === 0) {
    return 'No recordings available for timestamp export.';
  }

  const csv = buildTimestampCsv(recordings);
  const blob = createTimestampBlob(recordings);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadBlob(blob, `${taskId || 'task'}_${timestamp}_timestamps.csv`);
  return 'Timestamp CSV exported.';
};

export const exportIndividualRecordingFiles = async (recordings, taskId) => {
  if (recordings.length === 0) {
    return 'No recordings available for individual export.';
  }

  const files = await createIndividualWavFiles(recordings, taskId);
  if (files.length === 0) {
    return 'No valid recordings available for export.';
  }

  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.filename, file.blob);
  }

  const archive = await zip.generateAsync({ type: 'blob' });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadBlob(archive, `${taskId || 'task'}_${timestamp}_individual_recordings.zip`);
  return `Exported ${files.length} individual recordings in a ZIP.`;
};

const createSessionAudioBlob = async (recordings) => {
  const validRecordings = recordings.filter((rec) => getSessionAudioSource(rec));
  if (validRecordings.length === 0) return null;

  const sortedRecordings = [...validRecordings].sort((a, b) => (a.promptIndex ?? 0) - (b.promptIndex ?? 0));
  const needsDecode = sortedRecordings.some((rec) => getSessionAudioSource(rec) instanceof Blob);
  let context = null;

  if (needsDecode) {
    const audioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!audioContextClass) return null;
    context = new audioContextClass();
  }

  try {
    const buffers = await Promise.all(sortedRecordings.map(async (recording) => {
      const source = getSessionAudioSource(recording);
      if (!(source instanceof Blob)) return source;
      const sourceBlob = source;
      const arrayBuffer = await sourceBlob.arrayBuffer();
      return context.decodeAudioData(arrayBuffer.slice(0));
    }));

    return mergeAudioBuffersToWav(buffers);
  } finally {
    if (context) context.close().catch(() => undefined);
  }
};

export const exportSessionAudioFile = async (recordings, taskId) => {
  if (recordings.length === 0) {
    return 'No recordings available for session export.';
  }

  const wavBlob = await createSessionAudioBlob(recordings);
  if (!wavBlob) {
    return 'No valid audio blobs available for session export.';
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob(wavBlob, `${taskId || 'task'}_${timestamp}_session.wav`);
    return 'Session audio exported as a single file.';
  } catch (error) {
    console.error('Unable to merge session recording', error);
    return 'Session export failed. Try exporting individual files instead.';
  }
};

export const exportAllFiles = async (recordings, taskId) => {
  if (recordings.length === 0) {
    return 'No recordings available for full export.';
  }

  const timestampBlob = createTimestampBlob(recordings);
  const individualFiles = await createIndividualWavFiles(recordings, taskId);
  const sessionBlob = await createSessionAudioBlob(recordings);

  if (individualFiles.length === 0 || !sessionBlob) {
    return 'Unable to create the full export ZIP.';
  }

  const zip = new JSZip();
  zip.file(`${taskId || 'task'}_timestamps.csv`, timestampBlob);
  for (const file of individualFiles) {
    zip.file(file.filename, file.blob);
  }
  zip.file(`${taskId || 'task'}_session.wav`, sessionBlob);

  const archive = await zip.generateAsync({ type: 'blob' });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadBlob(archive, `${taskId || 'task'}_${timestamp}_export.zip`);
  return `Full export ZIP generated for ${taskId}.`;
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
