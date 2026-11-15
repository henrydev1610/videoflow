import assert from 'node:assert/strict';
const base = process.env.PROBE_ORIGIN ?? 'http://videoflow-proxy:8080';
const ui = await fetch(base + '/history');
assert.equal(ui.status, 200);
assert.match(await ui.text(), /<div id="root"><\/div>/);
assert.equal(ui.headers.get('x-content-type-options'), 'nosniff');
assert.equal(ui.headers.get('x-frame-options'), 'DENY');
assert.match(
  ui.headers.get('content-security-policy') ?? '',
  /frame-ancestors 'none'/,
);
const html = await (await fetch(base)).text();
const asset = /src="(\/assets\/[^\"]+\.js)"/.exec(html)?.[1];
assert.ok(asset);
const resource = await fetch(base + asset);
assert.equal(resource.status, 200);
assert.match(resource.headers.get('cache-control') ?? '', /immutable/);
assert.equal((await fetch(base + '/assets/missing.js')).status, 404);
assert.equal((await fetch(base + '/api/health')).status, 200);
let limited = false;
for (let n = 0; n < 11; n++) {
  const response = await fetch(base + '/api/context', {
    method: 'POST',
    headers: {
      origin: base,
      'content-type': 'application/json',
      'x-forwarded-for': `203.0.113.${n + 1}`,
      forwarded: `for=198.51.100.${n + 1}`,
    },
    body: '{}',
  });
  if (response.status === 429) {
    assert.equal(response.headers.get('retry-after'), '60');
    limited = true;
    break;
  }
  assert.equal(response.status, 201);
}
assert.ok(limited, 'Forged forwarding headers must not evade rate limits');
const oversized = await fetch(base + '/api/context', {
  method: 'POST',
  headers: { origin: base, 'content-type': 'application/json' },
  body: JSON.stringify({ payload: 'x'.repeat(20000) }),
});
assert.equal(oversized.status, 413);
assert.equal((await oversized.json()).error.code, 'BODY_TOO_LARGE');
const burst = await Promise.all(
  Array.from({ length: 45 }, () => fetch(base + '/api/health')),
);
const proxyLimited = burst.filter((response) => response.status === 429);
assert.ok(proxyLimited.length > 0);
for (const response of proxyLimited) {
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await response.json()).error.requestId, 'proxy');
}
console.log(
  JSON.stringify({
    spa: true,
    staticCache: true,
    headers: true,
    health: true,
    spoofingRejected: true,
    bodyLimit: true,
    proxyRateLimit: true,
  }),
);
