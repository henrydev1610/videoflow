import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
describe.skipIf(process.env.RUN_MEDIA !== '1')(
  'worker e ferramentas reais',
  () => {
    it('publica seis combinações de mídia sintética pelo gateway/sandbox', async () => {
      const db = new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
      });
      const context = await db.anonymousContext.create({
        data: {
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      try {
        const cases = ['mp3', 'mp4'].flatMap((format) =>
          ['low', 'medium', 'high'].map((quality) => ({
            format,
            quality,
            sourceUrl: 'http://fixture/video.mp4',
          })),
        );
        cases.push(
          ...['chunked.mp4', 'stream.m3u8'].map((path) => ({
            format: 'mp4',
            quality: 'low',
            sourceUrl: `http://fixture/${path}`,
          })),
        );
        cases.push({
          format: 'mp3',
          quality: 'high',
          sourceUrl: 'http://fixture/low-audio.mp3',
        });
        for (const { format, quality, sourceUrl } of cases) {
          const job = await db.downloadJob.create({
            data: {
              contextId: context.id,
              sourceUrl,
              title: 'Synthetic fixture',
              source: 'fixture',
              format,
              quality,
              historyExpiresAt: context.expiresAt,
              events: { create: { type: 'PROCESS', generation: 1 } },
            },
          });
          await expect
            .poll(
              async () => {
                const current = await db.downloadJob.findUniqueOrThrow({
                  where: { id: job.id },
                });
                if (current.status === 'FAILED')
                  throw new Error(current.errorCode ?? 'FAILED');
                return current.status;
              },
              { timeout: 90000, interval: 500 },
            )
            .toBe('COMPLETED');
          const completed = await db.downloadJob.findUniqueOrThrow({
            where: { id: job.id },
            include: { artifact: true, attempts: true },
          });
          expect(completed.progress).toBe(100);
          expect(completed.attempts).toHaveLength(1);
          expect(completed.artifact).not.toBeNull();
          const probe = JSON.parse(
            execFileSync(
              'ffprobe',
              [
                '-v',
                'error',
                '-show_streams',
                '-show_format',
                '-of',
                'json',
                join(
                  process.env.ARTIFACT_ROOT!,
                  completed.artifact!.storageKey,
                ),
              ],
              { encoding: 'utf8' },
            ),
          );
          const streams = probe.streams as Array<{
            codec_type: string;
            codec_name: string;
            height: number;
            pix_fmt: string;
            bit_rate: string;
          }>;
          const audio = streams.find((s) => s.codec_type === 'audio')!;
          expect(audio.codec_name).toBe(format === 'mp3' ? 'mp3' : 'aac');
          if (format === 'mp4') {
            const video = streams.find((s) => s.codec_type === 'video')!;
            expect(video.codec_name).toBe('h264');
            expect(video.pix_fmt).toBe('yuv420p');
            expect(video.height).toBeLessThanOrEqual(
              quality === 'low' ? 360 : 480,
            );
          } else
            expect(Number(audio.bit_rate)).toBe(
              (
                { low: 96000, medium: 192000, high: 320000 } as Record<
                  string,
                  number
                >
              )[quality],
            );
          console.log(
            JSON.stringify({
              format,
              quality,
              jobId: job.id,
              fixture: sourceUrl.split('/').pop(),
              bytes: completed.artifact!.bytes.toString(),
              checksum: completed.artifact!.checksum,
              outcome: 'COMPLETED',
            }),
          );
        }
      } finally {
        await db.$disconnect();
      }
    }, 600000);
  },
);
