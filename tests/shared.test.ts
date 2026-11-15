import { describe, expect, it } from 'vitest';
import {
  canTransition,
  createDownloadSchema,
  jobSchema,
  listQuerySchema,
  statusSchema,
} from '../packages/shared/src/index.js';
import {
  isPublicAddress,
  parseSourceUrl,
  resolveSource,
} from '../packages/shared/src/security.js';
import { parseRange } from '../apps/api/src/infra/artifacts.js';

describe('contratos', () => {
  const input = {
    inspectionId: '51a0a451-5992-4e96-a2bc-bd1160de931b',
    format: 'mp4',
    quality: 'medium',
    rightsConfirmed: true,
  };
  it('aceita apenas opções válidas e confirmação de direitos', () => {
    expect(createDownloadSchema.parse(input)).toEqual(input);
    for (const patch of [
      { format: 'avi' },
      { quality: 'ultra' },
      { rightsConfirmed: false },
      { sourceUrl: 'file:///etc/passwd' },
      { inspectionId: '../x' },
    ])
      expect(
        createDownloadSchema.safeParse({ ...input, ...patch }).success,
      ).toBe(false);
  });
  it('limita paginação e ordenação', () => {
    expect(listQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20 });
    for (const query of [
      { page: 0 },
      { pageSize: 101 },
      { sort: 'sourceUrl:asc' },
      { q: 'a'.repeat(101) },
      { unknown: 'x' },
    ])
      expect(listQuerySchema.safeParse(query).success).toBe(false);
  });
  it('valida saída estrita, datas e bigint decimal', () => {
    const dto = {
      id: input.inspectionId,
      title: 'Mídia',
      source: 'example.com',
      format: 'mp4',
      quality: 'medium',
      status: 'PENDING',
      progress: 0,
      progressIndeterminate: true,
      createdAt: '2026-11-15T12:00:00.000Z',
      updatedAt: '2026-11-15T12:00:00.000Z',
      completedAt: null,
      fileSizeBytes: '9007199254740993',
      fileExpiresAt: null,
      historyExpiresAt: '2026-12-15T12:00:00.000Z',
      error: null,
      canRetry: false,
      attemptCount: 0,
    };
    expect(jobSchema.parse(dto).fileSizeBytes).toBe(dto.fileSizeBytes);
    for (const patch of [
      { tokenHash: 'secret' },
      { storageKey: '/etc/passwd' },
      { progress: 101 },
      { createdAt: 'ontem' },
      { fileSizeBytes: 2n },
    ])
      expect(jobSchema.safeParse({ ...dto, ...patch }).success).toBe(false);
  });
});
describe('estados', () => {
  const valid = new Set([
    'PENDING>DOWNLOADING',
    'PENDING>FAILED',
    'PENDING>CANCELLED',
    'DOWNLOADING>PROCESSING',
    'DOWNLOADING>FAILED',
    'DOWNLOADING>CANCELLED',
    'PROCESSING>COMPLETED',
    'PROCESSING>FAILED',
    'PROCESSING>CANCELLED',
    'COMPLETED>EXPIRED',
  ]);
  for (const from of statusSchema.options)
    for (const to of statusSchema.options)
      it(`${from} → ${to}`, () =>
        expect(canTransition(from, to)).toBe(valid.has(`${from}>${to}`)));
  it('retry e recuperação exigem causas explícitas', () => {
    expect(canTransition('FAILED', 'PENDING', 'retry')).toBe(true);
    expect(canTransition('DOWNLOADING', 'PENDING', 'recovery', true)).toBe(
      true,
    );
    expect(canTransition('DOWNLOADING', 'PENDING', 'recovery', false)).toBe(
      false,
    );
    expect(canTransition('COMPLETED', 'PENDING', 'recovery', true)).toBe(false);
  });
});
describe('política SSRF', () => {
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '192.168.0.1',
    '172.16.0.1',
    '169.254.169.254',
    '0.0.0.0',
    '100.64.0.1',
    '224.0.0.1',
    '192.0.2.1',
    '::1',
    '::',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '::ffff:8.8.8.8',
  ])
    it(`bloqueia ${ip}`, () => expect(isPublicAddress(ip)).toBe(false));
  it('aceita IP público', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
  });
  for (const url of [
    'file:///etc/passwd',
    'ftp://example.com',
    'https://u:p@example.com',
    'http://example.com:8080',
    'http://127.1',
    'http://2130706433',
    'http://[::1]',
    'http://host.docker.internal',
    'http://localhost.',
    'https://example.com\\@127.0.0.1',
  ])
    it(`nega ${url}`, () => expect(() => parseSourceUrl(url)).toThrow());
  it('allowlist exata não aceita subdomínio disfarçado', () =>
    expect(() =>
      parseSourceUrl('https://example.com.attacker.org', ['example.com']),
    ).toThrow());
  it('rejeita DNS misto e vazio', async () => {
    await expect(
      resolveSource('https://example.com', [], async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ]),
    ).rejects.toThrow('SOURCE_BLOCKED');
    await expect(
      resolveSource('https://example.com', [], async () => []),
    ).rejects.toThrow('SOURCE_BLOCKED');
  });
  it('revalida DNS em cada resolução', async () => {
    let calls = 0;
    const resolver = async () => [
      { address: ++calls === 1 ? '8.8.8.8' : '10.0.0.1', family: 4 },
    ];
    expect(
      (await resolveSource('https://example.com', [], resolver)).addresses[0]
        ?.address,
    ).toBe('8.8.8.8');
    await expect(
      resolveSource('https://example.com', [], resolver),
    ).rejects.toThrow();
  });
});
describe('HTTP Range', () => {
  it('suporta faixa, aberta e sufixo', () => {
    expect(parseRange('bytes=1-3', 10)).toEqual({ start: 1, end: 3 });
    expect(parseRange('bytes=8-', 10)).toEqual({ start: 8, end: 9 });
    expect(parseRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
  });
  for (const value of [
    'bytes=10-',
    'bytes=5-1',
    'bytes=-0',
    'bytes=0-1,4-5',
    'bytes=-',
    'xxx',
  ])
    it(`rejeita ${value}`, () => expect(() => parseRange(value, 10)).toThrow());
});
