import { describe, it, expect } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { gateway, publicPolicy } from '../workers/media-worker/src/gateway.js';
import { normalizeMetadata } from '../workers/media-worker/src/metadata.js';
const listen = (server: http.Server) =>
  new Promise<number>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve((server.address() as net.AddressInfo).port),
    ),
  );
const close = (server: http.Server) =>
  new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => (error ? reject(error) : resolve()));
  });
function request(port: number, url: string, operation = randomUUID()) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port,
        path: url,
        headers: {
          'proxy-authorization': `Basic ${Buffer.from(operation + ':spool').toString('base64')}`,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode!, body }));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
  });
}
describe('gateway e metadados', () => {
  it('nega destinos internos sem conectar', async () => {
    const server = gateway(publicPolicy());
    const port = await listen(server);
    try {
      for (const url of [
        'http://127.0.0.1/',
        'http://169.254.169.254/',
        'http://[::1]/',
        'http://host.docker.internal/',
        'http://10.0.0.1/',
        'http://example.com:22/',
      ])
        expect((await request(port, url)).status).toBe(403);
    } finally {
      await close(server);
    }
  });
  it('usa somente destino aprovado e soma bytes entre requisições', async () => {
    const source = http.createServer((_req, res) => {
      res.write('123');
      res.end('456');
    });
    const sourcePort = await listen(source);
    let calls = 0;
    const server = gateway(async () => {
      calls++;
      return {
        host: '127.0.0.1',
        port: sourcePort,
        hostname: 'fixture.invalid',
      };
    }, 10);
    const port = await listen(server);
    try {
      const id = randomUUID();
      expect((await request(port, 'http://fixture.invalid/', id)).body).toBe(
        '123456',
      );
      await expect(
        request(port, 'http://fixture.invalid/', id),
      ).rejects.toThrow();
      expect(calls).toBe(2);
    } finally {
      await close(server);
      await close(source);
    }
  });
  it('valida cada destino de redirect e recusa CONNECT privado', async () => {
    const server = gateway(publicPolicy());
    const port = await listen(server);
    try {
      const response = await new Promise<string>((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1', () =>
          socket.write(
            'CONNECT 127.0.0.1:443 HTTP/1.1\r\nHost: 127.0.0.1:443\r\n\r\n',
          ),
        );
        let output = '';
        socket.on('data', (c) => (output += c));
        socket.on('end', () => resolve(output));
        socket.on('error', reject);
      });
      expect(response).toContain('403 Forbidden');
    } finally {
      await close(server);
    }
  });
  it('normaliza campos ausentes, áudio e fontes inelegíveis', () => {
    expect(normalizeMetadata({ acodec: 'aac', vcodec: 'none' })).toMatchObject({
      title: null,
      durationSeconds: null,
      thumbnail: null,
      availableFormats: ['mp3'],
    });
    for (const [patch, code] of [
      [{ entries: [] }, 'PLAYLIST_UNSUPPORTED'],
      [{ is_live: true }, 'LIVE_UNSUPPORTED'],
      [{ has_drm: true }, 'SOURCE_UNAVAILABLE'],
      [{ availability: 'needs_auth' }, 'SOURCE_UNAVAILABLE'],
      [{ duration: 7201 }, 'DURATION_LIMIT'],
    ] as const)
      expect(() => normalizeMetadata({ acodec: 'aac', ...patch })).toThrow(
        code,
      );
    expect(() => normalizeMetadata({ vcodec: 'none', acodec: 'none' })).toThrow(
      'FORMAT_UNAVAILABLE',
    );
  });
});
