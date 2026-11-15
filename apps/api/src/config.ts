import { z } from 'zod';
const schema = z.object({
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  ORIGIN: z.url().default('http://localhost:8080'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  ARTIFACT_ROOT: z.string().min(1).default('/data/artifacts'),
  TRUSTED_PROXY: z.string().default(''),
  TRUSTED_PROXY_HOST: z.string().default(''),
  SOURCE_ALLOWLIST: z.string().default(''),
});
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const value = schema.parse(env);
  const origin = new URL(value.ORIGIN);
  if (
    origin.origin !== value.ORIGIN ||
    !['http:', 'https:'].includes(origin.protocol)
  )
    throw new Error('ORIGIN deve ser uma origem HTTP/HTTPS sem caminho.');
  return {
    ...value,
    secureCookie: origin.protocol === 'https:',
    sourceAllowlist: value.SOURCE_ALLOWLIST.split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  };
}
export type Config = ReturnType<typeof readConfig>;
