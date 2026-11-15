import http from 'node:http';
import net from 'node:net';
import { resolveSource } from '@videoflow/shared/security';
export type Destination = { host: string; port: number; hostname: string };
export type Policy = (url: string) => Promise<Destination>;
export const publicPolicy =
  (allowlist: string[] = []): Policy =>
  async (input) => {
    const resolved = await resolveSource(input, allowlist);
    return {
      host: resolved.addresses[0]!.address,
      hostname: resolved.hostname,
      port: Number(
        resolved.url.port || (resolved.url.protocol === 'https:' ? 443 : 80),
      ),
    };
  };
/** Policy is injectable for adversarial tests; production main always uses publicPolicy. */
export function gateway(policy: Policy, byteLimit = 2 * 1024 ** 3) {
  const budgets = new Map<
    string,
    { bytes: number; expires: number; blocked?: boolean }
  >();
  async function destinationFor(url: string, header: string | undefined) {
    meter(header);
    try {
      return await policy(url);
    } catch (error) {
      const id = Buffer.from(header!.slice(6), 'base64')
        .toString()
        .split(':')[0]!;
      budgets.get(id)!.blocked = true;
      throw error;
    }
  }
  function meter(header: string | undefined) {
    const value = header?.startsWith('Basic ')
      ? Buffer.from(header.slice(6), 'base64').toString()
      : '';
    const id = value.split(':')[0] ?? '';
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('CAPABILITY_REQUIRED');
    const now = Date.now();
    for (const [key, item] of budgets)
      if (item.expires < now) budgets.delete(key);
    if (!budgets.has(id)) {
      if (budgets.size >= 1000) throw new Error('CAPACITY');
      budgets.set(id, { bytes: 0, expires: now + 1800000 });
    }
    const budget = budgets.get(id)!;
    return (count: number) => {
      budget.bytes += count;
      if (budget.bytes > byteLimit) throw new Error('INPUT_LIMIT');
    };
  }
  const server = http.createServer(async (req, res) => {
    try {
      const statusMatch = /^\/operations\/([a-f0-9-]{36})$/.exec(req.url ?? '');
      if (statusMatch) {
        const supplied = req.headers['proxy-authorization'];
        const value = supplied?.startsWith('Basic ')
          ? (Buffer.from(supplied.slice(6), 'base64')
              .toString()
              .split(':')[0] ?? '')
          : '';
        if (req.method !== 'GET' || value !== statusMatch[1])
          throw new Error('CAPABILITY_REQUIRED');
        res.writeHead(200, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        });
        res.end(
          JSON.stringify({
            exceeded: (budgets.get(value)?.bytes ?? 0) > byteLimit,
            blocked: budgets.get(value)?.blocked === true,
          }),
        );
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD')
        throw new Error('METHOD');
      const input = req.url ?? '';
      const url = new URL(input);
      if (url.protocol !== 'http:') throw new Error('PROTOCOL');
      const destination = await destinationFor(
        input,
        req.headers['proxy-authorization'],
      );
      const count = meter(req.headers['proxy-authorization']);
      const headers: Record<string, string> = { host: url.host };
      for (const name of [
        'user-agent',
        'accept',
        'accept-language',
        'range',
        'if-range',
      ]) {
        const value = req.headers[name];
        if (typeof value === 'string') headers[name] = value;
      }
      const upstream = http.request(
        {
          hostname: destination.host,
          port: destination.port,
          method: req.method,
          path: url.pathname + url.search,
          headers,
          agent: false,
        },
        (remote) => {
          const safeHeaders = { ...remote.headers };
          for (const key of [
            'set-cookie',
            'connection',
            'transfer-encoding',
            'proxy-authenticate',
          ])
            delete safeHeaders[key];
          res.writeHead(remote.statusCode ?? 502, safeHeaders);
          remote.on('data', (chunk: Buffer) => {
            try {
              count(chunk.length);
            } catch {
              remote.destroy();
              res.destroy();
            }
          });
          remote.on('error', () => res.destroy());
          remote.pipe(res);
        },
      );
      upstream.setTimeout(10000, () => upstream.destroy());
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      res.on('close', () => upstream.destroy());
      upstream.end();
    } catch {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('SOURCE_BLOCKED');
    }
  });
  server.on('connect', async (req, client, head) => {
    try {
      if (head.length) throw new Error('EARLY_DATA');
      const authority = req.url ?? '';
      if (!/^(?:\[[a-fA-F0-9:]+\]|[a-zA-Z0-9.-]+):443$/.test(authority))
        throw new Error('AUTHORITY');
      const destination = await destinationFor(
        `https://${authority}/`,
        req.headers['proxy-authorization'],
      );
      const count = meter(req.headers['proxy-authorization']);
      const upstream = net.connect({
        host: destination.host,
        port: destination.port,
      });
      const connectTimeout = setTimeout(() => upstream.destroy(), 10000);
      upstream.once('connect', () => {
        clearTimeout(connectTimeout);
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        client.pipe(upstream);
        upstream.pipe(client);
      });
      upstream.on('data', (chunk: Buffer) => {
        try {
          count(chunk.length);
        } catch {
          upstream.destroy();
          client.destroy();
        }
      });
      upstream.setTimeout(30000, () => upstream.destroy());
      (client as net.Socket).setTimeout(30000, () => client.destroy());
      upstream.on('error', () => client.destroy());
      client.on('error', () => upstream.destroy());
      client.on('close', () => {
        clearTimeout(connectTimeout);
        upstream.destroy();
      });
      upstream.on('close', () => client.destroy());
    } catch {
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    }
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 30000;
  server.maxHeadersCount = 50;
  return server;
}
