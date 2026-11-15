import type { PrismaClient } from '@prisma/client';
export class ContextRepository {
  constructor(private readonly db: PrismaClient) {}
  find(hash: string, now: Date) {
    return this.db.anonymousContext.findFirst({
      where: { tokenHash: hash, expiresAt: { gt: now } },
    });
  }
  create(tokenHash: string, expiresAt: Date) {
    return this.db.anonymousContext.create({ data: { tokenHash, expiresAt } });
  }
}
