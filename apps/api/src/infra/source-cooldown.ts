import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { AppError } from '../common/errors.js';

const COOLDOWN_SECONDS = 60;

export interface InspectionReservation {
  acquired: boolean;
  token?: string;
  retryAfter: number;
}

export interface SourceCooldown {
  remaining(source: string): Promise<number>;
  activate(source: string): Promise<number>;
  acquireInspection(source: string): Promise<InspectionReservation>;
  releaseInspection(source: string, token: string): Promise<void>;
}

export class RedisSourceCooldown implements SourceCooldown {
  constructor(private readonly redis: Redis) {}

  private key(source: string): string {
    const hostname = source.toLowerCase();

    const isYoutube =
      hostname === 'youtube.com' ||
      hostname.endsWith('.youtube.com') ||
      hostname === 'youtu.be' ||
      hostname.endsWith('.youtu.be');

    if (!isYoutube) return '';

    return 'videoflow:source-cooldown:youtube';
  }

  async remaining(source: string): Promise<number> {
    const key = this.key(source);

    if (!key) return 0;

    try {
      const ttl = await this.redis.pttl(key);
      return ttl > 0 ? Math.ceil(ttl / 1000) : 0;
    } catch {
      throw new AppError(
        503,
        'SOURCE_COOLDOWN_UNAVAILABLE',
        'Controle de disponibilidade temporariamente indisponivel.',
      );
    }
  }

  async activate(source: string): Promise<number> {
    const key = this.key(source);

    if (!key) return 0;

    try {
      await this.redis.set(key, 'rate-limited', 'EX', COOLDOWN_SECONDS, 'NX');

      return await this.remaining(source);
    } catch {
      throw new AppError(
        503,
        'SOURCE_COOLDOWN_UNAVAILABLE',
        'Nao foi possivel registrar a restricao temporaria.',
      );
    }
  }

  async acquireInspection(source: string): Promise<InspectionReservation> {
    const key = this.key(source);

    if (!key) {
      return { acquired: true, retryAfter: 0 };
    }

    const token = randomUUID();
    const reservationKey = `${key}:inspection`;

    const script = `
      local cooldown = redis.call('PTTL', KEYS[1])
      if cooldown > 0 then
        return {0, cooldown}
      end

      local existing = redis.call('PTTL', KEYS[2])
      if existing > 0 then
        return {0, existing}
      end

      local acquired = redis.call(
        'SET', KEYS[2], ARGV[1], 'PX', ARGV[2], 'NX'
      )

      if acquired then
        return {1, 0}
      end

      return {0, math.max(1, redis.call('PTTL', KEYS[2]))}
    `;

    try {
      const result = await this.redis.eval(
        script,
        2,
        key,
        reservationKey,
        token,
        90000,
      );

      if (!Array.isArray(result) || result.length !== 2) {
        throw new Error('INVALID_RESERVATION_RESPONSE');
      }

      const acquired = Number(result[0]) === 1;
      const ttl = Number(result[1]);

      if (!Number.isFinite(ttl)) {
        throw new Error('INVALID_RESERVATION_TTL');
      }

      return {
        acquired,
        token: acquired ? token : undefined,
        retryAfter: acquired ? 0 : Math.max(1, Math.ceil(ttl / 1000)),
      };
    } catch {
      throw new AppError(
        503,
        'SOURCE_COOLDOWN_UNAVAILABLE',
        'Controle de concorrencia temporariamente indisponivel.',
      );
    }
  }

  async releaseInspection(source: string, token: string): Promise<void> {
    const key = this.key(source);

    if (!key) return;

    const reservationKey = `${key}:inspection`;

    const script = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      end
      return 0
    `;

    try {
      await this.redis.eval(script, 1, reservationKey, token);
    } catch {
      throw new AppError(
        503,
        'SOURCE_COOLDOWN_UNAVAILABLE',
        'Nao foi possivel liberar a reserva.',
      );
    }
  }
}
