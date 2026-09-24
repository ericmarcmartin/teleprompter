import { useRef } from 'react';

import { initialPromptSequence } from '../data/prompts.js';
import { shouldKeepRecordingChunk } from '../recordings.js';

// Owns the microphone stream and MediaRecorder lifecycle: one recorder per
// prompt, chunk collection, per-prompt blob storage, and mic mute/unmute
// during the inter-task gap. Session-level reactions (transcript, status,
// freeze-on-stop) are injected via deps.
export const useRecorder = ({
  setStatus,
  transcriptRef,
  isAudioSupported,
  onStreamReady,
  onPromptRecorded,
  onFinalPromptRecorded,
}) => {
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const stopRequestedRef = useRef(false);
  // Per-prompt recording storage: array of { promptIndex, blob, mimeType, entry }
  const perPromptRecordingsRef = useRef([]);
  // Blocks the tick from triggering another boundary crossing while a recorder
  // hand-off (stop old → start new) is in flight.
  const recorderReadyRef = useRef(true);

  // Starts a fresh MediaRecorder on the existing stream for the given prompt index.
  const startRecorderForPrompt = (promptIndex) => {
    if (!streamRef.current) return;

    const chunks = [];
    recordedChunksRef.current = chunks;

    let recorder;
    try {
      recorder = new MediaRecorder(streamRef.current);
      mediaRecorderRef.current = recorder;
    } catch (error) {
      recorderReadyRef.current = false;
      throw error;
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onstop = () => {
      const finishedChunks = [...chunks];
      const isFinalPrompt = promptIndex >= initialPromptSequence.length;
      const shouldSaveChunk = shouldKeepRecordingChunk({
        stopRequested: stopRequestedRef.current,
        promptIndex,
        totalPrompts: initialPromptSequence.length,
      });

      if (!shouldSaveChunk || finishedChunks.length === 0) {
        return;
      }

      const mimeType = recorder.mimeType || 'audio/webm';
      const entry = transcriptRef.current.find((e) => e.promptIndex === promptIndex) || null;
      perPromptRecordingsRef.current.push({
        promptIndex,
        blob: new Blob(finishedChunks, { type: mimeType }),
        mimeType,
        entry,
      });

      onPromptRecorded?.(promptIndex - 1);

      if (isFinalPrompt) {
        onFinalPromptRecorded();
      }
    };

    // 100ms timeslice: chunks flush throughout the prompt and the capture
    // timeline is anchored to the start() call, so the recorder aligns with
    // the session clock and progress bar.
    try {
      recorder.start(100);
      recorderReadyRef.current = true;
    } catch (error) {
      recorderReadyRef.current = false;
      mediaRecorderRef.current = null;
      throw error;
    }
  };

  const requestRecordingPermission = async () => {
    if (!isAudioSupported) return false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: 24000 },
          channelCount: 1,
        },
      });
      streamRef.current = stream;
      if (onStreamReady) onStreamReady(stream);
      setStatus('Microphone permission granted. Press Record to begin.');
      return true;
    } catch (error) {
      console.error('Unable to access microphone', error);
      setStatus('Microphone permission denied.');
      return false;
    }
  };

  // Mute/unmute the microphone during the 2s inter-task gap so no audio is
  // captured while the next task is being prepared.
  const setMicrophoneEnabled = (enabled) => {
    if (!streamRef.current) return;
    streamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  };

  const stopStream = () => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const teardownRecorderAndStream = () => {
    stopStream();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
  };

  return {
    streamRef,
    mediaRecorderRef,
    stopRequestedRef,
    perPromptRecordingsRef,
    recorderReadyRef,
    startRecorderForPrompt,
    requestRecordingPermission,
    setMicrophoneEnabled,
    stopStream,
    teardownRecorderAndStream,
  };
};
