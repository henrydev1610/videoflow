import { it, expect } from 'vitest';
import { downloadProgress } from '../workers/media-worker/src/download-progress.js';
it('buffers split records, throttles, marks unknown totals and never regresses or completes', () => {
  let now = 0;
  const events: unknown[] = [];
  const receive = downloadProgress(
    (...event) => events.push(event),
    () => now,
  );
  receive('ignored private diagnostic\nVF_PROGRESS:50/');
  receive('100\nVF_PROGRESS:90/100\n');
  now = 1000;
  receive('VF_PROGRESS:51/NA\n');
  now = 2000;
  receive('VF_PROGRESS:1/100\n');
  now = 3000;
  receive('VF_PROGRESS:200/100\n');
  expect(events).toEqual([
    [34, false],
    [34, true],
    [34, false],
    [69, false],
  ]);
});
