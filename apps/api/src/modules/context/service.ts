import { createHash, randomBytes } from 'node:crypto';
import { limits } from '@videoflow/shared';
import { AppError } from '../../common/errors.js';
import type { ContextRepository } from './repository.js';
export const capabilityCookie = 'videoflow_context';
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export class ContextService {
  constructor(
    private readonly repository: ContextRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async find(token?: string) {
    return token && /^[A-Za-z0-9_-]{43}$/.test(token)
      ? this.repository.find(hashToken(token), this.now())
      : null;
  }
  async require(token?: string) {
    const context = await this.find(token);
    if (!context)
      throw new AppError(
        403,
        'CONTEXT_REQUIRED',
        'Inicie um novo contexto de navegador.',
      );
    return context;
  }
  async initialize(token?: string) {
    const existing = await this.find(token);
    if (existing)
      return { context: existing, created: false, token: undefined };
    const secret = randomBytes(32).toString('base64url');
    const context = await this.repository.create(
      hashToken(secret),
      new Date(this.now().getTime() + limits.contextDays * 86400000),
    );
    return { context, created: true, token: secret };
  }
}
