import { z } from 'zod';
import { MediaError } from './supervisor.js';
const variant = z.object({
  format_id: z.string().max(100).optional(),
  vcodec: z.string().optional().nullable(),
  acodec: z.string().optional().nullable(),
  height: z.number().optional().nullable(),
  width: z.number().optional().nullable(),
});
const inputSchema = variant.extend({
  _type: z.string().optional(),
  is_live: z.boolean().optional(),
  live_status: z.string().optional(),
  has_drm: z.boolean().optional().nullable(),
  availability: z.string().optional().nullable(),
  title: z.string().max(1000).optional().nullable(),
  duration: z.number().nonnegative().optional().nullable(),
  thumbnail: z.string().max(2048).optional().nullable(),
  extractor_key: z.string().optional().nullable(),
  formats: z.array(variant).max(10000).optional(),
  entries: z.unknown().optional(),
});
export function normalizeMetadata(raw: unknown, allowUnknown = false) {
  const input = inputSchema.parse(raw);
  if (input.entries || ['playlist', 'multi_video'].includes(input._type ?? ''))
    throw new MediaError('PLAYLIST_UNSUPPORTED');
  if (
    input.is_live ||
    ['is_live', 'is_upcoming', 'post_live'].includes(input.live_status ?? '')
  )
    throw new MediaError('LIVE_UNSUPPORTED');
  if (
    input.has_drm ||
    ['private', 'premium_only', 'subscriber_only', 'needs_auth'].includes(
      input.availability ?? '',
    )
  )
    throw new MediaError('SOURCE_UNAVAILABLE');
  if (input.duration && input.duration > 7200)
    throw new MediaError('DURATION_LIMIT');
  const formats = input.formats ?? [input];
  const video = formats.some((f) => f.vcodec && f.vcodec !== 'none');
  const audio = formats.some((f) => f.acodec && f.acodec !== 'none');
  if (!video && !audio && !allowUnknown)
    throw new MediaError('FORMAT_UNAVAILABLE');
  return {
    title: input.title ?? null,
    durationSeconds: input.duration ?? null,
    source: input.extractor_key ?? null,
    thumbnail: input.thumbnail ?? null,
    availableFormats: [...(video ? ['mp4'] : []), ...(audio ? ['mp3'] : [])],
    warnings: [
      ...(!audio ? ['NO_AUDIO'] : []),
      ...(!video ? ['NO_VIDEO'] : []),
      'SOURCE_QUALITY_LIMIT',
    ],
    video,
    audio,
  };
}
export const heights = { low: 360, medium: 720, high: 1080 };
export const bitrates = { low: 96, medium: 192, high: 320 };
