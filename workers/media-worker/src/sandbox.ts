import { readdir, mkdir, rm, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import {
  commandSchema,
  controlSchema,
  sameExecution,
  type Command,
} from './protocol.js';
import { readMessage, writeMessage } from './spool.js';
import { pipeline, attemptDirectory } from './pipeline.js';
import { MediaError } from './supervisor.js';
const commands = process.env.COMMAND_ROOT ?? '/spool/commands';
const results = process.env.RESULT_ROOT ?? '/spool/results';
const temporary = process.env.TEMP_ROOT ?? '/media/temp';
const running = new Map<string, AbortController>();
const finished = new Set<string>();
let stopping = false;
async function execute(cmd: Command) {
  const controller = new AbortController();
  running.set(cmd.operationId, controller);
  const identity = {
    operationId: cmd.operationId,
    jobId: cmd.jobId,
    attemptId: cmd.attemptId,
    generation: cmd.generation,
  };
  const send = (
    state: 'DOWNLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED',
    progress: number,
    indeterminate: boolean,
    code: string | null,
    metadata?: Record<string, unknown>,
  ) =>
    writeMessage(results, cmd.operationId, 'result', {
      version: 1,
      ...identity,
      state,
      progress,
      indeterminate,
      code,
      ...(metadata ? { metadata } : {}),
    });
  let checking = false;
  let reason = 'CANCELLED';
  const check = async () => {
    if (checking) return;
    checking = true;
    try {
      const control = await readMessage(
        commands,
        cmd.operationId,
        'control',
        controlSchema,
      );
      if (
        !sameExecution(cmd, control) ||
        control.cancel ||
        control.leaseUntil <= Date.now() ||
        cmd.deadline <= Date.now()
      ) {
        reason = cmd.deadline <= Date.now() ? 'PROCESS_TIMEOUT' : 'CANCELLED';
        controller.abort();
      }
    } catch {
      controller.abort();
    } finally {
      checking = false;
    }
  };
  await check();
  const timer = setInterval(() => void check(), 500);
  try {
    const result = await pipeline(
      cmd,
      temporary,
      process.env.EGRESS_PROXY ?? 'http://egress:3128',
      controller.signal,
      (event) => send(event.state, event.progress, event.indeterminate, null),
    );
    if (controller.signal.aborted) throw new MediaError(reason);
    await send('COMPLETED', 99, false, null, result.metadata);
  } catch (error) {
    const directory = await attemptDirectory(temporary, cmd);
    await rm(directory, { recursive: true, force: true });
    const code =
      error instanceof MediaError ? error.code : 'SOURCE_UNAVAILABLE';
    await send(
      controller.signal.aborted ? 'CANCELLED' : 'FAILED',
      0,
      true,
      controller.signal.aborted ? reason : code,
    );
  } finally {
    clearInterval(timer);
    running.delete(cmd.operationId);
    finished.add(cmd.operationId);
  }
}
await mkdir(results, { recursive: true });
await mkdir(temporary, { recursive: true });
process.on('SIGTERM', () => {
  stopping = true;
  for (const controller of running.values()) controller.abort();
});
while (!stopping) {
  try {
    const files = await readdir(commands);
    const present = new Set(
      files
        .filter((f) => f.endsWith('.command.json'))
        .map((f) => f.slice(0, -13)),
    );
    for (const id of finished) if (!present.has(id)) finished.delete(id);
    for (const id of present) {
      if (running.size >= 4) break;
      if (running.has(id) || finished.has(id)) continue;
      try {
        const cmd = await readMessage(commands, id, 'command', commandSchema);
        if (cmd.operationId !== id) continue;
        void execute(cmd).catch(() => {
          running.delete(id);
          finished.add(id);
        });
      } catch {
        /* Untrusted/malformed spool never starts a process. */
      }
    }
    await writeFile('/tmp/sandbox-heartbeat', String(Date.now()));
  } catch {
    /* Fail closed: commands cannot be read, active leases will expire. */
  }
  await delay(250);
}
while (running.size) await delay(100);
