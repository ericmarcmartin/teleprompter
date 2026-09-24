import { audioBufferToWavBlob, mergeAudioBuffersToWav } from './wav.js';

let worker = null;
let nextRequestId = 1;
const pendingRequests = new Map();

const serializeAudioBuffer = (audioBuffer) => {
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, channel) => (
    new Float32Array(audioBuffer.getChannelData(channel))
  ));

  return {
    sampleRate: audioBuffer.sampleRate,
    numberOfChannels: audioBuffer.numberOfChannels,
    length: audioBuffer.length,
    channels,
  };
};

const getTransferables = (serializedBuffers) => serializedBuffers.flatMap(({ channels }) => (
  channels.map((channel) => channel.buffer)
));

const rejectPendingRequests = (error) => {
  for (const { reject } of pendingRequests.values()) reject(error);
  pendingRequests.clear();
  worker?.terminate();
  worker = null;
};

const getWorker = () => {
  if (!worker) {
    worker = new Worker(new URL('../workers/audioExport.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const request = pendingRequests.get(data.id);
      if (!request) return;
      pendingRequests.delete(data.id);
      if (data.error) {
        request.reject(new Error(data.error));
      } else {
        request.resolve(data.arrayBuffer ? new Blob([data.arrayBuffer], { type: 'audio/wav' }) : null);
      }
    };
    worker.onerror = () => rejectPendingRequests(new Error('Audio export worker failed.'));
  }
  return worker;
};

const runWorkerOperation = (operation, payload, serializedBuffers) => new Promise((resolve, reject) => {
  const id = nextRequestId;
  nextRequestId += 1;
  pendingRequests.set(id, { resolve, reject });
  try {
    getWorker().postMessage({ id, operation, ...payload }, getTransferables(serializedBuffers));
  } catch (error) {
    pendingRequests.delete(id);
    reject(error);
  }
});

export const encodeAudioBufferInWorker = async (audioBuffer) => {
  if (typeof Worker === 'undefined') return audioBufferToWavBlob(audioBuffer);
  const serialized = serializeAudioBuffer(audioBuffer);
  try {
    return await runWorkerOperation('encode', { buffer: serialized }, [serialized]);
  } catch (error) {
    console.error('Audio worker encoding failed; using main thread fallback.', error);
    return audioBufferToWavBlob(audioBuffer);
  }
};

export const mergeAudioBuffersInWorker = async (audioBuffers) => {
  if (!audioBuffers.length) return null;
  if (typeof Worker === 'undefined') return mergeAudioBuffersToWav(audioBuffers);
  const serializedBuffers = audioBuffers.map(serializeAudioBuffer);
  try {
    return await runWorkerOperation('merge', { buffers: serializedBuffers }, serializedBuffers);
  } catch (error) {
    console.error('Audio worker merge failed; using main thread fallback.', error);
    return mergeAudioBuffersToWav(audioBuffers);
  }
};