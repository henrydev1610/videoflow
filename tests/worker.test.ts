import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  commandSchema,
  controlSchema,
  resultSchema,
  sameExecution,
} from '../workers/media-worker/src/protocol.js';
import {
  writeMessage,
  readMessage,
  removeMessage,
  spoolPath,
} from '../workers/media-worker/src/spool.js';
import { runProcess } from '../workers/media-worker/src/supervisor.js';
import { attemptDirectory } from '../workers/media-worker/src/pipeline.js';
const ids = () => ({
  operationId: randomUUID(),
  jobId: randomUUID(),
  attemptId: randomUUID(),
  generation: 1,
});
describe('spool versionado', () => {
  it.skipIf(process.platform !== 'linux')(
    'isola diretório e rejeita parent symlink',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'vf-directory-'));
      const outside = await mkdtemp(join(tmpdir(), 'vf-outside-'));
      try {
        const identity = ids();
        const cmd = commandSchema.parse({
          version: 1,
          ...identity,
          operation: 'process',
          url: 'https://example.com/',
          format: 'mp4',
          quality: 'low',
          deadline: Date.now() + 10000,
        });
        expect(await attemptDirectory(root, cmd)).toBe(
          join(root, cmd.jobId, '1'),
        );
        const other = { ...cmd, jobId: randomUUID() };
        await symlink(outside, join(root, other.jobId));
        await expect(attemptDirectory(root, other)).rejects.toThrow(
          'INVALID_PATH',
        );
        await expect(
          attemptDirectory(root, { ...cmd, jobId: '../../escape' }),
        ).rejects.toThrow('INVALID_PATH');
      } finally {
        await rm(root, { recursive: true, force: true });
        await rm(outside, { recursive: true, force: true });
      }
    },
  );
  it('valida mensagens, versão, limites e geração', () => {
    const identity = ids();
    const cmd = {
      version: 1,
      ...identity,
      operation: 'inspect',
      url: 'https://example.com/',
      format: 'mp4',
      quality: 'low',
      deadline: Date.now() + 30000,
    };
    expect(commandSchema.parse(cmd)).toEqual(cmd);
    for (const patch of [
      { version: 2 },
      { generation: 0 },
      { jobId: '../../etc' },
      { operation: 'exec' },
      { shell: 'sh' },
      { quality: 'ultra' },
    ])
      expect(commandSchema.safeParse({ ...cmd, ...patch }).success).toBe(false);
    expect(sameExecution(identity, { ...identity, generation: 2 })).toBe(false);
    expect(
      resultSchema.safeParse({
        version: 1,
        ...identity,
        state: 'COMPLETED',
        progress: 100,
        indeterminate: false,
        code: null,
      }).success,
    ).toBe(false);
  });
  it('escreve atomicamente, substitui heartbeat e limpa só a operação', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vf-spool-'));
    try {
      const identity = ids();
      const data = {
        version: 1,
        ...identity,
        leaseUntil: Date.now() + 30000,
        cancel: false,
      };
      await writeMessage(root, identity.operationId, 'control', data);
      await writeMessage(root, identity.operationId, 'control', {
        ...data,
        cancel: true,
      });
      expect(
        (
          await readMessage(
            root,
            identity.operationId,
            'control',
            controlSchema,
          )
        ).cancel,
      ).toBe(true);
      await removeMessage(root, identity.operationId, 'control');
      await expect(
        readMessage(root, identity.operationId, 'control', controlSchema),
      ).rejects.toThrow();
      await expect(
        spoolPath(root, '../../outside', 'control'),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it.skipIf(process.platform !== 'linux')(
    'rejeita symlink no spool',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'vf-spool-'));
      try {
        const id = randomUUID();
        await symlink('/etc/passwd', await spoolPath(root, id, 'result'));
        await expect(
          readMessage(root, id, 'result', resultSchema),
        ).rejects.toThrow('INVALID_MESSAGE');
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});
describe.skipIf(process.platform !== 'linux')('supervisor Linux real', () => {
  it('propaga falha real de FFmpeg sem produzir saída', async () => {
    await expect(
      runProcess(
        'ffmpeg',
        [
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          '-protocol_whitelist',
          'file,pipe',
          '-i',
          '/nonexistent-invalid-media',
          '-f',
          'mp4',
          '/tmp/vf-must-not-publish.mp4',
        ],
        {
          cwd: tmpdir(),
          signal: new AbortController().signal,
          timeoutMs: 2000,
        },
      ),
    ).rejects.toThrow('PROCESS_FAILED');
  });
  it('não interpreta metacaracteres e limita stdout/stderr', async () => {
    const signal = new AbortController().signal;
    expect(
      await runProcess(
        process.execPath,
        ['-e', 'process.stdout.write(process.argv[1])', '; touch /tmp/never'],
        { cwd: tmpdir(), signal, timeoutMs: 2000 },
      ),
    ).toBe('; touch /tmp/never');
    await expect(
      runProcess(
        process.execPath,
        ['-e', 'process.stdout.write("x".repeat(5000))'],
        { cwd: tmpdir(), signal, timeoutMs: 2000, stdoutLimit: 100 },
      ),
    ).rejects.toThrow('OUTPUT_LIMIT');
    await expect(
      runProcess(
        process.execPath,
        ['-e', 'process.stderr.write("x".repeat(5000))'],
        { cwd: tmpdir(), signal, timeoutMs: 2000, stderrLimit: 100 },
      ),
    ).rejects.toThrow('OUTPUT_LIMIT');
  });
  it('encerra grupo e filho resistente após timeout', async () => {
    const started = Date.now();
    await expect(
      runProcess(
        process.execPath,
        [
          '-e',
          `const {spawn}=require('node:child_process');spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'inherit'});process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`,
        ],
        { cwd: tmpdir(), signal: new AbortController().signal, timeoutMs: 300 },
      ),
    ).rejects.toThrow('PROCESS_TIMEOUT');
    expect(Date.now() - started).toBeLessThan(9000);
  }, 10000);
  it('cancelamento aborta processo real', async () => {
    const control = new AbortController();
    setTimeout(() => control.abort(), 200);
    await expect(
      runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
        cwd: tmpdir(),
        signal: control.signal,
        timeoutMs: 10000,
      }),
    ).rejects.toThrow('CANCELLED');
  });
});
