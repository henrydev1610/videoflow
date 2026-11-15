import net from 'node:net';
import assert from 'node:assert/strict';
const connect = (host: string, port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 2000);
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
assert.equal(await connect('egress', 3128), true, 'gateway must be reachable');
for (const host of [
  'host.docker.internal',
  'postgres',
  'redis',
  'fixture',
  '1.1.1.1',
  ...process.argv.slice(2),
])
  for (const port of [80, 443, 5432, 6379]) {
    assert.equal(
      await connect(host, port),
      false,
      `direct access unexpectedly allowed: ${host}:${port}`,
    );
    console.log(JSON.stringify({ host, port, directConnection: 'blocked' }));
  }
