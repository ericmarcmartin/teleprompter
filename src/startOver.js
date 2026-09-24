// Core Start Over behavior. Keep this sequence unchanged unless the product
// owner explicitly approves a change and the unchangeable-logic tests change.
export const resetAppForStartOver = ({ playback, session, setPageHistory, setCanGoForward, setForwardPage, history }) => {
  playback.stopPlaybackAudio();
  if (playback.previewAudioRef.current) {
    playback.previewAudioRef.current.pause();
    playback.previewAudioRef.current.src = '';
  }

  playback.setIsPlayingPreview(false);
  session.setIsStopped(false);
  setPageHistory([]);
  setCanGoForward(false);
  setForwardPage(null);

  session.teardownRecorderAndStream();
  session.clearWaveform();
  session.resetRecordingState({ clearSavedRecordings: true });
  session.setStatus('Microphone ready. Press Record to begin.');
  history.replaceState({}, '', '/recording-collection-software');
};