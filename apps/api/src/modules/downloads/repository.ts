import { createHash } from 'node:crypto';
import {
  Prisma,
  type PrismaClient,
  type AnonymousContext,
} from '@prisma/client';
import {
  activeStatuses,
  limits,
  type CreateDownload,
  type ListQuery,
} from '@videoflow/shared';
import { AppError, notFound } from '../../common/errors.js';

export const jobInclude = {
  artifact: true,
  attempts: { orderBy: { sequence: 'asc' as const } },
} satisfies Prisma.DownloadJobInclude;
export type StoredJob = Prisma.DownloadJobGetPayload<{
  include: typeof jobInclude;
}>;
type Tx = Prisma.TransactionClient;

export class DownloadRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private scope(contextId: string): Prisma.DownloadJobWhereInput {
    return { contextId, historyExpiresAt: { gt: this.now() } };
  }
  private async expire(contextId: string, tx: Tx) {
    await tx.downloadJob.updateMany({
      where: {
        contextId,
        status: 'COMPLETED',
        artifact: { expiresAt: { lte: this.now() } },
      },
      data: { status: 'EXPIRED' },
    });
  }
  async find(contextId: string, id: string, tx: Tx = this.db) {
    await this.expire(contextId, tx);
    const job = await tx.downloadJob.findFirst({
      where: { ...this.scope(contextId), id },
      include: jobInclude,
    });
    if (!job) throw notFound();
    return job;
  }
  async list(contextId: string, query: ListQuery) {
    const scope = this.scope(contextId);
    const where: Prisma.DownloadJobWhereInput = {
      ...scope,
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.format ? { format: query.format } : {}),
    };
    const [field, order] = query.sort.split(':');
    const orderBy: Prisma.DownloadJobOrderByWithRelationInput[] = [
      { [field!]: order },
      { id: 'asc' },
    ];
    // Uma única fotografia para página, total e indicadores.
    return this.db.$transaction(
      async (tx) => {
        await this.expire(contextId, tx);
        const [items, total, grouped] = await Promise.all([
          tx.downloadJob.findMany({
            where,
            include: jobInclude,
            orderBy,
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
          }),
          tx.downloadJob.count({ where }),
          tx.downloadJob.groupBy({
            by: ['status'],
            where: scope,
            _count: true,
          }),
        ]);
        const count = (statuses: string[]) =>
          grouped
            .filter((g) => statuses.includes(g.status))
            .reduce((n, g) => n + g._count, 0);
        return {
          items,
          total,
          page: query.page,
          pageSize: query.pageSize,
          summary: {
            total: count(grouped.map((g) => g.status)),
            active: count(activeStatuses),
            completed: count(['COMPLETED']),
            failed: count(['FAILED']),
            cancelled: count(['CANCELLED']),
            expired: count(['EXPIRED']),
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  private async lock(tx: Tx, contextId: string) {
    // Ordem global → contexto, compartilhada por criação, cancelamento e retry.
    for (const key of ['global', `context:${contextId}`]) {
      await tx.$executeRaw`INSERT INTO "QuotaCounter" ("key", "active") VALUES (${key}, 0) ON CONFLICT ("key") DO NOTHING`;
      await tx.$queryRaw`SELECT "key" FROM "QuotaCounter" WHERE "key" = ${key} FOR UPDATE`;
    }
  }
  private async quotas(tx: Tx, contextId: string, admitting: boolean) {
    const where = { status: { in: activeStatuses } };
    const global = await tx.downloadJob.count({ where });
    const own = await tx.downloadJob.count({ where: { ...where, contextId } });
    if (admitting && own >= limits.perContext)
      throw new AppError(
        429,
        'ACTIVE_LIMIT',
        'Limite de trabalhos ativos deste navegador atingido.',
      );
    if (admitting && global >= limits.globalActive)
      throw new AppError(
        503,
        'CAPACITY_EXCEEDED',
        'Capacidade de processamento esgotada.',
      );
    await tx.quotaCounter.update({
      where: { key: 'global' },
      data: { active: global },
    });
    await tx.quotaCounter.update({
      where: { key: `context:${contextId}` },
      data: { active: own },
    });
  }
  private async replay(
    tx: Tx,
    contextId: string,
    key: string,
    requestHash: string,
  ) {
    const record = await tx.idempotencyRecord.findUnique({
      where: { contextId_key: { contextId, key } },
    });
    if (!record) return null;
    if (record.requestHash !== requestHash)
      throw new AppError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'A chave já foi usada para outra operação.',
      );
    return this.find(contextId, record.jobId, tx);
  }
  async create(context: AnonymousContext, input: CreateDownload, key: string) {
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify([
          'create',
          input.inspectionId,
          input.format,
          input.quality,
          input.rightsConfirmed,
        ]),
      )
      .digest('hex');
    return this.db.$transaction(
      async (tx) => {
        await this.lock(tx, context.id);
        const replay = await this.replay(tx, context.id, key, requestHash);
        if (replay) return replay;
        const inspection = await tx.mediaInspection.findFirst({
          where: { id: input.inspectionId, contextId: context.id },
        });
        if (!inspection) throw notFound();
        if (inspection.expiresAt <= this.now())
          throw new AppError(
            409,
            'INSPECTION_EXPIRED',
            'Consulte os metadados novamente.',
          );
        if (!inspection.availableFormats.includes(input.format))
          throw new AppError(
            422,
            'FORMAT_UNAVAILABLE',
            'Formato indisponível para esta mídia.',
          );
        await this.quotas(tx, context.id, true);
        const job = await tx.downloadJob.create({
          data: {
            contextId: context.id,
            sourceUrl: inspection.sourceUrl,
            title: inspection.title,
            source: inspection.source,
            durationSeconds: inspection.durationSeconds,
            format: input.format,
            quality: input.quality,
            historyExpiresAt: new Date(
              Math.min(
                context.expiresAt.getTime(),
                this.now().getTime() + 30 * 86400000,
              ),
            ),
            events: { create: { generation: 1, type: 'PROCESS' } },
            idempotency: {
              create: { contextId: context.id, key, requestHash },
            },
          },
          include: jobInclude,
        });
        await this.quotas(tx, context.id, false);
        return job;
      },
      { timeout: 10000 },
    );
  }
  async cancel(contextId: string, id: string) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, contextId);
      const job = await this.find(contextId, id, tx);
      if (job.status === 'CANCELLED') return { job, alreadyCancelled: true };
      if (!activeStatuses.includes(job.status))
        throw new AppError(
          409,
          'INVALID_STATE',
          'Este trabalho não pode ser cancelado.',
        );
      const changed = await tx.downloadJob.updateMany({
        where: {
          id,
          contextId,
          status: job.status,
          generation: job.generation,
        },
        data: { status: 'CANCELLED', cancelRequestedAt: this.now() },
      });
      if (!changed.count)
        throw new AppError(
          409,
          'INVALID_STATE',
          'O estado do trabalho mudou. Atualize a consulta.',
        );
      await tx.outboxEvent.upsert({
        where: {
          jobId_generation_type: {
            jobId: id,
            generation: job.generation,
            type: 'CANCEL',
          },
        },
        create: { jobId: id, generation: job.generation, type: 'CANCEL' },
        update: {},
      });
      await this.quotas(tx, contextId, false);
      return {
        job: await this.find(contextId, id, tx),
        alreadyCancelled: false,
      };
    });
  }
  async retry(contextId: string, id: string, key: string) {
    const requestHash = createHash('sha256')
      .update(`retry:${id}`)
      .digest('hex');
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, contextId);
      const replay = await this.replay(tx, contextId, key, requestHash);
      if (replay) return replay;
      const job = await this.find(contextId, id, tx);
      if (job.status !== 'FAILED' || job.attemptCount >= limits.maxAttempts)
        throw new AppError(
          409,
          'INVALID_STATE',
          'Este trabalho não admite nova tentativa.',
        );
      await this.quotas(tx, contextId, true);
      const changed = await tx.downloadJob.updateMany({
        where: { id, contextId, status: 'FAILED', generation: job.generation },
        data: {
          status: 'PENDING',
          progress: 0,
          progressIndeterminate: true,
          generation: { increment: 1 },
          cycle: { increment: 1 },
          errorCode: null,
          errorMessage: null,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      if (!changed.count)
        throw new AppError(409, 'INVALID_STATE', 'O estado do trabalho mudou.');
      await tx.outboxEvent.create({
        data: { jobId: id, generation: job.generation + 1, type: 'PROCESS' },
      });
      await tx.idempotencyRecord.create({
        data: { contextId, key, requestHash, jobId: id },
      });
      await this.quotas(tx, contextId, false);
      return this.find(contextId, id, tx);
    });
  }
}
