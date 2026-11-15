import { z } from 'zod';
import type { Command } from './protocol.js';
import { safeFile, checksum } from './lifecycle.js';
import { heights } from './metadata.js';
import { MediaError } from './supervisor.js';
const evidence = z.object({
  outputChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  outputProbe: z.object({
    format: z.object({ duration: z.string(), size: z.string() }),
    streams: z.array(
      z.object({
        codec_type: z.string(),
        codec_name: z.string(),
        height: z.number().optional(),
        pix_fmt: z.string().optional(),
      }),
    ),
  }),
});
export async function verifyOutputEvidence(
  cmd: Command,
  metadata: unknown,
  tempRoot: string,
) {
  const checked = evidence.parse(metadata);
  const { streams, format } = checked.outputProbe;
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');
  const duration = Number(format.duration);
  const size = Number(format.size);
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 7200 ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > 1024 ** 3
  )
    throw new MediaError('INVALID_MEDIA');
  if (
    cmd.format === 'mp3'
      ? audio?.codec_name !== 'mp3'
      : video?.codec_name !== 'h264' ||
        video.pix_fmt !== 'yuv420p' ||
        (video.height ?? Infinity) > heights[cmd.quality] ||
        (audio && audio.codec_name !== 'aac')
  )
    throw new MediaError('INVALID_MEDIA');
  const path = await safeFile(tempRoot, [
    cmd.jobId,
    String(cmd.generation),
    `output.${cmd.format}`,
  ]);
  if ((await checksum(path)) !== checked.outputChecksum)
    throw new MediaError('INVALID_MEDIA');
}
