import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const id = '11111111-1111-4111-8111-111111111111';
const job = {
  id,
  title:
    'Vídeo autorizado de demonstração com um título suficientemente longo para testar a tabela',
  source: 'fixture',
  format: 'mp4',
  quality: 'medium',
  status: 'PROCESSING',
  progress: 76,
  progressIndeterminate: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  completedAt: null,
  fileSizeBytes: null,
  fileExpiresAt: null,
  historyExpiresAt: new Date(Date.now() + 86400000).toISOString(),
  error: null,
  canRetry: false,
  attemptCount: 1,
};
const inspection = {
  inspectionId: id,
  expiresAt: new Date(Date.now() + 600000).toISOString(),
  title: 'Mídia autorizada',
  source: null,
  durationSeconds: null,
  thumbnailUrl: null,
  availableFormats: ['mp3'],
  warnings: ['SOURCE_QUALITY_LIMIT'],
};
async function fixture(page: Page, items: unknown[] = [job]) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let body: unknown = {
      data: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
    };
    if (url.pathname === '/api/downloads')
      body = {
        items,
        total: items.length,
        page: 1,
        pageSize: 20,
        summary: {
          total: 42,
          completed: 30,
          active: items.length ? 1 : 0,
          failed: 5,
          cancelled: 6,
          expired: 0,
        },
      };
    else if (url.pathname.endsWith('/inspect')) body = { data: inspection };
    else if (url.pathname === `/api/downloads/${id}`)
      body = { data: { ...job, attempts: [] } };
    await route.fulfill({ json: body });
  });
}
test('navegação direta, indicadores do servidor, filtros e detalhes', async ({
  page,
}) => {
  await fixture(page);
  await page.goto('/');
  await expect(page.getByText('42', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Atividades recentes' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Histórico', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Pesquisar solicitações' })
    .fill('vídeo');
  await expect(page).toHaveURL(/q=v/);
  await page
    .getByRole('combobox', { name: 'Formato', exact: true })
    .selectOption('mp3');
  await expect(page).toHaveURL(/format=mp3/);
  await page.getByRole('button', { name: /Detalhes de/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Detalhes da solicitação' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Configurações', exact: true }).click();
  await page.getByLabel('Tema', { exact: true }).selectOption('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByLabel('Formato padrão').selectOption('mp3');
  await page.getByRole('link', { name: 'Novo Download', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Novo download' }),
  ).toBeVisible();
});
test('formulário, opção indisponível, direitos e criação idempotente', async ({
  page,
}) => {
  await fixture(page, []);
  let creations = 0;
  const keys: string[] = [];
  await page.route('**/api/downloads', async (route) => {
    if (route.request().method() === 'POST') {
      creations++;
      keys.push(route.request().headers()['idempotency-key']!);
      await new Promise((r) => setTimeout(r, 300));
      await route.fulfill({
        status: 202,
        json: { data: { ...job, status: 'PENDING' } },
      });
    } else await route.fallback();
  });
  await page.goto('/new');
  await page.getByLabel('URL da mídia').fill('file:///bad');
  await page.getByRole('button', { name: 'Consultar mídia' }).click();
  await expect(page.getByText(/Informe uma URL HTTP/)).toBeVisible();
  await page.getByLabel('URL da mídia').fill('https://example.com/video');
  await page.getByRole('button', { name: 'Consultar mídia' }).click();
  await expect(page.getByText('Duração não informada')).toBeVisible();
  await expect(page.getByRole('radio', { name: /MP4/ })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Iniciar processamento' }),
  ).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Iniciar processamento' }).dblclick();
  await expect(page).toHaveURL(/downloads\?job=/);
  expect(creations).toBe(1);
  expect(keys[0]).toMatch(/^[a-f0-9-]{36}$/);
});
test('troca de URL invalida inspeção, timeout e estado vazio filtrado', async ({
  page,
}) => {
  await fixture(page, []);
  await page.goto('/new');
  await page.getByLabel('URL da mídia').fill('https://example.com/a');
  await page.getByRole('button', { name: 'Consultar mídia' }).click();
  await expect(
    page.getByText('Mídia autorizada', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('URL da mídia').fill('https://example.com/b');
  await expect(page.getByText('Mídia autorizada', { exact: true })).toHaveCount(
    0,
  );
  await page.route('**/api/media/inspect', (r) =>
    r.fulfill({
      status: 504,
      json: {
        error: {
          code: 'INSPECTION_TIMEOUT',
          message: 'A inspeção excedeu o prazo permitido.',
          requestId: 'test',
        },
      },
    }),
  );
  await page.getByRole('button', { name: 'Consultar mídia' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'prazo' }),
  ).toBeVisible();
  await page.goto('/history?q=nada');
  await expect(
    page.getByRole('heading', { name: 'Nenhuma solicitação encontrada' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(page).toHaveURL('/history');
});
test('conflito de cancelamento não anuncia sucesso e restaura foco', async ({
  page,
}) => {
  await fixture(page);
  await page.route('**/api/downloads/*/cancel', (r) =>
    r.fulfill({
      status: 409,
      json: {
        error: {
          code: 'INVALID_STATE',
          message: 'O trabalho já foi concluído.',
          requestId: 'test',
        },
      },
    }),
  );
  await page.goto('/downloads');
  const trigger = page.getByRole('button', { name: /^Cancelar / });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar cancelamento' }).click();
  await expect(page.getByText('O trabalho já foi concluído.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.getByText('Solicitação cancelada.')).toHaveCount(0);
});
test('erro sem números falsos e perda de contexto apaga dados privados', async ({
  page,
}) => {
  await fixture(page);
  await page.goto('/');
  await expect(page.getByText('42', { exact: true })).toBeVisible();
  await page.route('**/api/downloads?*', (r) =>
    r.fulfill({
      status: 403,
      json: {
        error: {
          code: 'CONTEXT_REQUIRED',
          message: 'Inicie novo contexto.',
          requestId: 'test',
        },
      },
    }),
  );
  await expect(
    page.getByRole('heading', { name: 'Seu acesso anterior expirou' }),
  ).toBeVisible({ timeout: 6000 });
  await expect(page.getByText(job.title, { exact: true })).toHaveCount(0);
  await expect(page.getByText('42', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Iniciar novo espaço' }),
  ).toBeVisible();
});
test('preferências resilientes, tema do sistema e revisão visual em seis tamanhos/temas', async ({
  page,
}) => {
  await fixture(page);
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('preference-fixture')) {
      localStorage.setItem('videoflow.preferences.v1', 'invalid');
      sessionStorage.setItem('preference-fixture', '1');
    }
  });
  await page.goto('/settings');
  await expect(page.getByLabel('Tema', { exact: true })).toHaveValue('system');
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  for (const theme of ['light', 'dark'] as const) {
    await page.getByLabel('Tema', { exact: true }).selectOption(theme);
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/history');
      await expect(
        page.getByRole('heading', { name: 'Histórico', exact: true }),
      ).toBeVisible();
      if (theme === 'dark')
        await expect(page.locator('html')).toHaveClass(/dark/);
      const accessibility = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      expect(accessibility.violations).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `.impeccable/review/dashboard-${theme}-${width}.png`,
        fullPage: true,
      });
      if (width === 360) {
        await page.getByRole('button', { name: 'Abrir navegação' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.keyboard.press('Escape');
      }
    }
    await page.goto('/settings');
  }
});

test('falha inicial e atualização falha preservam dados com aviso', async ({
  page,
}) => {
  await fixture(page);
  let fail = true;
  await page.route('**/api/downloads?*', async (r) => {
    if (fail)
      await r.fulfill({
        status: 503,
        json: {
          error: {
            code: 'UNAVAILABLE',
            message: 'Serviço indisponível.',
            requestId: 'test',
          },
        },
      });
    else await r.fallback();
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Serviço indisponível');
  await expect(page.getByText('42', { exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('42', { exact: true })).toBeVisible();
  fail = true;
  await expect(page.getByRole('alert')).toContainText('Dados desatualizados', {
    timeout: 6000,
  });
  await expect(page.getByText('42', { exact: true })).toBeVisible();
});

test('polling suspende oculto e terminal; progresso indeterminado e expiração local', async ({
  page,
}) => {
  await fixture(page);
  let calls = 0;
  let terminal = false;
  await page.route('**/api/downloads?*', (r) => {
    calls++;
    return r.fulfill({
      json: {
        items: [
          {
            ...job,
            progressIndeterminate: true,
            ...(terminal
              ? {
                  status: 'COMPLETED',
                  fileExpiresAt: new Date(Date.now() + 1500).toISOString(),
                }
              : {}),
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        summary: {
          total: 1,
          active: terminal ? 0 : 1,
          completed: terminal ? 1 : 0,
          failed: 0,
          cancelled: 0,
          expired: 0,
        },
      },
    });
  });
  await page.goto('/downloads');
  await expect(page.getByText('Aguardando estimativa')).toBeVisible();
  await expect(page.getByRole('progressbar')).not.toHaveAttribute(
    'aria-valuenow',
  );
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenCalls = calls;
  await page.waitForTimeout(2500);
  expect(calls).toBe(hiddenCalls);
  terminal = true;
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('link', { name: /^Baixar / })).toBeVisible({
    timeout: 6000,
  });
  await expect(page.getByRole('link', { name: /^Baixar / })).toHaveCount(0, {
    timeout: 4000,
  });
  const finishedCalls = calls;
  await page.waitForTimeout(2500);
  expect(calls).toBe(finishedCalls);
});

test('inspeção vencida impede criação; storage bloqueado mantém preferências em memória', async ({
  page,
}) => {
  await fixture(page);
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw Error('blocked');
    };
  });
  await page.goto('/settings');
  await page.getByLabel('Tema', { exact: true }).selectOption('dark');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.route('**/api/media/inspect', (r) =>
    r.fulfill({
      json: {
        data: {
          ...inspection,
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      },
    }),
  );
  let created = false;
  await page.route('**/api/downloads', async (r) => {
    if (r.request().method() === 'POST') created = true;
    await r.fallback();
  });
  await page.getByRole('link', { name: 'Novo Download', exact: true }).click();
  await page.getByLabel('URL da mídia').fill('https://example.com/a');
  await page.getByRole('button', { name: 'Consultar mídia' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Iniciar processamento' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: /expir|venc/i }),
  ).toBeVisible();
  expect(created).toBe(false);
});

test('filtros na URL restauram busca ao voltar e detalhes devolvem foco', async ({
  page,
}) => {
  await fixture(page);
  await page.goto('/history?q=primeiro&page=2');
  const search = page.getByRole('textbox', { name: 'Pesquisar solicitações' });
  await search.fill('segundo');
  await expect(page).toHaveURL(/page=1/);
  await page.goBack();
  await expect(search).toHaveValue('primeiro');
  await page.waitForTimeout(400);
  await expect(page).toHaveURL(/page=2/);
  const trigger = page.getByRole('button', { name: /Detalhes de/ });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('detalhes preservam dados na falha e anunciam validade restante e expirada', async ({
  page,
}) => {
  await fixture(page);
  let fail = false;
  const expiresAt = new Date(Date.now() + 6000).toISOString();
  await page.route('**/api/downloads/' + id, (r) =>
    fail
      ? r.fulfill({
          status: 503,
          json: {
            error: {
              code: 'UNAVAILABLE',
              message: 'Detalhes indisponíveis.',
              requestId: 'test',
            },
          },
        })
      : r.fulfill({
          json: { data: { ...job, fileExpiresAt: expiresAt, attempts: [] } },
        }),
  );
  await page.goto('/history?job=' + id);
  await expect(page.getByText(/Disponível por mais/)).toBeVisible();
  fail = true;
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Dados desatualizados',
    { timeout: 6000 },
  );
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: job.title }),
  ).toBeVisible();
  await expect(page.getByText(/Arquivo expirado/)).toBeVisible({
    timeout: 8000,
  });
  await page.screenshot({
    path: '.impeccable/review/detail-stale-expired.png',
    fullPage: true,
  });
});

test('contraste, teclado e temas nas demais páginas e no diálogo', async ({
  page,
}) => {
  await fixture(page);
  for (const theme of ['light', 'dark']) {
    await page.goto('/settings');
    await page.getByLabel('Tema', { exact: true }).selectOption(theme);
    for (const path of ['/', '/new', '/downloads', '/settings']) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      if (path === '/new') {
        await page.getByLabel('URL da mídia').fill('https://example.com/a');
        await page.getByRole('button', { name: 'Consultar mídia' }).click();
        await expect(page.getByRole('checkbox')).toBeVisible();
      }
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(() => document.activeElement !== document.body),
      ).toBe(true);
    }
    await page.goto('/downloads');
    await page.getByRole('button', { name: /^Cancelar / }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.keyboard.press('Escape');
  }
});

test('skeleton, dashboard vazio e retry não autorizado', async ({ page }) => {
  await fixture(page, []);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/downloads?*', async (r) => {
    await gate;
    await r.fallback();
  });
  await page.goto('/');
  await expect(
    page.getByRole('status', { name: 'Carregando solicitações' }),
  ).toBeVisible();
  release();
  await expect(
    page.getByRole('heading', { name: 'Seu próximo arquivo começa aqui' }),
  ).toBeVisible();
  await page.unroute('**/api/downloads?*');
  await fixture(page, [{ ...job, status: 'FAILED', canRetry: true }]);
  await page.route('**/api/downloads/*/retry', (r) =>
    r.fulfill({
      status: 404,
      json: {
        error: {
          code: 'NOT_FOUND',
          message: 'Solicitação não encontrada.',
          requestId: 'test',
        },
      },
    }),
  );
  await page.goto('/downloads');
  await page.getByRole('button', { name: /^Repetir / }).click();
  await expect(
    page.getByText('Solicitação não encontrada.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Nova tentativa agendada.', { exact: true }),
  ).toHaveCount(0);
});
