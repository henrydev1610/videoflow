import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
test.skip(
  process.env.RUN_DEV_HMR !== '1',
  'Apenas no ambiente de desenvolvimento isolado',
);
test('HMR preserva navegador e watch recarrega API em bind mounts', async ({
  page,
}) => {
  const frontend = 'apps/web/src/pages.tsx';
  const api = 'apps/api/src/modules/health/routes.ts';
  const original = readFileSync(frontend, 'utf8');
  const originalApi = readFileSync(api, 'utf8');
  try {
    await page.goto('/new');
    await expect(
      page.getByRole('heading', { name: 'Novo download', exact: true }),
    ).toBeVisible();
    writeFileSync(
      frontend,
      original.replace('<h1>Novo download</h1>', '<h1>Novo download HMR</h1>'),
    );
    await expect(
      page.getByRole('heading', { name: 'Novo download HMR', exact: true }),
    ).toBeVisible({ timeout: 15000 });
    writeFileSync(
      api,
      originalApi.replace(
        "return reply.send({ status: 'ok' as const });",
        "reply.header('x-watch-probe', 'ready'); return reply.send({ status: 'ok' as const });",
      ),
    );
    await expect
      .poll(
        async () => {
          try {
            return (await page.request.get('/api/health')).headers()[
              'x-watch-probe'
            ];
          } catch {
            return 0;
          }
        },
        { timeout: 15000 },
      )
      .toBe('ready');
  } finally {
    writeFileSync(frontend, original);
    writeFileSync(api, originalApi);
  }
});
