const ExportSidebar = ({ activeExport, isRecording, onRecordingExportAttempt, onExportTimestamp, onExportIndividual, onExportSession, onExportAll }) => (
  <div
    className="export-sidebar panel glass"
    onPointerDown={(event) => {
      if (isRecording && event.target.closest('button')) onRecordingExportAttempt();
    }}
  >
    <div className="export-sidebar-title">Export</div>
    {isRecording && (
      <div className="export-sidebar-hint" role="status" aria-live="polite">
        Finish or stop recording to enable exports.
      </div>
    )}
    <button
      className={`export-sidebar-btn export-sidebar-btn--timestamp${activeExport === 'timestamp' ? ' is-exporting' : ''}`}
      onClick={onExportTimestamp}
      disabled={Boolean(activeExport) || isRecording}
      aria-busy={activeExport === 'timestamp'}
    >
      {activeExport === 'timestamp' ? 'Preparing...' : 'Timestamp'}
    </button>
    <button
      className={`export-sidebar-btn export-sidebar-btn--individual${activeExport === 'individual' ? ' is-exporting' : ''}`}
      onClick={onExportIndividual}
      disabled={Boolean(activeExport) || isRecording}
      aria-busy={activeExport === 'individual'}
    >
      {activeExport === 'individual' ? 'Exporting...' : 'Individual Tasks'}
    </button>
    <button
      className={`export-sidebar-btn export-sidebar-btn--session${activeExport === 'session' ? ' is-exporting' : ''}`}
      onClick={onExportSession}
      disabled={Boolean(activeExport) || isRecording}
      aria-busy={activeExport === 'session'}
    >
      {activeExport === 'session' ? 'Exporting...' : 'Session'}
    </button>
    <button
      className={`export-sidebar-btn export-sidebar-btn--all${activeExport === 'all' ? ' is-exporting' : ''}`}
      onClick={onExportAll}
      disabled={Boolean(activeExport) || isRecording}
      aria-busy={activeExport === 'all'}
    >
      {activeExport === 'all' ? 'Exporting...' : 'All'}
    </button>
  </div>
);

export default ExportSidebar;
