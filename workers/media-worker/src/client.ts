import { setTimeout as delay } from 'node:timers/promises';
import {
  controlSchema,
  resultSchema,
  sameExecution,
  type Command,
  type Result,
} from './protocol.js';
import { writeMessage, readMessage, removeMessage } from './spool.js';
import { MediaError } from './supervisor.js';
export class SandboxClient {
  constructor(
    readonly commands: string,
    readonly results: string,
  ) {}
  async cancel(cmd: Command) {
    await writeMessage(
      this.commands,
      cmd.operationId,
      'control',
      controlSchema.parse({
        version: 1,
        operationId: cmd.operationId,
        jobId: cmd.jobId,
        attemptId: cmd.attemptId,
        generation: cmd.generation,
        leaseUntil: Date.now() + 30000,
        cancel: true,
      }),
    );
  }
  async run(
    cmd: Command,
    valid: () => Promise<boolean>,
    onProgress: (result: Result) => Promise<void>,
  ) {
    const control = async (cancel = false) =>
      writeMessage(this.commands, cmd.operationId, 'control', {
        version: 1,
        operationId: cmd.operationId,
        jobId: cmd.jobId,
        attemptId: cmd.attemptId,
        generation: cmd.generation,
        leaseUntil: Date.now() + 30000,
        cancel,
      });
    await control();
    await writeMessage(this.commands, cmd.operationId, 'command', cmd);
    let nextHeartbeat = Date.now();
    let previous = '';
    let cancelledAt: number | undefined;
    for (;;) {
      if (
        !cancelledAt &&
        (Date.now() >= cmd.deadline || Date.now() >= nextHeartbeat)
      ) {
        let allowed = false;
        try {
          allowed = Date.now() < cmd.deadline && (await valid());
        } catch {
          /* DB outage must stop the sandbox lease. */
        }
        if (!allowed) {
          cancelledAt = Date.now();
          await control(true);
        } else {
          await control();
          nextHeartbeat = Date.now() + 5000;
        }
      }
      try {
        const result = await readMessage(
          this.results,
          cmd.operationId,
          'result',
          resultSchema,
        );
        if (sameExecution(cmd, result)) {
          if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(result.state)) {
            if (result.state === 'COMPLETED' && cmd.operation === 'process')
              await onProgress({
                ...result,
                state: 'PROCESSING',
                progress: 99,
              });
            await removeMessage(this.commands, cmd.operationId, 'command');
            await removeMessage(this.commands, cmd.operationId, 'control');
            await removeMessage(this.results, cmd.operationId, 'result');
            if (cancelledAt) throw new MediaError('CANCELLED');
            if (result.state !== 'COMPLETED')
              throw new MediaError(result.code ?? 'SOURCE_UNAVAILABLE');
            return result;
          }
          const serialized = JSON.stringify(result);
          if (serialized !== previous) {
            await onProgress(result);
            previous = serialized;
          }
        }
      } catch (error) {
        if (error instanceof MediaError) throw error;
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new MediaError('INVALID_MESSAGE');
      }
      if (cancelledAt && Date.now() - cancelledAt > 10000)
        throw new MediaError('SANDBOX_UNAVAILABLE');
      await delay(200);
    }
  }
}
