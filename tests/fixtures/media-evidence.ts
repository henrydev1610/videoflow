import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
try {
  const jobs = await db.downloadJob.findMany({
    where: { status: 'COMPLETED', source: 'fixture' },
    include: { artifact: true, attempts: true },
    orderBy: { createdAt: 'asc' },
  });
  const evidence = jobs
    .filter((job) => job.artifact)
    .map((job) => ({
      jobId: job.id,
      format: job.format,
      quality: job.quality,
      bytes: job.artifact!.bytes.toString(),
      checksum: job.artifact!.checksum,
      attempts: job.attempts.map((attempt) => ({
        sequence: attempt.sequence,
        outcome: attempt.outcome,
        errorCode: attempt.errorCode,
      })),
      probe: JSON.parse(
        execFileSync(
          'ffprobe',
          [
            '-v',
            'error',
            '-show_streams',
            '-show_format',
            '-of',
            'json',
            join(process.env.ARTIFACT_ROOT!, job.artifact!.storageKey),
          ],
          { encoding: 'utf8' },
        ),
      ),
    }));
  console.log(
    JSON.stringify({ date: new Date().toISOString(), evidence }, null, 2),
  );
} finally {
  await db.$disconnect();
}
