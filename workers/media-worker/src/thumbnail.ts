import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { writeFile } from 'node:fs/promises';
import { parseSourceUrl } from '@videoflow/shared/security';
import { MediaError } from './supervisor.js';
function signature(bytes: Buffer) {
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
    return 'image/jpeg';
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP'
  )
    return 'image/webp';
  return null;
}
export async function thumbnail(
  input: string,
  proxyInput: string,
  target: string,
  signal: AbortSignal,
  redirects = 0,
): Promise<string> {
  if (redirects > 3) throw new MediaError('THUMBNAIL_UNAVAILABLE');
  const url = parseSourceUrl(input);
  const proxy = new URL(proxyInput);
  const auth = `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')}`;
  const response = await new Promise<http.IncomingMessage>(
    (resolve, reject) => {
      const fail = () => reject(new MediaError('THUMBNAIL_UNAVAILABLE'));
      if (url.protocol === 'http:') {
        const req = http.get(
          {
            host: proxy.hostname,
            port: Number(proxy.port),
            path: url.toString(),
            headers: { 'proxy-authorization': auth },
            signal,
          },
          resolve,
        );
        req.setTimeout(5000, () => req.destroy());
        req.on('error', fail);
      } else {
        const tunnel = http.request({
          host: proxy.hostname,
          port: Number(proxy.port),
          method: 'CONNECT',
          path: `${url.hostname}:443`,
          headers: { 'proxy-authorization': auth },
          signal,
        });
        tunnel.setTimeout(5000, () => tunnel.destroy());
        tunnel.on('error', fail);
        tunnel.on('connect', (res, socket) => {
          if (res.statusCode !== 200) {
            socket.destroy();
            fail();
            return;
          }
          const secure = tls.connect({
            socket,
            servername: url.hostname,
            rejectUnauthorized: true,
          });
          const req = https.get(
            {
              hostname: url.hostname,
              path: url.pathname + url.search,
              agent: false,
              createConnection: () => secure,
              signal,
            },
            resolve,
          );
          req.setTimeout(5000, () => req.destroy());
          req.on('error', () => {
            secure.destroy();
            fail();
          });
        });
        tunnel.end();
      }
    },
  );
  if (
    [301, 302, 303, 307, 308].includes(response.statusCode ?? 0) &&
    response.headers.location
  ) {
    response.destroy();
    return thumbnail(
      new URL(response.headers.location, url).toString(),
      proxyInput,
      target,
      signal,
      redirects + 1,
    );
  }
  const mime = (response.headers['content-type'] ?? '').split(';')[0];
  if (
    response.statusCode !== 200 ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(mime ?? '')
  ) {
    response.destroy();
    throw new MediaError('THUMBNAIL_UNAVAILABLE');
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for await (const chunk of response) {
      const buffer = chunk as Buffer;
      bytes += buffer.length;
      if (bytes > 2097152) {
        response.destroy();
        throw new MediaError('THUMBNAIL_UNAVAILABLE');
      }
      chunks.push(buffer);
    }
  } catch {
    throw new MediaError('THUMBNAIL_UNAVAILABLE');
  }
  const body = Buffer.concat(chunks);
  if (signature(body) !== mime) throw new MediaError('THUMBNAIL_UNAVAILABLE');
  await writeFile(target, body, { flag: 'wx', mode: 0o600 });
  return mime!;
}
