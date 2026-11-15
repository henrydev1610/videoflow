import { it, expect } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { gateway } from '../workers/media-worker/src/gateway.js';
it.skipIf(process.platform !== 'linux')(
  'CONNECT fixa IP aprovado sem substituir validação TLS do hostname',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'videoflow-tls-'));
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=fixture.invalid',
        '-addext',
        'subjectAltName=DNS:fixture.invalid',
        '-keyout',
        join(directory, 'key.pem'),
        '-out',
        join(directory, 'cert.pem'),
      ],
      { stdio: 'ignore' },
    );
    const cert = await readFile(join(directory, 'cert.pem'));
    const source = https.createServer(
      { cert, key: await readFile(join(directory, 'key.pem')) },
      (_, res) => res.end('authorized'),
    );
    await new Promise<void>((resolve) =>
      source.listen(0, '127.0.0.1', resolve),
    );
    const sourcePort = (source.address() as net.AddressInfo).port;
    const proxy = gateway(async () => ({
      host: '127.0.0.1',
      port: sourcePort,
      hostname: 'fixture.invalid',
    }));
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const port = (proxy.address() as net.AddressInfo).port;
    async function handshake(servername: string) {
      return new Promise<boolean>((resolve, reject) => {
        const req = http.request({
          host: '127.0.0.1',
          port,
          method: 'CONNECT',
          path: 'fixture.invalid:443',
          headers: {
            'proxy-authorization': `Basic ${Buffer.from(randomUUID() + ':spool').toString('base64')}`,
          },
        });
        req.on('connect', (response, socket) => {
          if (response.statusCode !== 200) {
            socket.destroy();
            reject(Error('tunnel failed'));
            return;
          }
          const secure = tls.connect({ socket, servername, ca: cert });
          secure.on('secureConnect', () => {
            secure.destroy();
            resolve(true);
          });
          secure.on('error', () => {
            secure.destroy();
            resolve(false);
          });
        });
        req.on('error', reject);
        req.end();
      });
    }
    try {
      expect(await handshake('fixture.invalid')).toBe(true);
      expect(await handshake('attacker.invalid')).toBe(false);
    } finally {
      source.closeAllConnections();
      await Promise.all([
        new Promise<void>((r) => proxy.close(() => r())),
        new Promise<void>((r) => source.close(() => r())),
      ]);
      await rm(directory, { recursive: true, force: true });
    }
  },
  15000,
);
