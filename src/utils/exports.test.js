import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTimestampTranscript } from './exports.js';

test('buildTimestampTranscript includes the header and per-task lines', () => {
  const recordings = [
    {
      taskId: 'TASK-1001',
      promptIndex: 1,
      transcript: [{ text: 'Hi Celia!', start: '00:00:00.000', end: '00:00:02.000' }],
    },
    { taskId: 'TASK-1001', promptIndex: 2, transcript: [] },
  ];

  const text = buildTimestampTranscript(recordings, 'TASK-1001');

  assert.ok(text.includes('TASK ID: TASK-1001'));
  assert.ok(text.includes('USER: Jarren Dave'));
  assert.ok(text.includes('[00:00:00.000 -> 00:00:02.000] Task 1: Hi Celia!'));
  assert.ok(text.includes('Task 2: Task 2'));
});

test('buildTimestampTranscript handles an empty session', () => {
  const text = buildTimestampTranscript([], 'TASK-0001');

  assert.ok(text.includes('TASK ID: TASK-0001'));
  assert.ok(text.endsWith('------------'));
});
