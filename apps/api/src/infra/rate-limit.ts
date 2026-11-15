import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { AppError } from '../common/errors.js';
const script = `local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return {n, redis.call('PTTL', KEYS[1])}`;
export interface RateLimiter {
  consume(ip: string, bucket: 'read' | 'inspect' | 'mutation'): Promise<void>;
}
export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: Redis) {}
  async consume(ip: string, bucket: 'read' | 'inspect' | 'mutation') {
    let result: unknown;
    try {
      result = await this.redis.eval(
        script,
        1,
        `videoflow:rate:${bucket}:${createHash('sha256').update(ip).digest('hex')}`,
        60000,
      );
    } catch {
      throw new AppError(
        503,
        'RATE_LIMIT_UNAVAILABLE',
        'Controle de capacidade temporariamente indisponível.',
      );
    }
    const count = Array.isArray(result) ? Number(result[0]) : NaN;
    if (!Number.isFinite(count))
      throw new AppError(
        503,
        'RATE_LIMIT_UNAVAILABLE',
        'Controle de capacidade temporariamente indisponível.',
      );
    if (count > (bucket === 'read' ? 120 : 10))
      throw new AppError(
        429,
        'RATE_LIMITED',
        'Limite de requisições atingido. Tente novamente em um minuto.',
      );
  }
}
