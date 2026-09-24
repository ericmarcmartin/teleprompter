// Formatting + download helpers. Pure / DOM-only — no React, no recording state.

export const formatTime = (ms) => {
  const hours = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const minutes = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const seconds = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  const milliseconds = String(ms % 1000).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
};

// Export-timestamp format: minutes unpadded, seconds/millis padded (e.g. "0:02.259").
export const formatDecimalTime = (ms) => {
  const totalMs = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = totalMs % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
};

export const formatDateTime = (date = new Date()) =>
  `${date.toISOString().slice(0, 10)} ${date.toLocaleTimeString('en-GB', {
    hour12: false,
  })}`;

export const toTranscriptFilename = (taskId) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${taskId || 'task'}_${timestamp}_transcript.txt`;
};

export const downloadBlob = (blob, filename, downloadTarget = null) => {
  const url = URL.createObjectURL(blob);
  if (downloadTarget && !downloadTarget.closed) {
    const targetDocument = downloadTarget.document;
    const anchor = targetDocument.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.textContent = 'Download again';
    targetDocument.body.replaceChildren(
      targetDocument.createTextNode('Preparing download... This tab will automatically close once download starts.')
    );
    targetDocument.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    downloadTarget.opener?.focus();
    window.focus();
    setTimeout(() => {
      downloadTarget.opener?.focus();
      downloadTarget.close();
      window.focus();
    }, 1500);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return;
  }

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 100);
};
