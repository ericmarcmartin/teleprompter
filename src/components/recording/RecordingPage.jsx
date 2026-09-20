import { useState } from 'react';

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

  const {
    status,
    isRecording,
    isPaused,
    isStopped,
    currentPromptIndex,
    activePrompt,
    completedPrompts,
    savedRecordings,
    isSessionComplete,
    countdown,
    transitionCountdownMs,
    recordingTime,
    frozenTimerMs,
    progress,
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

  const handleExportTimestamp = () => applyExportStatus(exportTimestampFile(savedRecordings, taskId));
  const handleExportIndividual = async () => applyExportStatus(await exportIndividualRecordingFiles(savedRecordings, taskId));
  const handleExportSession = async () => applyExportStatus(await exportSessionAudioFile(savedRecordings, taskId));
  const handleExportAll = async () => applyExportStatus(await exportAllFiles(savedRecordings, taskId));

  const handleDownloadSelected = async () => {
    const result = await downloadSelectedPrompt(savedRecordings, downloadPromptIndex, taskId);
    applyExportStatus(result.status);
    if (result.completed) {
      setIsExportMode(false);
    }
  };

  const handleSelectPrompt = (index) => {
    if (isExportMode) {
      setDownloadPromptIndex(index === 0 && downloadPromptIndex === 'all' ? 'all' : String(index));
      setStatus(index === 0 && downloadPromptIndex === 'all' ? 'All tasks selected for export' : `Task ${index + 1} selected for export`);
      return;
    }

    selectTask(index);
  };

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
          isSessionComplete={isSessionComplete}
          totalTasks={initialPromptSequence.length}
          totalDurationMs={TOTAL_DURATION_MS}
          countdown={countdown}
          currentPromptIndex={currentPromptIndex}
          promptText={activePrompt.text}
          timerMs={isStopped ? frozenTimerMs : recordingTime}
        />

        <Waveform levels={waveformLevels} />

        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${isStopped ? frozenProgressRef.current : progress}%` }} />
        </div>

        <div className="controls">
          {!isRecording && !countdown && !isStopped ? (
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
        onExportTimestamp={handleExportTimestamp}
        onExportIndividual={handleExportIndividual}
        onExportSession={handleExportSession}
        onExportAll={handleExportAll}
      />
    </div>
  );
};

export default RecordingPage;
