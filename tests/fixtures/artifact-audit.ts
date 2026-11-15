import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
try {
  const jobs = await db.downloadJob.findMany({
    where: {
      id: {
        in: [
          'ccd6e2e2-303e-44bf-868a-cffff6d0cc19',
          '84887cf2-1c5f-4840-986b-66994502db97',
          'f96e7854-c0dd-4b4e-9c30-227c465c77d2',
        ],
      },
    },
    include: { artifact: true },
  });
  assert.equal(jobs.length, 3);
  for (const job of jobs) {
    assert.ok(job.artifact);
    const file = await readFile(
      join(process.env.ARTIFACT_ROOT!, job.artifact.storageKey),
    );
    const moov = file.indexOf(Buffer.from('moov'));
    const mdat = file.indexOf(Buffer.from('mdat'));
    assert.ok(moov > 0 && mdat > moov);
    console.log(
      JSON.stringify({
        jobId: job.id,
        quality: job.quality,
        moov,
        mdat,
        faststart: true,
      }),
    );
  }
} finally {
  await db.$disconnect();
}
