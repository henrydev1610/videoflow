import { constants } from 'node:fs';
import { mkdir, open, rename, unlink, realpath, lstat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export async function spoolPath(
  root: string,
  id: string,
  suffix: 'command' | 'control' | 'result',
) {
  z.uuid().parse(id);
  await mkdir(root, { recursive: true });
  const base = await realpath(root);
  const target = resolve(base, `${id}.${suffix}.json`);
  if (!target.startsWith(base + sep)) throw new Error('INVALID_PATH');
  return target;
}
export async function writeMessage(
  root: string,
  id: string,
  suffix: 'command' | 'control' | 'result',
  data: unknown,
) {
  const target = await spoolPath(root, id, suffix);
  const temporary = join(root, `${id}.${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(data));
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
export async function readMessage<T>(
  root: string,
  id: string,
  suffix: 'command' | 'control' | 'result',
  schema: z.ZodType<T>,
): Promise<T> {
  const target = await spoolPath(root, id, suffix);
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024)
    throw new Error('INVALID_MESSAGE');
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const buffer = Buffer.alloc(2 * 1024 * 1024 + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 2 * 1024 * 1024) throw new Error('INVALID_MESSAGE');
    return schema.parse(JSON.parse(buffer.subarray(0, bytesRead).toString()));
  } finally {
    await handle.close();
  }
}
export async function removeMessage(
  root: string,
  id: string,
  suffix: 'command' | 'control' | 'result',
) {
  await unlink(await spoolPath(root, id, suffix)).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    },
  );
}
