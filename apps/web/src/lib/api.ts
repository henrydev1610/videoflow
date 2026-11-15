import { z } from 'zod';
import {
  contextSchema,
  dataSchema,
  detailSchema,
  jobSchema,
  listResponseSchema,
  errorSchema,
  type ListQuery,
} from '@videoflow/shared';
export type Job = z.infer<typeof jobSchema>;
export const inspectionSchema = z.strictObject({
  inspectionId: z.uuid(),
  expiresAt: z.iso.datetime(),
  title: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  thumbnailUrl: z.string().nullable(),
  source: z.string().nullable(),
  availableFormats: z.array(z.enum(['mp3', 'mp4'])),
  warnings: z.array(z.string()),
});
export type Inspection = z.infer<typeof inspectionSchema>;
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
export const contextLost = new EventTarget();
let contextEpoch = 0;
contextLost.addEventListener('lost', () => {
  contextEpoch++;
});
export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestInit = {},
  timeout = 15000,
): Promise<T> {
  const epoch = contextEpoch;
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(abort, timeout);
  try {
    const response = await fetch(`/api${path}`, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const error = errorSchema.safeParse(body);
      const code = error.success ? error.data.error.code : 'HTTP_ERROR';
      if (code === 'CONTEXT_REQUIRED')
        contextLost.dispatchEvent(new Event('lost'));
      throw new ApiError(
        code,
        error.success
          ? error.data.error.message
          : 'Não foi possível concluir a solicitação.',
        response.status,
      );
    }
    if (epoch !== contextEpoch)
      throw new ApiError(
        'CONTEXT_REQUIRED',
        'O contexto mudou. Os dados anteriores foram descartados.',
        403,
      );
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted)
      throw new ApiError(
        'TIMEOUT',
        'A solicitação foi interrompida. Tente novamente.',
      );
    throw new ApiError(
      'NETWORK_ERROR',
      'Não foi possível conectar ao VideoFlow. Tente novamente.',
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
export const initialize = () =>
  request('/context', dataSchema(contextSchema), {
    method: 'POST',
    body: '{}',
  });
export const list = (query: ListQuery, signal?: AbortSignal) =>
  request(
    `/downloads?${new URLSearchParams(
      Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, String(v)]),
    )}`,
    listResponseSchema,
    { signal },
  );
export const detail = (id: string, signal?: AbortSignal) =>
  request(`/downloads/${encodeURIComponent(id)}`, dataSchema(detailSchema), {
    signal,
  }).then((r) => r.data);
export const inspect = (url: string, signal?: AbortSignal) =>
  request(
    '/media/inspect',
    dataSchema(inspectionSchema),
    { method: 'POST', body: JSON.stringify({ url }), signal },
    35000,
  ).then((r) => r.data);
export const mutateJob = (path: string, body: unknown, key?: string) =>
  request(path, dataSchema(jobSchema), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: key ? { 'idempotency-key': key } : {},
  }).then((r) => r.data);
export const qualityLabels = { low: 'Baixa', medium: 'Média', high: 'Alta' };
export const statusLabels = {
  PENDING: 'Na fila',
  DOWNLOADING: 'Baixando',
  PROCESSING: 'Convertendo',
  COMPLETED: 'Concluído',
  FAILED: 'Falhou',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Expirado',
};
export const isActive = (job: Job) =>
  ['PENDING', 'DOWNLOADING', 'PROCESSING'].includes(job.status);
export const pollInterval = (active: boolean, visible: boolean) =>
  active && visible ? 2000 : false;
export function bytes(value: string | null) {
  if (value === null) return 'Não informado';
  const n = BigInt(value);
  if (n < 1024n) return `${n} B`;
  for (const [size, label] of [
    [1024n ** 3n, 'GB'],
    [1024n ** 2n, 'MB'],
    [1024n, 'KB'],
  ] as const)
    if (n >= size) return `${Number((n * 10n) / size) / 10} ${label}`;
  return '0 B';
}
export const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—';
export function validMediaUrl(value: string) {
  try {
    const u = new URL(value);
    return (
      ['http:', 'https:'].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      (!u.port || ['80', '443'].includes(u.port)) &&
      value.length <= 2048
    );
  } catch {
    return false;
  }
}
