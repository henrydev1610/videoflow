import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  defaults,
  readPreferences,
  preferenceKey,
} from '../apps/web/src/lib/preferences.js';
import {
  bytes,
  pollInterval,
  validMediaUrl,
  request,
  contextLost,
} from '../apps/web/src/lib/api.js';
import { z } from 'zod';
afterEach(() => vi.unstubAllGlobals());
describe('contratos e preferências web', () => {
  it('restaura padrões para corrupção, versão desconhecida e armazenamento bloqueado', () => {
    for (const value of [
      '{',
      '{"version":9}',
      JSON.stringify({ ...defaults, quality: 'ultra' }),
    ])
      expect(readPreferences({ getItem: () => value })).toEqual(defaults);
    expect(
      readPreferences({
        getItem: () => {
          throw Error('blocked');
        },
      }),
    ).toEqual(defaults);
    expect(
      readPreferences({
        getItem: (key) =>
          key === preferenceKey
            ? JSON.stringify({ ...defaults, theme: 'dark', format: 'mp3' })
            : null,
      }),
    ).toMatchObject({ theme: 'dark', format: 'mp3' });
  });
  it('formata bigint sem perda e valida URLs antes da inspeção', () => {
    expect(bytes('9007199254740993')).toContain('GB');
    expect(bytes(null)).toBe('Não informado');
    expect(bytes('1024')).toBe('1 KB');
    for (const url of [
      'file:///tmp/x',
      'https://u:p@a.com',
      'invalid',
      'https://a.com:22',
    ])
      expect(validMediaUrl(url)).toBe(false);
    expect(validMediaUrl('https://example.com/video')).toBe(true);
  });
  it('só consulta a cada dois segundos com ativos e aba visível', () => {
    expect(pollInterval(true, true)).toBe(2000);
    expect(pollInterval(true, false)).toBe(false);
    expect(pollInterval(false, true)).toBe(false);
  });
  it('preserva credenciais same-origin, valida resposta e sinaliza perda de contexto', async () => {
    const lost = vi.fn();
    contextLost.addEventListener('lost', lost);
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          code: 'CONTEXT_REQUIRED',
          message: 'Novo contexto',
          requestId: 'test',
        },
      }),
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(request('/downloads', z.unknown())).rejects.toMatchObject({
      code: 'CONTEXT_REQUIRED',
    });
    expect(lost).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'same-origin',
      cache: 'no-store',
    });
    contextLost.removeEventListener('lost', lost);
  });
});

it('descarta resposta atrasada depois da perda de contexto', async () => {
  let resolve!: (value: unknown) => void;
  vi.stubGlobal(
    'fetch',
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = request('/downloads', z.unknown());
  contextLost.dispatchEvent(new Event('lost'));
  resolve({ ok: true, json: async () => ({ private: 'old' }) });
  await expect(pending).rejects.toMatchObject({ code: 'CONTEXT_REQUIRED' });
});
