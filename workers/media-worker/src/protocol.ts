import { z } from 'zod';
export const identity = {
  operationId: z.uuid(),
  jobId: z.uuid(),
  attemptId: z.uuid(),
  generation: z.number().int().positive(),
};
export const commandSchema = z.strictObject({
  version: z.literal(1),
  ...identity,
  operation: z.enum(['inspect', 'process']),
  url: z.string().max(2048),
  format: z.enum(['mp3', 'mp4']),
  quality: z.enum(['low', 'medium', 'high']),
  deadline: z.number().int().positive(),
});
export const controlSchema = z.strictObject({
  version: z.literal(1),
  ...identity,
  leaseUntil: z.number().int().positive(),
  cancel: z.boolean(),
});
export const resultSchema = z.strictObject({
  version: z.literal(1),
  ...identity,
  state: z.enum([
    'DOWNLOADING',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
    'CANCELLED',
  ]),
  progress: z.number().int().min(0).max(99),
  indeterminate: z.boolean(),
  code: z
    .string()
    .regex(/^[A-Z_]{1,60}$/)
    .nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type Command = z.infer<typeof commandSchema>;
export type Result = z.infer<typeof resultSchema>;
export function sameExecution(
  a: z.infer<typeof identitySchema>,
  b: z.infer<typeof identitySchema>,
) {
  return (
    a.operationId === b.operationId &&
    a.jobId === b.jobId &&
    a.attemptId === b.attemptId &&
    a.generation === b.generation
  );
}
export const identitySchema = z.object(identity);
