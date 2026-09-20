// Export helpers — plain functions over saved recordings. They trigger downloads
// and return a status message string; callers own setting status in the UI.

import { downloadBlob, formatDateTime } from './format.js';
import { convertBlobToWav, mergeAudioBuffersToWav } from './wav.js';

export const buildTimestampTranscript = (recordings, taskId) => {
  const sessionEntries = recordings.map((recording) => {
    const entry = recording.transcript?.[0];
    const range = entry?.start && entry?.end ? `[${entry.start} -> ${entry.end}]` : '';
    const promptText = entry?.text || `Task ${recording.promptIndex}`;
    return `${range} Task ${recording.promptIndex}: ${promptText}`;
  });

  return [
    '========================================',
    `TASK ID: ${taskId}`,
    `USER: Jarren Dave`,
    `DATE: ${formatDateTime()}`,
    '========================================',
    '',
    ...sessionEntries,
    '',
    '------------',
  ].join('\n');
};

export const exportTimestampFile = (recordings, taskId) => {
  if (recordings.length === 0) {
    return 'No recordings available for timestamp export.';
  }

  const text = buildTimestampTranscript(recordings, taskId);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadBlob(blob, `${taskId || 'task'}_${timestamp}_timestamps.txt`);
  return 'Timestamp transcript exported.';
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
    const wavBlob = await convertBlobToWav(rec.blob);
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

  const validRecordings = recordings.filter((rec) => rec.blob);
  if (validRecordings.length === 0) {
    return 'No valid audio blobs available for session export.';
  }

  const audioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!audioContextClass) {
    return 'This browser cannot render session audio exports.';
  }

  const context = new audioContextClass();
  try {
    const buffers = await Promise.all(validRecordings.map(async (recording) => {
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
    context.close().catch(() => undefined);
  }
};

export const exportAllFiles = async (recordings, taskId) => {
  if (recordings.length === 0) {
    return 'No recordings available for full export.';
  }

  exportTimestampFile(recordings, taskId);
  exportIndividualRecordingFiles(recordings, taskId);
  await exportSessionAudioFile(recordings, taskId);
  return `All exports generated for ${taskId}.`;
};

// Downloads per-prompt audio + transcript files for the selected task (or all).
// Returns { status, completed } — completed=true means the caller should close export mode.
export const downloadSelectedPrompt = async (recordings, selection, taskId) => {
  if (recordings.length === 0) {
    return { status: 'No recordings available for export.', completed: false };
  }

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
      downloadBlob(rec.blob, `${label}_${timestamp}.webm`);
    }

    const entry = rec.transcript?.[0];
    const lines = [
      '========================================',
      `TASK ID: ${effectiveTaskId}`,
      `TASK: ${rec.promptIndex}`,
      `USER: Jarren Dave`,
      `DATE: ${formatDateTime()}`,
      '========================================',
      '',
      entry
        ? `${entry.start && entry.end ? `[${entry.start} -> ${entry.end}] ` : ''}${entry.text || `Task ${rec.promptIndex}`}`
        : `Task ${rec.promptIndex}`,
      '',
      '------------',
    ];
    const txtBlob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    downloadBlob(txtBlob, `${label}_${timestamp}_transcript.txt`);
  }

  return {
    status: selection === 'all'
      ? `All ${recordingsToExport.length} task files exported`
      : `Task ${Number(selection) + 1} exported`,
    completed: true,
  };
};
