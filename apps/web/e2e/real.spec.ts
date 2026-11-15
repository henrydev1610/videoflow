import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import pg from 'pg';
async function sql(statement: string) {
  if (process.env.E2E_DATABASE_URL) {
    const client = new pg.Client({
      connectionString: process.env.E2E_DATABASE_URL,
    });
    await client.connect();
    try {
      return await client.query(statement);
    } finally {
      await client.end();
    }
  }
  return execFileSync(
    'docker',
    [
      'compose',
      '-f',
      'compose.media.yaml',
      '-f',
      'compose.media.fixture.yaml',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'videoflow',
      '-d',
      'videoflow_test',
      '-v',
      'ON_ERROR_STOP=1',
      '-Atc',
      statement,
    ],
    { encoding: 'utf8' },
  );
}
test.skip(
  process.env.RUN_WEB_REAL !== '1',
  'Requer API, Redis, PostgreSQL, worker, gateway e fixture Compose reais.',
);
test('fluxo real, streaming e isolamento de dois navegadores', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  await page.goto('/new');
  await page.getByLabel('URL da mídia').fill('http://fixture/video.mp4');
  await page.getByRole('button', { name: 'Consultar mídia' }).click();
  await expect(page.getByRole('checkbox')).toBeVisible({ timeout: 35000 });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Iniciar processamento' }).click();
  await expect(page).toHaveURL(/downloads\?job=/);
  const id = new URL(page.url()).searchParams.get('job')!;
  await expect(
    page.getByRole('dialog').getByText('Concluído', { exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await page.keyboard.press('Escape');
  const range = await page.request.get(`/api/downloads/${id}/file`, {
    headers: { range: 'bytes=0-31' },
  });
  expect(range.status()).toBe(206);
  expect((await range.body()).length).toBe(32);
  expect(range.headers()['content-range']).toMatch(/^bytes 0-31\//);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: /^Baixar / }).click();
  expect((await download).suggestedFilename()).toContain(id);
  const other = await browser.newContext();
  const stranger = await other.newPage();
  await stranger.goto('/downloads');
  await expect(
    stranger.getByRole('heading', { name: 'Seu próximo arquivo começa aqui' }),
  ).toBeVisible();
  const forbidden = await stranger.request.get(`/api/downloads/${id}`);
  expect(forbidden.status()).toBe(404);
  expect(
    (await stranger.request.get(`/api/downloads/${id}/file`)).status(),
  ).toBe(404);
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === 'videoflow_context')?.httpOnly).toBe(
    true,
  );
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    'videoflow_context',
  );
  await page.getByRole('link', { name: 'Histórico', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /Detalhes de/ }).first(),
  ).toBeVisible();
  // Test-only database setup: existing terminal failures exercise real retry,
  // worker and cancel endpoints, without intercepting any HTTP response.
  const retryId = randomUUID();
  const cancelId = randomUUID();
  for (const [seedId, title, source] of [
    [retryId, 'Retry autorizado', 'video.mp4'],
    [cancelId, 'Cancelar autorizado', 'slow.mp4'],
  ]) {
    await sql(
      `INSERT INTO "DownloadJob" (id,"contextId","sourceUrl",title,source,format,quality,status,"attemptCount","updatedAt","historyExpiresAt","errorCode","errorMessage") SELECT '${seedId}',"contextId",'http://fixture/${source}','${title}','fixture','mp4','low','FAILED',1,now(),now()+interval '30 days','NETWORK_ERROR','Falha de rede de teste' FROM "DownloadJob" WHERE id='${id}'`,
    );
  }
  await page.reload();
  await page
    .getByRole('button', { name: 'Repetir Retry autorizado', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Baixar Retry autorizado', exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await page
    .getByRole('button', { name: 'Repetir Cancelar autorizado', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/downloads/${cancelId}`)).json())
          .data.status,
    )
    .toBe('DOWNLOADING');
  await page
    .getByRole('button', { name: 'Cancelar Cancelar autorizado', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirmar cancelamento' }).click();
  await expect(
    page.getByText('Solicitação cancelada.', { exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/downloads/${cancelId}`)).json())
          .data.status,
    )
    .toBe('CANCELLED');
  for (let n = 0; n < 11; n++) {
    await sql(
      `INSERT INTO "DownloadJob" (id,"contextId","sourceUrl",title,source,format,quality,status,"updatedAt","historyExpiresAt") SELECT '${randomUUID()}',"contextId",'http://fixture/video.mp4','Histórico de teste ${n}','fixture','mp3','low','CANCELLED',now(),now()+interval '30 days' FROM "DownloadJob" WHERE id='${id}'`,
    );
  }
  await page.getByRole('combobox', { name: 'Por página' }).selectOption('10');
  await expect(page.locator('tbody tr')).toHaveCount(10);
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await page
    .getByRole('textbox', { name: 'Pesquisar solicitações' })
    .fill('Retry autorizado');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page).toHaveURL(/page=1/);
  await page.getByRole('link', { name: 'Configurações', exact: true }).click();
  await page.getByLabel('Tema', { exact: true }).selectOption('dark');
  await page.getByLabel('Formato padrão').selectOption('mp3');
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByLabel('Formato padrão')).toHaveValue('mp3');
  await sql(
    `UPDATE "FileArtifact" SET "expiresAt"=now()-interval '1 minute' WHERE "jobId"='${id}'`,
  );
  await page.getByRole('link', { name: 'Histórico', exact: true }).click();
  expect((await page.request.get(`/api/downloads/${id}/file`)).status()).toBe(
    410,
  );
  await expect(page.locator(`a[href="/api/downloads/${id}/file"]`)).toHaveCount(
    0,
  );
  const completed = (
    await (await page.request.get(`/api/downloads/${retryId}`)).json()
  ).data;
  const cancelled = (
    await (await page.request.get(`/api/downloads/${cancelId}`)).json()
  ).data;
  mkdirSync('docs/verification/dashboard-evidence', { recursive: true });
  writeFileSync(
    'docs/verification/dashboard-evidence/real-worker.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        createdJobId: id,
        retry: completed,
        cancelled,
        foreignStatus: forbidden.status(),
        expiredFileStatus: 410,
        note: 'Retry/cancel start from test-only FAILED rows; all actions, worker execution and responses are real.',
      },
      null,
      2,
    ),
  );
  await sql(
    `UPDATE "AnonymousContext" SET "expiresAt"=now()-interval '1 minute' WHERE id=(SELECT "contextId" FROM "DownloadJob" WHERE id='${id}')`,
  );
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Seu acesso anterior expirou' }),
  ).toBeVisible();
  await expect(page.locator('tbody')).toHaveCount(0);
  await stranger.reload();
  await expect(
    stranger.getByRole('heading', { name: 'Seu próximo arquivo começa aqui' }),
  ).toBeVisible();
  await other.close();
});
