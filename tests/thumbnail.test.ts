import { describe, it, expect } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { gateway } from '../workers/media-worker/src/gateway.js';
import { thumbnail } from '../workers/media-worker/src/thumbnail.js';
describe('miniaturas via gateway', () => {
  it('valida assinatura, MIME, quota e destino de redirect', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vf-thumb-'));
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const origin = http.createServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { location: 'http://127.0.0.1/' });
        res.end();
        return;
      }
      res.setHeader(
        'content-type',
        req.url === '/svg' ? 'image/svg+xml' : 'image/png',
      );
      res.end(
        req.url === '/large'
          ? Buffer.alloc(2097153)
          : req.url === '/wrong'
            ? Buffer.from('<svg/>')
            : png,
      );
    });
    await new Promise<void>((resolve) =>
      origin.listen(0, '127.0.0.1', resolve),
    );
    const proxy = gateway(async (url) => {
      if (new URL(url).hostname !== 'fixture.invalid')
        throw new Error('blocked');
      return {
        host: '127.0.0.1',
        port: (origin.address() as AddressInfo).port,
        hostname: 'fixture.invalid',
      };
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const url = `http://${randomUUID()}:spool@127.0.0.1:${(proxy.address() as AddressInfo).port}`;
    try {
      expect(
        await thumbnail(
          'http://fixture.invalid/ok',
          url,
          join(root, 'ok'),
          new AbortController().signal,
        ),
      ).toBe('image/png');
      expect(await readFile(join(root, 'ok'))).toEqual(png);
      for (const path of ['svg', 'large', 'wrong', 'redirect'])
        await expect(
          thumbnail(
            `http://fixture.invalid/${path}`,
            url,
            join(root, path),
            new AbortController().signal,
          ),
        ).rejects.toThrow();
      await expect(
        thumbnail(
          'http://169.254.169.254/',
          url,
          join(root, 'private'),
          new AbortController().signal,
        ),
      ).rejects.toThrow();
    } finally {
      proxy.closeAllConnections();
      origin.closeAllConnections();
      await Promise.all([
        new Promise<void>((resolve) => proxy.close(() => resolve())),
        new Promise<void>((resolve) => origin.close(() => resolve())),
      ]);
      await rm(root, { recursive: true, force: true });
    }
  });
});
