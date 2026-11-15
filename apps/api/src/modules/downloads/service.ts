import type { AnonymousContext } from '@prisma/client';
import {
  detailSchema,
  jobSchema,
  type CreateDownload,
  type ListQuery,
} from '@videoflow/shared';
import { parseSourceUrl } from '@videoflow/shared/security';
import type { DownloadRepository, StoredJob } from './repository.js';

export function toJobDto(job: StoredJob, now = new Date()) {
  const expired =
    job.status === 'COMPLETED' &&
    !!job.artifact &&
    job.artifact.expiresAt <= now;
  return jobSchema.parse({
    id: job.id,
    title: job.title,
    source: job.source,
    format: job.format,
    quality: job.quality,
    status: expired ? 'EXPIRED' : job.status,
    progress: job.progress,
    progressIndeterminate: job.progressIndeterminate,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    fileSizeBytes: job.artifact?.bytes.toString() ?? null,
    fileExpiresAt: job.artifact?.expiresAt.toISOString() ?? null,
    historyExpiresAt: job.historyExpiresAt.toISOString(),
    error: job.errorCode
      ? {
          code: job.errorCode,
          message: job.errorMessage ?? 'Falha no processamento.',
        }
      : null,
    canRetry: job.status === 'FAILED' && job.attemptCount < 9,
    attemptCount: job.attemptCount,
  });
}
export class DownloadService {
  constructor(
    private readonly repository: DownloadRepository,
    private readonly allowlist: string[] = [],
  ) {}
  async create(context: AnonymousContext, input: CreateDownload, key: string) {
    return toJobDto(await this.repository.create(context, input, key));
  }
  async list(contextId: string, query: ListQuery) {
    const result = await this.repository.list(contextId, query);
    return { ...result, items: result.items.map((j) => toJobDto(j)) };
  }
  async detail(contextId: string, id: string) {
    const job = await this.repository.find(contextId, id);
    return detailSchema.parse({
      ...toJobDto(job),
      attempts: job.attempts.map((a) => ({
        id: a.id,
        sequence: a.sequence,
        cycle: a.cycle,
        startedAt: a.startedAt.toISOString(),
        finishedAt: a.finishedAt?.toISOString() ?? null,
        outcome: a.outcome,
        error: a.errorCode
          ? {
              code: a.errorCode,
              message: a.errorMessage ?? 'Falha no processamento.',
            }
          : null,
      })),
    });
  }
  async cancel(contextId: string, id: string) {
    const result = await this.repository.cancel(contextId, id);
    return { ...result, job: toJobDto(result.job) };
  }
  async retry(contextId: string, id: string, key: string) {
    const existing = await this.repository.find(contextId, id);
    parseSourceUrl(existing.sourceUrl, this.allowlist);
    return toJobDto(await this.repository.retry(contextId, id, key));
  }
}
