import { describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import { RedisSourceCooldown } from '../apps/api/src/infra/source-cooldown.js';

function setup() {
  let ttl = -2;

  const redis = {
    pttl: vi.fn(async () => ttl),
    set: vi.fn(async () => {
      if (ttl < 0) ttl = 60000;
      return 'OK';
    }),
  };

  return {
    cooldown: new RedisSourceCooldown(redis as unknown as Redis),
    redis,
    setTtl(value: number) {
      ttl = value;
    },
  };
}

describe('RedisSourceCooldown', () => {
  it('ativa o cooldown do YouTube', async () => {
    const { cooldown, redis } = setup();

    expect(await cooldown.remaining('www.youtube.com')).toBe(0);
    expect(await cooldown.activate('www.youtube.com')).toBe(60);

    expect(redis.set).toHaveBeenCalledWith(
      'videoflow:source-cooldown:youtube',
      'rate-limited',
      'EX',
      60,
      'NX',
    );
  });

  it('compartilha cooldown entre youtube.com e youtu.be', async () => {
    const { cooldown } = setup();

    await cooldown.activate('youtube.com');

    expect(await cooldown.remaining('youtu.be')).toBe(60);
    expect(await cooldown.remaining('m.youtube.com')).toBe(60);
  });

  it('nao bloqueia Instagram', async () => {
    const { cooldown, redis } = setup();

    expect(await cooldown.remaining('www.instagram.com')).toBe(0);
    expect(await cooldown.activate('www.instagram.com')).toBe(0);

    expect(redis.set).not.toHaveBeenCalled();
  });

  it('retorna o tempo restante arredondado para cima', async () => {
    const { cooldown, setTtl } = setup();

    setTtl(14500);

    expect(await cooldown.remaining('youtube.com')).toBe(15);
  });

  it('libera a fonte quando a chave expira', async () => {
    const { cooldown, setTtl } = setup();

    setTtl(-2);

    expect(await cooldown.remaining('youtube.com')).toBe(0);
  });

  it('falha de forma segura se o Redis estiver indisponivel', async () => {
    const { cooldown, redis } = setup();

    redis.pttl.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(cooldown.remaining('youtube.com')).rejects.toMatchObject({
      statusCode: 503,
      code: 'SOURCE_COOLDOWN_UNAVAILABLE',
    });
  });
});
