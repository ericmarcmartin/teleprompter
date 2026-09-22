import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeSavedRecordings, shouldKeepRecordingChunk } from './recordings.js';

test('keeps only the latest audio per prompt index and preserves order', () => {
  const previous = [
    { taskId: 'TASK-1001', promptIndex: 1, id: 'a-1' },
    { taskId: 'TASK-1001', promptIndex: 2, id: 'a-2' },
  ];

  const incoming = [
    { taskId: 'TASK-1001', promptIndex: 2, id: 'b-2' },
    { taskId: 'TASK-1001', promptIndex: 5, id: 'b-5' },
  ];

  const merged = mergeSavedRecordings(previous, incoming);

  assert.equal(merged.length, 3);
  assert.deepEqual(merged.map((item) => item.promptIndex), [1, 2, 5]);
  assert.equal(merged[1].id, 'b-2');
});

test('stops mid-task without creating a partial saved recording', () => {
  const previous = [
    { taskId: 'TASK-1001', promptIndex: 1, id: 'a-1' },
    { taskId: 'TASK-1001', promptIndex: 2, id: 'a-2' },
  ];

  const incoming = [
    { taskId: 'TASK-1001', promptIndex: 3, id: 'partial' },
  ];

  const merged = mergeSavedRecordings(previous, incoming);

  assert.equal(merged.length, 3);
  assert.equal(merged[2].id, 'partial');
});

test('keeps a non-empty partial prompt when recording is stopped manually', () => {
  assert.equal(shouldKeepRecordingChunk({ stopRequested: true, promptIndex: 9, totalPrompts: 200 }), true);
});

test('keeps the final prompt audio when the recording is being stopped at the end', () => {
  assert.equal(shouldKeepRecordingChunk({ stopRequested: true, promptIndex: 10, totalPrompts: 10 }), true);
  assert.equal(shouldKeepRecordingChunk({ stopRequested: false, promptIndex: 10, totalPrompts: 10 }), true);
});
