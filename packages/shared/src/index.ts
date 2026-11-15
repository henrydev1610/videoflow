import { z } from 'zod';

export const statusSchema = z.enum([
  'PENDING',
  'DOWNLOADING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
]);
export type JobStatus = z.infer<typeof statusSchema>;
export const activeStatuses: JobStatus[] = [
  'PENDING',
  'DOWNLOADING',
  'PROCESSING',
];
export const formatSchema = z.enum(['mp3', 'mp4']);
export const qualitySchema = z.enum(['low', 'medium', 'high']);
export const idSchema = z.uuid();
export const idempotencyHeadersSchema = z
  .object({ 'idempotency-key': idSchema })
  .passthrough();
export const dateSchema = z.iso.datetime();
export const idParamsSchema = z.strictObject({ id: idSchema });
export const emptyBodySchema = z.strictObject({});
export const createDownloadSchema = z.strictObject({
  inspectionId: idSchema,
  format: formatSchema,
  quality: qualitySchema,
  rightsConfirmed: z.literal(true),
});
export const inspectSchema = z.strictObject({
  url: z.string().min(1).max(2048),
});
export const listQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(100).optional(),
  status: statusSchema.optional(),
  format: formatSchema.optional(),
  sort: z
    .enum(['createdAt:asc', 'createdAt:desc', 'title:asc'])
    .default('createdAt:desc'),
});
export type ListQuery = z.infer<typeof listQuerySchema>;
export type CreateDownload = z.infer<typeof createDownloadSchema>;
export const publicErrorSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
});
export const errorSchema = z.strictObject({
  error: publicErrorSchema.extend({
    requestId: z.string(),
    details: z
      .array(z.strictObject({ field: z.string(), message: z.string() }))
      .optional(),
  }),
});
export const jobSchema = z.strictObject({
  id: idSchema,
  title: z.string(),
  source: z.string(),
  format: formatSchema,
  quality: qualitySchema,
  status: statusSchema,
  progress: z.number().int().min(0).max(100),
  progressIndeterminate: z.boolean(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
  completedAt: dateSchema.nullable(),
  fileSizeBytes: z.string().regex(/^\d+$/).nullable(),
  fileExpiresAt: dateSchema.nullable(),
  historyExpiresAt: dateSchema,
  error: publicErrorSchema.nullable(),
  canRetry: z.boolean(),
  attemptCount: z.number().int().min(0),
});
export const attemptSchema = z.strictObject({
  id: idSchema,
  sequence: z.number().int(),
  cycle: z.number().int(),
  startedAt: dateSchema,
  finishedAt: dateSchema.nullable(),
  outcome: z.string().nullable(),
  error: publicErrorSchema.nullable(),
});
export const detailSchema = jobSchema.extend({
  attempts: z.array(attemptSchema),
});
export const summarySchema = z.strictObject({
  total: z.number().int(),
  completed: z.number().int(),
  active: z.number().int(),
  failed: z.number().int(),
  cancelled: z.number().int(),
  expired: z.number().int(),
});
export const listResponseSchema = z.strictObject({
  items: z.array(jobSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  summary: summarySchema,
});
export const contextSchema = z.strictObject({ expiresAt: dateSchema });
export const dataSchema = <T extends z.ZodType>(schema: T) =>
  z.strictObject({ data: schema });
export const limits = Object.freeze({
  contextDays: 30,
  inspectionMinutes: 10,
  fileHours: 24,
  perContext: 3,
  globalActive: 100,
  concurrency: 2,
  inputBytes: 2 * 1024 ** 3,
  outputBytes: 1024 ** 3,
  durationSeconds: 7200,
  attemptSeconds: 1800,
  maxAttempts: 9,
});

export type TransitionCause = 'normal' | 'retry' | 'recovery';
const transitions: Record<JobStatus, JobStatus[]> = {
  PENDING: ['DOWNLOADING', 'FAILED', 'CANCELLED'],
  DOWNLOADING: ['PROCESSING', 'FAILED', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'FAILED', 'CANCELLED'],
  COMPLETED: ['EXPIRED'],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
};
export function canTransition(
  from: JobStatus,
  to: JobStatus,
  cause: TransitionCause = 'normal',
  leaseExpired = false,
): boolean {
  if (cause === 'retry') return from === 'FAILED' && to === 'PENDING';
  if (cause === 'recovery')
    return (
      leaseExpired &&
      ['DOWNLOADING', 'PROCESSING'].includes(from) &&
      to === 'PENDING'
    );
  return transitions[from].includes(to);
}
