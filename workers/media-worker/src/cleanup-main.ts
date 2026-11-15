import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { cleanup, cleanupTemporary } from './lifecycle.js';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
try {
  await db.$transaction(
    async (tx) => {
      const locks = await tx.$queryRaw<
        Array<{ locked: boolean }>
      >`SELECT pg_try_advisory_xact_lock(7194202) AS locked`;
      if (!locks[0]?.locked)
        throw Error('Limpeza já em execução; tente novamente.');
      await cleanup(db, process.env.ARTIFACT_ROOT ?? '/media/artifacts');
      await cleanupTemporary(
        db,
        process.env.TEMP_ROOT ?? '/media/temp',
        '/spool/commands',
        '/spool/results',
      );
    },
    { timeout: 60000 },
  );
  console.log(JSON.stringify({ event: 'retention_cleanup_completed' }));
} finally {
  await db.$disconnect();
}
