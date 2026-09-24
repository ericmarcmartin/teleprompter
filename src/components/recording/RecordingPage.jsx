import { useCallback, useRef, useState } from 'react';

import { initialPromptSequence } from '../../data/prompts.js';
import {
  downloadSelectedPrompt,
  exportAllFiles,
  exportIndividualRecordingFiles,
  exportSessionAudioFile,
  exportTimestampFile,
} from '../../utils/exports.js';
import ExportSidebar from './ExportSidebar.jsx';
import PromptSelector from './PromptSelector.jsx';
import SavedRecordingsList from './SavedRecordingsList.jsx';
import TeleprompterDisplay from './TeleprompterDisplay.jsx';
import Waveform from './Waveform.jsx';

// Static summary stat for the completion state — derived from constant data.
const TOTAL_DURATION_MS = initialPromptSequence.reduce((sum, p) => sum + p.duration, 0) * 1000;

// Assembles the recording page from the session hook (state + handlers), the
// playback hook, and the recording subcomponents. While session.isStopped is
// true, all stop-moment display values come from the session's frozen refs —
// never from live state (freeze-on-stop invariant, see useRecordingSession.js).
const RecordingPage = ({ session, playback, taskId, onStartOver }) => {
  const [downloadPromptIndex, setDownloadPromptIndex] = useState('all');
  const [isExportMode, setIsExportMode] = useState(false);
  const [activeExport, setActiveExport] = useState(null);
  const [exportOverlay, setExportOverlay] = useState(null);
  const activeExportRef = useRef(null);

  const {
    status,
    isRecording,
    isPaused,
    isStopped,
    isStarting,
    currentPromptIndex,
    activePrompt,
    completedPrompts,
    savedRecordings,
    isPreparingRecordings,
    isSessionComplete,
    countdown,
    countdownSettling,
    transitionCountdownMs,
    recordingTime,
    frozenTimerMs,
    waveformLevels,
    frozenActiveIndexRef,
    frozenCompletedRef,
    frozenStatusRef,
    frozenProgressRef,
    countdownAudioRef,
    setStatus,
    startCountdownAndRecording,
    handlePauseResume,
    stopRecordingAndExport,
    handleReRecord,
    selectTask,
  } = session;

  const applyExportStatus = (statusMessage) => {
    if (statusMessage) setStatus(statusMessage);
  };

  const handleRecordingExportAttempt = () => {
    if (isRecording) setStatus('Finish or stop recording to enable exports.');
  };

  const prepareDownloadTarget = () => {
    if (typeof window === 'undefined' || !window.open) return null;

    try {
      const target = window.open('', '_blank');
      if (!target) return null;
      target.document.title = 'Preparing download';
      target.document.body.textContent = 'Preparing download... This tab will automatically close once download starts.';
      return target;
    } catch (error) {
      console.warn('Unable to reserve a download target; using standard download.', error);
      return null;
    }
  };

  const runExport = async (exportName, exportOperation, reserveDownload = true, waitForPaint = true) => {
    if (activeExportRef.current) return;

    activeExportRef.current = exportName;
    const downloadTarget = reserveDownload ? prepareDownloadTarget() : null;
    setActiveExport(exportName);
    setExportOverlay({ exportName, isProcessing: true, retry: () => runExport(exportName, exportOperation, reserveDownload, waitForPaint) });
    try {
      if (waitForPaint) await new Promise((resolve) => requestAnimationFrame(resolve));
      const statusMessage = await exportOperation(downloadTarget);
      applyExportStatus(statusMessage);
      setExportOverlay({ exportName, isProcessing: false, retry: () => runExport(exportName, exportOperation, reserveDownload, waitForPaint) });
    } catch (error) {
      console.error(`Unable to complete ${exportName} export`, error);
      applyExportStatus('Export failed. Please try again.');
      if (downloadTarget && !downloadTarget.closed) downloadTarget.close();
      setExportOverlay({ exportName, isProcessing: false, failed: true, retry: () => runExport(exportName, exportOperation, reserveDownload, waitForPaint) });
    } finally {
      activeExportRef.current = null;
      setActiveExport(null);
    }
  };

  const openFilenameOverlay = (exportName, defaultFilename, extension, exportOperation, reserveDownload = true, waitForPaint = true) => {
    setExportOverlay({
      exportName,
      isNaming: true,
      filename: defaultFilename,
      extension,
      exportOperation,
      reserveDownload,
      waitForPaint,
    });
  };

  const confirmFilename = () => {
    const filenameBase = exportOverlay.filename.trim();
    if (!filenameBase) return;
    const filename = `${filenameBase}${exportOverlay.extension}`;
    runExport(
      exportOverlay.exportName,
      exportOverlay.exportOperation(filenameBase, filename),
      exportOverlay.reserveDownload,
      exportOverlay.waitForPaint,
    );
  };

  const handleExportTimestamp = () => {
    openFilenameOverlay(
      'timestamp',
      `${taskId || 'task'}_timestamps`,
      '.csv',
      (_filenameBase, filename) => (downloadTarget) => exportTimestampFile(savedRecordings, taskId, downloadTarget, filename),
      false,
    );
  };
  const handleExportIndividual = () => {
    openFilenameOverlay(
      'individual',
      `${taskId || 'task'}_individual_recordings`,
      '.zip',
      (_filenameBase, filename) => (downloadTarget) => exportIndividualRecordingFiles(savedRecordings, taskId, downloadTarget, filename),
    );
  };
  const handleExportSession = () => {
    openFilenameOverlay(
      'session',
      `${taskId || 'task'}_session`,
      '.wav',
      (_filenameBase, filename) => (downloadTarget) => exportSessionAudioFile(savedRecordings, taskId, downloadTarget, filename),
    );
  };
  const handleExportAll = () => {
    openFilenameOverlay(
      'all',
      `${taskId || 'task'}_export`,
      '.zip',
      (_filenameBase, filename) => (downloadTarget) => exportAllFiles(savedRecordings, taskId, downloadTarget, filename),
    );
  };

  const handleDownloadSelected = () => {
    openFilenameOverlay(
      'selected',
      `${taskId || 'task'}_selected`,
      '',
      (filenameBase) => async () => {
        const result = await downloadSelectedPrompt(savedRecordings, downloadPromptIndex, taskId, filenameBase);
        applyExportStatus(result.status);
        if (result.completed) setIsExportMode(false);
        return null;
      },
      false,
    );
  };

  const handleFilenameChange = (event) => {
    const { value } = event.target;
    setExportOverlay((previous) => {
      const sanitized = value.replace(/[\\/:*?"<>|]/g, '');
      const extension = previous.extension;
      const filename = extension && sanitized.toLowerCase().endsWith(extension)
        ? sanitized.slice(0, -extension.length)
        : sanitized;
      return { ...previous, filename };
    });
  };

  const handleFilenameKeyDown = (event) => {
    if (event.key === 'Enter') confirmFilename();
  };

  const getExportTitle = (exportName) => ({
    timestamp: 'Timestamp export',
    individual: 'Individual tasks export',
    session: 'Session export',
    all: 'Full export',
    selected: 'Selected tasks export',
  }[exportName] || 'Export');

  const handleSelectPrompt = useCallback((index) => {
    if (isExportMode) {
      setDownloadPromptIndex(index === 0 && downloadPromptIndex === 'all' ? 'all' : String(index));
      setStatus(index === 0 && downloadPromptIndex === 'all' ? 'All tasks selected for export' : `Task ${index + 1} selected for export`);
      return;
    }

    selectTask(index);
  }, [downloadPromptIndex, isExportMode, selectTask, setStatus]);

  return (
    <div className="recording-layout">
      <div className="recording-page panel glass">
        {/* Hidden countdown audio */}
        <audio ref={countdownAudioRef} src="/countdown.wav" preload="auto" style={{ display: 'none' }} />

        <div className="recording-header">
          <div>
            <div className="recording-tag">Recording Collection Software</div>
            <h2>Hi Celia</h2>
          </div>
          <div className="status-pill">{isStopped ? frozenStatusRef.current : status}</div>
        </div>

        <TeleprompterDisplay
          transitionCountdownMs={transitionCountdownMs}
          isRecording={isRecording}
          isStopped={isStopped}
          isStarting={isStarting}
          isSessionComplete={isSessionComplete}
          totalTasks={initialPromptSequence.length}
          totalDurationMs={TOTAL_DURATION_MS}
          countdown={countdown}
          countdownSettling={countdownSettling}
          currentPromptIndex={currentPromptIndex}
          promptText={activePrompt.text}
          timerMs={isStopped ? frozenTimerMs : recordingTime}
        />

        <Waveform levels={waveformLevels} />

        <div className="progress-track" aria-label="Task progress">
          <div
            key={`${currentPromptIndex}-${isStopped ? 'stopped' : 'active'}`}
            className={`progress-fill${isRecording ? ' is-recording' : ''}${isPaused ? ' is-paused' : ''}${transitionCountdownMs > 0 ? ' is-buffering' : ''}${isStopped ? ' is-stopped' : ''}`}
            style={{
              '--progress-duration': `${activePrompt.duration}s`,
              '--progress-scale': isStopped ? frozenProgressRef.current / 100 : 0,
            }}
          />
        </div>

        <div className="controls">
          {!isRecording && !isStarting && !countdown && !isStopped ? (
            <button className="primary" onClick={startCountdownAndRecording}>Record</button>
          ) : null}
          {isStopped && (
            <>
              <button className="secondary" onClick={handleReRecord}>Re-record Task</button>
              <button className="danger" onClick={onStartOver}>Start Over</button>
            </>
          )}
          {/* {!isRecording && !countdown && savedRecordings.length > 0 && (
            <button
              className={`preview-play-btn${playback.isPlayingPreview ? ' playing' : ''}`}
              onClick={() => playback.handleTogglePreview(savedRecordings[0]?.audioUrl)}
              aria-label={playback.isPlayingPreview ? 'Pause preview' : 'Play preview'}
              title={playback.isPlayingPreview ? 'Pause preview' : 'Play recording'}
            >
              {playback.isPlayingPreview ? '⏸' : '▶'}
            </button>
          )} */}
          {isRecording && (
            <>
              <button className="secondary" onClick={handlePauseResume}>
                {isPaused ? 'Resume' : 'Pause'}
              </button>
              <button className="danger" onClick={stopRecordingAndExport}>Stop</button>
            </>
          )}
          {/* <button className="ghost compact export-toggle" onClick={() => setIsExportMode((previous) => !previous)}>
            {isExportMode ? 'Close export' : 'Export'}
          </button> */}
        </div>

        <PromptSelector
          prompts={initialPromptSequence}
          isExportMode={isExportMode}
          downloadPromptIndex={downloadPromptIndex}
          activeIndex={isStopped ? frozenActiveIndexRef.current : currentPromptIndex}
          completedPrompts={isStopped ? frozenCompletedRef.current : completedPrompts}
          onSelect={handleSelectPrompt}
        />

        <div className="action-panel">
          {savedRecordings.length > 0 && (
            <audio
              ref={playback.previewAudioRef}
              src={savedRecordings[0]?.audioUrl ?? ''}
              onEnded={() => playback.setIsPlayingPreview(false)}
              style={{ display: 'none' }}
            />
          )}

          {isExportMode && (
            <div className="download-actions">
              <button className="primary compact" onClick={handleDownloadSelected}>Export</button>
            </div>
          )}
        </div>

        {savedRecordings.length > 0 && (
          <SavedRecordingsList
            recordings={savedRecordings}
            playingRecordingId={playback.playingRecordingId}
            onPlayRecording={playback.handlePlayRecording}
          />
        )}
      </div>

      <ExportSidebar
        activeExport={activeExport}
        isRecording={isRecording}
        isPreparingRecordings={isPreparingRecordings}
        onRecordingExportAttempt={handleRecordingExportAttempt}
        onExportTimestamp={handleExportTimestamp}
        onExportIndividual={handleExportIndividual}
        onExportSession={handleExportSession}
        onExportAll={handleExportAll}
      />

      {exportOverlay && (
        <div className="export-overlay" role="dialog" aria-modal="true" aria-labelledby="export-overlay-title">
          <div className="export-overlay-card">
            {exportOverlay.isProcessing ? <div className="export-overlay-spinner" aria-hidden="true" /> : null}
            <strong id="export-overlay-title">
              {exportOverlay.isNaming
                ? getExportTitle(exportOverlay.exportName)
                : exportOverlay.isProcessing
                ? (exportOverlay.exportName === 'selected' ? 'Preparing download' : 'Processing export')
                : (exportOverlay.failed ? 'Export failed' : 'Download should start')}
            </strong>
            {exportOverlay.isNaming ? (
              <>
                <span>Choose the file name before downloading.</span>
                <div className="export-filename-field">
                  <input
                    autoFocus
                    value={exportOverlay.filename}
                    onChange={handleFilenameChange}
                    onKeyDown={handleFilenameKeyDown}
                    aria-label="File name"
                  />
                  {exportOverlay.extension ? <span className="export-filename-extension">{exportOverlay.extension}</span> : null}
                </div>
              </>
            ) : <span>
              {exportOverlay.isProcessing
                ? 'Please keep this window open.'
                : (exportOverlay.failed ? 'Try the download again or close this message.' : 'If it does not, click the button below.')}
            </span>}
            {exportOverlay.isNaming && (
              <div className="export-overlay-actions">
                <button className="primary compact" onClick={confirmFilename} disabled={!exportOverlay.filename.trim()}>
                  Download
                </button>
                <button className="ghost compact" onClick={() => setExportOverlay(null)}>Cancel</button>
              </div>
            )}
            {!exportOverlay.isProcessing && !exportOverlay.isNaming && (
              <div className="export-overlay-actions">
                <button className="primary compact" onClick={exportOverlay.retry}>
                  {exportOverlay.failed ? 'Try again' : 'Download again'}
                </button>
                <button className="ghost compact" onClick={() => setExportOverlay(null)}>Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RecordingPage;
