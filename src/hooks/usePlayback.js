import { useRef, useState } from 'react';

// Playback of saved recordings (list items) and the preview audio element.
// Independent of the recording session — operates on audio URLs passed in.
export const usePlayback = () => {
  const [playingRecordingId, setPlayingRecordingId] = useState(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  const playbackAudioRef = useRef(null);
  const playingIdRef = useRef(null);
  const previewAudioRef = useRef(null);

  const stopPlaybackAudio = () => {
    if (playbackAudioRef.current) {
      playbackAudioRef.current.onended = null;
      playbackAudioRef.current.pause();
      playbackAudioRef.current.src = '';
      playbackAudioRef.current = null;
    }

    if (playingIdRef.current) {
      playingIdRef.current = null;
      setPlayingRecordingId(null);
    }
  };

  const handlePlayRecording = (recording) => {
    if (playingIdRef.current === recording.id) {
      stopPlaybackAudio();
      return;
    }

    stopPlaybackAudio();

    const audio = new Audio(recording.audioUrl);
    playbackAudioRef.current = audio;
    playingIdRef.current = recording.id;
    setPlayingRecordingId(recording.id);

    audio.onended = () => stopPlaybackAudio();
    audio.play().catch(() => stopPlaybackAudio());
  };

  const handleTogglePreview = (audioUrl) => {
    if (!audioUrl || !previewAudioRef.current) return;

    if (isPlayingPreview) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      previewAudioRef.current.play();
      setIsPlayingPreview(true);
    }
  };

  return {
    playingRecordingId,
    isPlayingPreview,
    setIsPlayingPreview,
    previewAudioRef,
    stopPlaybackAudio,
    handlePlayRecording,
    handleTogglePreview,
  };
};
