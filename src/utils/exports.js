// Export helpers — plain functions over saved recordings. They trigger downloads
// and return a status message string; callers own setting status in the UI.

import { initialPromptSequence } from '../data/prompts.js';
import JSZip from 'jszip';

import { downloadBlob, formatDecimalTime } from './format.js';
import { convertBlobToWav, createSilenceAudioBuffer } from './wav.js';
import { mergeAudioBuffersInWorker } from './audioExportWorker.js';

const TIMESTAMP_CSV_HEADER = 'Task Name,Start,Duration,Time Format (Decimal),Type (Cue),Description';

const csvEscape = (value) => {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

// Builds timestamps on the Session/Full WAV timeline, including the configured
// silent transition buffer after each preceding task.
export const buildTimestampRows = (recordings) => {
  const sorted = [...recordings].sort((a, b) => (a.promptIndex ?? 0) - (b.promptIndex ?? 0));
  const rows = [];
  let sessionTimelineMs = 0;
  let previousPromptIndex = 0;

  for (const rec of sorted) {
    const promptIndex = rec.promptIndex ?? 1;
    for (let missingIndex = previousPromptIndex + 1; missingIndex < promptIndex; missingIndex += 1) {
      const missingPrompt = initialPromptSequence[missingIndex - 1];
      sessionTimelineMs += (missingPrompt?.duration ?? 0) * 1000;
      if (missingIndex < initialPromptSequence.length) {
        sessionTimelineMs += (missingPrompt?.buffer ?? 0) * 1000;
      }
    }

    const prompt = initialPromptSequence[promptIndex - 1];
    const configuredDurationMs = (prompt?.duration ?? 0) * 1000;
    const durationMs = rec.trimmedDurationMs ?? configuredDurationMs;
    const onsetMs = rec.trimStartMs ?? 0;
    const rawDurationMs = rec.rawDurationMs ?? configuredDurationMs;
    const startMs = sessionTimelineMs + onsetMs;

    rows.push({ taskName: `Task ${promptIndex}`, startMs, durationMs, promptIndex });
    sessionTimelineMs += rawDurationMs;
    if (promptIndex < initialPromptSequence.length) {
      sessionTimelineMs += (prompt?.buffer ?? 0) * 1000;
    }
    previousPromptIndex = promptIndex;
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

export const getIndividualAudioSource = (recording) => recording.blob;

export const createIndividualWavFiles = async (recordings, taskId) => {
  const validRecordings = recordings.filter((rec) => getIndividualAudioSource(rec));
  const files = [];

  for (const rec of validRecordings) {
    const source = getIndividualAudioSource(rec);
    const wavBlob = source.type === 'audio/wav' ? source : await convertBlobToWav(source);
    if (!wavBlob) continue;

    const effectiveTaskId = rec.taskId || taskId;
    files.push({
      filename: `task${rec.promptIndex}_${effectiveTaskId}.wav`,
      blob: wavBlob,
    });
  }

  return files;
};

// AI NOTE: NEVER change this export matrix without updating the tests and
// product requirement: Individual = trimmed, Session = untrimmed, and Full =
// trimmed individual files plus an untrimmed session file.
export const getSessionAudioSource = (recording) =>
  recording.untrimmedBlob || recording.blob || recording.audioBuffer;

export const exportTimestampFile = (recordings, taskId, downloadTarget = null, filename = null) => {
  if (recordings.length === 0) {
    return 'No recordings available for timestamp export.';
  }

  const csv = buildTimestampCsv(recordings);
  const blob = createTimestampBlob(recordings);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadBlob(blob, filename || `${taskId || 'task'}_${timestamp}_timestamps.csv`, downloadTarget);
  return 'Timestamp CSV exported.';
};

export const exportIndividualRecordingFiles = async (recordings, taskId, downloadTarget = null, filename = null) => {
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
  downloadBlob(archive, filename || `${taskId || 'task'}_${timestamp}_individual_recordings.zip`, downloadTarget);
  return `Exported ${files.length} individual recordings in a ZIP.`;
};

export const createSessionAudioBlob = async (recordings) => {
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
    const decodedByPrompt = new Map(await Promise.all(sortedRecordings.map(async (recording) => {
      const source = getSessionAudioSource(recording);
      if (!(source instanceof Blob)) return [recording.promptIndex, source];
      const arrayBuffer = await source.arrayBuffer();
      return [recording.promptIndex, await context.decodeAudioData(arrayBuffer.slice(0))];
    })));

    const referenceBuffer = decodedByPrompt.values().next().value;
    const maxPromptIndex = Math.max(...sortedRecordings.map((recording) => recording.promptIndex ?? 0));
    const buffers = [];
    for (let promptIndex = 1; promptIndex <= maxPromptIndex; promptIndex += 1) {
      const prompt = initialPromptSequence[promptIndex - 1];
      const promptBuffer = decodedByPrompt.get(promptIndex)
        || createSilenceAudioBuffer((prompt?.duration ?? 0) * 1000, referenceBuffer.sampleRate, referenceBuffer.numberOfChannels);
      buffers.push(promptBuffer);
      if (promptIndex < maxPromptIndex && promptIndex < initialPromptSequence.length) {
        buffers.push(createSilenceAudioBuffer((prompt?.buffer ?? 0) * 1000, referenceBuffer.sampleRate, referenceBuffer.numberOfChannels));
      }
    }

    return mergeAudioBuffersInWorker(buffers);
  } finally {
    if (context) context.close().catch(() => undefined);
  }
};

export const exportSessionAudioFile = async (recordings, taskId, downloadTarget = null, filename = null) => {
  if (recordings.length === 0) {
    return 'No recordings available for session export.';
  }

  const wavBlob = await createSessionAudioBlob(recordings);
  if (!wavBlob) {
    return 'No valid audio blobs available for session export.';
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob(wavBlob, filename || `${taskId || 'task'}_${timestamp}_session.wav`, downloadTarget);
    return 'Session audio exported as a single file.';
  } catch (error) {
    console.error('Unable to merge session recording', error);
    return 'Session export failed. Try exporting individual files instead.';
  }
};

export const exportAllFiles = async (recordings, taskId, downloadTarget = null, filename = null) => {
  if (recordings.length === 0) {
    return 'No recordings available for full export.';
  }

  const timestampBlob = createTimestampBlob(recordings);
  // AI NOTE: Full export intentionally keeps individual files trimmed. Only
  // the session file below uses the untrimmed source.
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
  downloadBlob(archive, filename || `${taskId || 'task'}_${timestamp}_export.zip`, downloadTarget);
  return `Full export ZIP generated for ${taskId}.`;
};

// Downloads per-prompt audio + timestamp CSV files for the selected task (or all).
// Returns { status, completed } — completed=true means the caller should close export mode.
export const downloadSelectedPrompt = async (recordings, selection, taskId, filenameBase = null) => {
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
    const label = filenameBase
      ? `${filenameBase}_task${rec.promptIndex}`
      : `task${rec.promptIndex}_${effectiveTaskId}`;
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
