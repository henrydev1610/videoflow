import { spawn } from 'node:child_process';

export class MediaError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
/** Linux process groups are mandatory: never silently weaken termination on Windows. */
export async function runProcess(
  binary: string,
  args: readonly string[],
  options: {
    cwd: string;
    signal: AbortSignal;
    timeoutMs: number;
    stdoutLimit?: number;
    stderrLimit?: number;
    env?: NodeJS.ProcessEnv;
    onOutput?: (text: string) => void;
    onDiagnostic?: (text: string) => void;
  },
): Promise<string> {
  if (process.platform !== 'linux') throw new MediaError('LINUX_REQUIRED');
  if (options.signal.aborted) throw new MediaError('CANCELLED');
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [...args], {
      cwd: options.cwd,
      shell: false,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: options.env ?? {
        PATH: process.env.PATH,
        HOME: '/nonexistent',
        LANG: 'C.UTF-8',
      },
    });
    let stdout = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let diagnostic = '';
    let failure: string | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    const kill = (signal: NodeJS.Signals) => {
      if (child.pid)
        try {
          process.kill(-child.pid, signal);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
        }
    };
    const stop = (code: string) => {
      if (failure) return;
      failure = code;
      kill('SIGTERM');
      killTimer = setTimeout(() => kill('SIGKILL'), 5000);
    };
    const abort = () => stop('CANCELLED');
    options.signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(
      () => stop('PROCESS_TIMEOUT'),
      options.timeoutMs,
    );
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > (options.stdoutLimit ?? 2097152)) {
        stop('OUTPUT_LIMIT');
        return;
      }
      stdout += chunk.toString();
      options.onOutput?.(chunk.toString());
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > (options.stderrLimit ?? 65536)) stop('OUTPUT_LIMIT');
      else {
        diagnostic += chunk.toString();
        options.onDiagnostic?.(chunk.toString());
      }
    });
    child.on('error', () => {
      failure = 'PROCESS_UNAVAILABLE';
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      options.signal.removeEventListener('abort', abort);
      kill('SIGKILL');
      if (failure) reject(new MediaError(failure));
      else if (code !== 0)
        reject(
          new MediaError(
            binary === 'yt-dlp'
              ? /timed out|Temporary failure|HTTP Error 5\d\d|Connection reset/i.test(
                  diagnostic,
                )
                ? 'NETWORK_ERROR'
                : /HTTP Error 429|Too Many Requests/i.test(diagnostic)
                  ? 'SOURCE_RATE_LIMITED'
                  : /Sign in to confirm|not a bot|cookies.*authentication/i.test(
                        diagnostic,
                      )
                    ? 'SOURCE_AUTH_REQUIRED'
                    : /403|401|DRM|Sign in|login/i.test(diagnostic)
                      ? 'SOURCE_UNAVAILABLE'
                      : 'PROCESS_FAILED'
              : 'PROCESS_FAILED',
          ),
        );
      else resolve(stdout);
    });
  });
}
