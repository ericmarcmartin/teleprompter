const SavedRecordingsList = ({ recordings, playingRecordingId, onPlayRecording }) => (
  <div className="saved-recordings">
    <div className="saved-recordings-header">Saved recordings — {recordings.length} task{recordings.length !== 1 ? 's' : ''}</div>
    {recordings.map((recording) => {
      const entry = recording.transcript?.[0];
      const duration = entry?.start && entry?.end
        ? `${entry.start} → ${entry.end}`
        : null;
      const isPlaying = playingRecordingId === recording.id;

      return (
        <div
          key={recording.id}
          className={`saved-recording-item${isPlaying ? ' playing' : ''}`}
          onClick={() => onPlayRecording(recording)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onPlayRecording(recording);
            }
          }}
          aria-label={`${isPlaying ? 'Pause' : 'Play'} Task ${recording.promptIndex}`}
        >
          <div className="saved-recording-main">
            <span>{recording.taskId} — Task {recording.promptIndex}</span>
            <small>{entry?.text ?? '—'}{duration ? ` • ${duration}` : ''}</small>
          </div>
          <div className="saved-recording-actions">
            <button
              type="button"
              className={`saved-recording-play-btn${isPlaying ? ' playing' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                onPlayRecording(recording);
              }}
              aria-label={`${isPlaying ? 'Pause' : 'Play'} Task ${recording.promptIndex}`}
              title={`${isPlaying ? 'Pause' : 'Play'} recording`}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
          </div>
        </div>
      );
    })}
  </div>
);

export default SavedRecordingsList;
