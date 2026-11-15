import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
const headers: Record<string, string> = {
  origin: process.env.ORIGIN ?? 'http://localhost:8080',
  'content-type': 'application/json',
};
const context = await fetch('http://api:3000/api/context', {
  method: 'POST',
  headers,
  body: '{}',
});
assert.equal(context.status, 201);
headers.cookie = context.headers.get('set-cookie')!.split(';')[0]!;
const inspect = await fetch('http://api:3000/api/media/inspect', {
  method: 'POST',
  headers,
  body: JSON.stringify({ url: 'http://fixture/video.mp4' }),
});
assert.equal(inspect.status, 200);
const info = (await inspect.json()) as { data: { inspectionId: string } };
const created = await fetch('http://api:3000/api/downloads', {
  method: 'POST',
  headers: { ...headers, 'idempotency-key': randomUUID() },
  body: JSON.stringify({
    inspectionId: info.data.inspectionId,
    format: 'mp4',
    quality: 'low',
    rightsConfirmed: true,
  }),
});
assert.equal(created.status, 202);
const job = (await created.json()) as { data: { id: string } };
console.log(JSON.stringify({ jobId: job.data.id, readyForRestart: true }));
const deadline = Date.now() + 120000;
let down = false;
while (Date.now() < deadline) {
  try {
    const health = await fetch('http://api:3000/api/health', {
      signal: AbortSignal.timeout(500),
    });
    if (down && health.ok) break;
  } catch {
    down = true;
  }
  await delay(100);
}
assert.ok(down, 'API outage was not observed');
const recovered = await fetch(`http://api:3000/api/downloads/${job.data.id}`, {
  headers,
});
assert.equal(recovered.status, 200);
const data = (await recovered.json()) as {
  data: { id: string; status: string };
};
assert.equal(data.data.id, job.data.id);
console.log(
  JSON.stringify({
    jobId: job.data.id,
    persistedAfterContainerRestart: true,
    status: data.data.status,
  }),
);
