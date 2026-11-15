import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import net from 'node:net';
const kind = process.argv[2];
const connect = (host, port) =>
  new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(2000, () => socket.destroy(Error('timeout')));
    socket.once('connect', () => {
      socket.end();
      resolve();
    });
    socket.once('error', reject);
  });
try {
  if (kind === 'worker' || kind === 'sandbox') {
    const heartbeat = Number(await readFile(`/tmp/${kind}-heartbeat`, 'utf8'));
    if (!Number.isFinite(heartbeat) || Date.now() - heartbeat > 15000)
      throw Error('heartbeat');
    if (kind === 'worker') {
      for (const variable of ['DATABASE_URL', 'REDIS_URL']) {
        const url = new URL(process.env[variable]);
        await connect(
          url.hostname,
          Number(url.port || (variable === 'REDIS_URL' ? 6379 : 5432)),
        );
      }
    } else {
      for (const path of ['/spool/commands', '/spool/results', '/media/temp'])
        await access(path);
      for (const bin of [
        '/opt/media/bin/yt-dlp',
        '/usr/bin/ffmpeg',
        '/usr/bin/ffprobe',
      ])
        await access(bin, constants.X_OK);
    }
  } else if (kind === 'gateway') await connect('127.0.0.1', 3128);
  else if (kind === 'api') {
    const r = await fetch('http://127.0.0.1:3000/api/health', {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) throw Error('dependency');
  } else throw Error('unknown');
} catch {
  console.error(JSON.stringify({ health: kind, status: 'unavailable' }));
  process.exitCode = 1;
}
