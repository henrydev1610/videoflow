import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { AppError } from '../common/errors.js';

export function parseRange(header: string | undefined, size: number) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0)
    throw new AppError(416, 'INVALID_RANGE', 'Faixa inválida.');
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0)
      throw new AppError(416, 'INVALID_RANGE', 'Faixa inválida.');
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    throw new AppError(416, 'INVALID_RANGE', 'Faixa inválida.');
  return { start, end };
}
export async function openArtifact(root: string, key: string) {
  const unavailable = () =>
    new AppError(410, 'FILE_UNAVAILABLE', 'Arquivo indisponível.');
  if (
    !/^[a-zA-Z0-9/_\-.]+$/.test(key) ||
    key.split('/').some((p) => !p || p === '.' || p === '..') ||
    isAbsolute(key)
  )
    throw unavailable();
  const base = await realpath(root);
  const target = resolve(base, key);
  const contained = (path: string) => {
    const rel = relative(base, path);
    return (
      rel !== '' &&
      !rel.startsWith(`..${sep}`) &&
      rel !== '..' &&
      !isAbsolute(rel)
    );
  };
  if (!contained(target)) throw unavailable();
  try {
    for (let path = target; path !== base; path = dirname(path)) {
      if ((await lstat(path)).isSymbolicLink()) throw unavailable();
    }
    if (!contained(await realpath(target))) throw unavailable();
    const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (!stat.isFile()) {
      await file.close();
      throw unavailable();
    }
    return { file, size: stat.size };
  } catch {
    throw unavailable();
  }
}
