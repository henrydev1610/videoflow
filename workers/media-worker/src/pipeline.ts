import { mkdir, readdir, lstat, statfs } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { parseSourceUrl } from '@videoflow/shared/security';
import { runProcess, MediaError } from './supervisor.js';
import { normalizeMetadata, heights, bitrates } from './metadata.js';
import type { Command, Result } from './protocol.js';
import { thumbnail } from './thumbnail.js';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { downloadProgress } from './download-progress.js';
export async function attemptDirectory(root: string, cmd: Command) {
  const base = resolve(root);
  const directory = resolve(base, cmd.jobId, String(cmd.generation));
  if (!directory.startsWith(base + sep)) throw new MediaError('INVALID_PATH');
  await mkdir(base, { recursive: true });
  for (const p of [base, join(base, cmd.jobId), directory]) {
    try {
      await mkdir(p);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const info = await lstat(p);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new MediaError('INVALID_PATH');
  }
  return directory;
}
const probeSchemaFields =
  'format=duration,size,bit_rate:stream=codec_type,codec_name,width,height,pix_fmt,bit_rate';
export function assertResources(
  bytes: number,
  files: number,
  available: number,
  deadline: number,
  now = Date.now(),
) {
  if (bytes > 3 * 1024 ** 3 || files > 10000)
    throw new MediaError('INPUT_LIMIT');
  if (available < 1024 ** 3) throw new MediaError('DISK_LIMIT');
  if (now >= deadline) throw new MediaError('PROCESS_TIMEOUT');
}
export async function pipeline(
  cmd: Command,
  root: string,
  proxyAddress: string,
  signal: AbortSignal,
  emit: (
    event: Pick<Result, 'state' | 'progress' | 'indeterminate'>,
  ) => Promise<void>,
) {
  parseSourceUrl(
    cmd.url,
    (process.env.SOURCE_HOST_ALLOWLIST ?? '').split(',').filter(Boolean),
  );
  const directory = await attemptDirectory(root, cmd);
  const control = new AbortController();
  const abort = () => control.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const proxy = new URL(proxyAddress);
  proxy.username = cmd.operationId;
  proxy.password = 'spool';
  let limitError: string | undefined;
  let checking = false;
  const check = async () => {
    if (checking) return;
    checking = true;
    try {
      let bytes = 0;
      let files = 0;
      for (const entry of await readdir(directory)) {
        const info = await lstat(join(directory, entry));
        if (info.isSymbolicLink() || !info.isFile())
          throw new MediaError('INVALID_PATH');
        bytes += info.size;
        files++;
        if (entry.startsWith('output.') && info.size > 1024 ** 3)
          throw new MediaError('OUTPUT_LIMIT');
      }
      const disk = await statfs(directory);
      assertResources(bytes, files, disk.bavail * disk.bsize, cmd.deadline);
    } catch (error) {
      limitError = error instanceof MediaError ? error.code : 'STORAGE_ERROR';
      control.abort();
    } finally {
      checking = false;
    }
  };
  const monitor = setInterval(() => void check(), 250);
  let downloading = false;
  const downloadUpdates: Promise<void>[] = [];
  const receiveProgress = downloadProgress((progress, indeterminate) => {
    if (cmd.operation !== 'process' || !downloading) return;
    downloadUpdates.push(
      emit({ state: 'DOWNLOADING', progress, indeterminate }).catch(() => {
        limitError = 'STATE_UNAVAILABLE';
        control.abort();
      }),
    );
  });
  const run = (
    binary: string,
    args: string[],
    onOutput?: (text: string) => void,
  ) =>
    runProcess(binary, args, {
      cwd: directory,
      signal: control.signal,
      timeoutMs: Math.max(1, cmd.deadline - Date.now()),
      onOutput,
      onDiagnostic: binary === 'yt-dlp' ? receiveProgress : undefined,
    });
  const common = [
    '--ignore-config',
    '--js-runtimes',
    'node',
    '--no-playlist',
    '--no-warnings',
    '--no-cache-dir',
    '--no-check-formats',
    '--proxy',
    proxy.toString(),
    '--socket-timeout',
    '10',
    '--retries',
    '0',
    '--fragment-retries',
    '0',
    '--no-call-home',
    '--newline',
    '--progress',
    '--progress-template',
    'download:VF_PROGRESS:%(progress.downloaded_bytes)s/%(progress.total_bytes)s',
  ];
  try {
    await check();
    if (limitError) throw new MediaError(limitError);
    const raw = await run('yt-dlp', [
      ...common,
      '--skip-download',
      '--dump-single-json',
      '--',
      cmd.url,
    ]);
    const metadata = normalizeMetadata(JSON.parse(raw), true);
    let predownloaded = false;
    if (!metadata.availableFormats.length) {
      downloading = true;
      // Generic URLs may omit all codecs. Determine availability from bounded local bytes, never infer it from extension.
      await run('yt-dlp', [
        ...common,
        '--no-simulate',
        '--no-part',
        '--no-continue',
        '--max-filesize',
        String(2 * 1024 ** 3),
        '--format',
        'best',
        '--output',
        'input.%(ext)s',
        '--',
        cmd.url,
      ]);
      const files = (await readdir(directory)).filter((name) =>
        name.startsWith('input.'),
      );
      if (files.length !== 1) throw new MediaError('FORMAT_UNAVAILABLE');
      const probed = JSON.parse(
        await run('ffprobe', [
          '-v',
          'error',
          '-protocol_whitelist',
          'file,pipe',
          '-show_entries',
          probeSchemaFields,
          '-of',
          'json',
          files[0]!,
        ]),
      ) as {
        streams?: Array<{ codec_type: string }>;
        format?: { duration?: string };
      };
      metadata.video = !!probed.streams?.some((s) => s.codec_type === 'video');
      metadata.audio = !!probed.streams?.some((s) => s.codec_type === 'audio');
      metadata.availableFormats = [
        ...(metadata.video ? ['mp4'] : []),
        ...(metadata.audio ? ['mp3'] : []),
      ];
      if (!metadata.availableFormats.length)
        throw new MediaError('FORMAT_UNAVAILABLE');
      const seconds = Number(probed.format?.duration);
      if (Number.isFinite(seconds) && seconds > 0)
        metadata.durationSeconds = seconds;
      if (metadata.durationSeconds !== null && metadata.durationSeconds > 7200)
        throw new MediaError('DURATION_LIMIT');
      metadata.warnings = metadata.warnings.filter(
        (w) => w !== 'NO_AUDIO' && w !== 'NO_VIDEO',
      );
      if (!metadata.audio) metadata.warnings.push('NO_AUDIO');
      if (!metadata.video) metadata.warnings.push('NO_VIDEO');
      predownloaded = true;
    }
    if (cmd.operation === 'inspect') {
      let thumbnailMime: string | null = null;
      if (metadata.thumbnail) {
        try {
          thumbnailMime = await thumbnail(
            metadata.thumbnail,
            proxy.toString(),
            join(directory, 'thumbnail'),
            control.signal,
          );
        } catch {
          metadata.warnings.push('THUMBNAIL_UNAVAILABLE');
        }
      }
      return { metadata: { ...metadata, thumbnailMime }, directory };
    }
    if (!metadata.availableFormats.includes(cmd.format))
      throw new MediaError('FORMAT_UNAVAILABLE');
    if (!predownloaded)
      await emit({ state: 'DOWNLOADING', progress: 0, indeterminate: true });
    downloading = true;
    const height = heights[cmd.quality];
    const selection =
      cmd.format === 'mp3'
        ? 'bestaudio/best'
        : `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/bestvideo+bestaudio/best`;
    if (!predownloaded)
      await run('yt-dlp', [
        ...common,
        '--no-simulate',
        '--no-mtime',
        '--no-part',
        '--no-continue',
        '--no-write-subs',
        '--no-write-auto-subs',
        '--no-write-thumbnail',
        '--no-write-info-json',
        '--no-write-comments',
        '--downloader',
        'native',
        '--hls-use-mpegts',
        '--concurrent-fragments',
        '1',
        '--max-filesize',
        String(2 * 1024 ** 3),
        '--format',
        selection,
        '--output',
        'input.%(ext)s',
        '--',
        cmd.url,
      ]);
    await Promise.all(downloadUpdates);
    downloading = false;
    const inputs = (await readdir(directory)).filter(
      (f) => f.startsWith('input.') && !f.endsWith('.part'),
    );
    // yt-dlp merges requested audio/video locally; only a single regular final input is accepted.
    if (inputs.length !== 1) throw new MediaError('INVALID_MEDIA');
    const input = inputs[0]!;
    const probe = async (file: string) =>
      JSON.parse(
        await run('ffprobe', [
          '-v',
          'error',
          '-protocol_whitelist',
          'file,pipe',
          '-show_entries',
          probeSchemaFields,
          '-of',
          'json',
          file,
        ]),
      ) as {
        format?: { duration?: string; size?: string };
        streams?: Array<{
          codec_type?: string;
          codec_name?: string;
          width?: number;
          height?: number;
          pix_fmt?: string;
        }>;
      };
    const inspected = await probe(input);
    const duration = Number(inspected.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0)
      throw new MediaError('INVALID_MEDIA');
    if (duration > 7200) throw new MediaError('DURATION_LIMIT');
    const video = inspected.streams?.find((s) => s.codec_type === 'video');
    const audio = inspected.streams?.find((s) => s.codec_type === 'audio');
    if ((cmd.format === 'mp3' && !audio) || (cmd.format === 'mp4' && !video))
      throw new MediaError('FORMAT_UNAVAILABLE');
    await emit({ state: 'PROCESSING', progress: 70, indeterminate: false });
    const output = `output.${cmd.format}`;
    const compatible =
      cmd.format === 'mp4' &&
      video?.codec_name === 'h264' &&
      video.pix_fmt === 'yuv420p' &&
      (video.height ?? Infinity) <= height &&
      (!audio || audio.codec_name === 'aac');
    const codec =
      cmd.format === 'mp3'
        ? [
            '-map',
            '0:a:0',
            '-vn',
            '-c:a',
            'libmp3lame',
            '-b:a',
            `${bitrates[cmd.quality]}k`,
          ]
        : [
            '-map',
            '0:v:0',
            '-map',
            '0:a:0?',
            ...(compatible
              ? ['-c', 'copy']
              : [
                  '-vf',
                  `scale=-2:trunc(min(ih\\,${height})/2)*2`,
                  '-c:v',
                  'libx264',
                  '-pix_fmt',
                  'yuv420p',
                  '-preset',
                  'fast',
                  '-c:a',
                  'aac',
                ]),
            '-movflags',
            '+faststart',
          ];
    let last = 0;
    const updates: Promise<void>[] = [];
    await run(
      'ffmpeg',
      [
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        input,
        ...codec,
        '-threads',
        '2',
        '-fs',
        String(1024 ** 3),
        '-progress',
        'pipe:1',
        '-y',
        output,
      ],
      (text) => {
        const match = /out_time_us=(\d+)/.exec(text);
        if (match && Date.now() - last >= 1000) {
          last = Date.now();
          updates.push(
            emit({
              state: 'PROCESSING',
              progress: Math.min(
                99,
                70 + Math.floor((Number(match[1]) / 1e6 / duration) * 29),
              ),
              indeterminate: false,
            }).catch(() => {
              limitError = 'STATE_UNAVAILABLE';
              control.abort();
            }),
          );
        }
      },
    );
    await Promise.all(updates);
    await check();
    if (limitError) throw new MediaError(limitError);
    const result = await probe(output);
    const finalDuration = Number(result.format?.duration);
    const outputInfo = await lstat(join(directory, output));
    if (
      !outputInfo.isFile() ||
      outputInfo.isSymbolicLink() ||
      !outputInfo.size ||
      outputInfo.size >= 1024 ** 3 ||
      !Number.isFinite(finalDuration) ||
      Math.abs(finalDuration - duration) > Math.max(1, duration * 0.02)
    )
      throw new MediaError('INVALID_MEDIA');
    const v = result.streams?.find((s) => s.codec_type === 'video');
    const a = result.streams?.find((s) => s.codec_type === 'audio');
    if (
      cmd.format === 'mp3'
        ? a?.codec_name !== 'mp3'
        : v?.codec_name !== 'h264' ||
          v.pix_fmt !== 'yuv420p' ||
          (v.height ?? Infinity) > Math.min(height, video?.height ?? height) ||
          (a && a.codec_name !== 'aac')
    )
      throw new MediaError('INVALID_MEDIA');
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(join(directory, output), {
      signal: control.signal,
    }))
      digest.update(chunk);
    return {
      metadata: {
        ...metadata,
        durationSeconds: finalDuration,
        bytes: outputInfo.size,
        remux: compatible,
        outputProbe: result,
        outputChecksum: digest.digest('hex'),
      },
      directory,
    };
  } catch (error) {
    const gatewayError = await new Promise<string | null>((resolve) => {
      const req = http.get(
        {
          host: proxy.hostname,
          port: Number(proxy.port),
          path: `/operations/${cmd.operationId}`,
          headers: {
            'proxy-authorization': `Basic ${Buffer.from(cmd.operationId + ':spool').toString('base64')}`,
          },
        },
        (res) => {
          let text = '';
          res.on('data', (chunk) => {
            text += chunk;
            if (text.length > 1000) res.destroy();
          });
          res.on('end', () => {
            try {
              const status = JSON.parse(text);
              resolve(
                status.blocked === true
                  ? 'SOURCE_BLOCKED'
                  : status.exceeded === true
                    ? 'INPUT_LIMIT'
                    : null,
              );
            } catch {
              resolve(null);
            }
          });
          res.on('error', () => resolve(null));
        },
      );
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(null);
      });
      req.on('error', () => resolve(null));
    });
    if (gatewayError) throw new MediaError(gatewayError);
    if (limitError) throw new MediaError(limitError);
    if (error instanceof MediaError) throw error;
    throw new MediaError('SOURCE_UNAVAILABLE');
  } finally {
    clearInterval(monitor);
    signal.removeEventListener('abort', abort);
  }
}
