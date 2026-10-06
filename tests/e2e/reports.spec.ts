import { test, expect, type Page } from '@playwright/test';
async function start(page: Page) {
  await page.goto('/');
  const login = page.getByRole('button', { name: /Entrar/ });
  await expect(login).toBeVisible();
  await login.click();
  await expect(
    page.getByRole('heading', { name: 'Prepara tu aprendizaje' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Aceptar y guardar' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Configuración guardada',
  );
  await page.getByRole('button', { name: 'Practicar' }).click();
  await page.getByLabel('Escenario').selectOption('hotel');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}
test('automatic report cites actual learner text and survives history reload', async ({
  page,
}) => {
  await start(page);
  await page.getByLabel('Tu respuesta').fill('I need a room for two nights');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByText(/learner:.*I need a room/)).toBeVisible();
  await page.getByRole('button', { name: 'Terminar' }).click();
  const panel = page.getByRole('region', { name: 'Informe de sesión' });
  await expect(panel.getByRole('status')).toContainText('Informe listo', {
    timeout: 15000,
  });
  await expect(panel.getByText('Tu turno 1')).toBeVisible();
  await expect(
    panel.getByText('I need a room for two nights', { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText(/no certifica tu nivel/)).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Practicar' }).click();
  await page
    .getByRole('button', { name: 'Ver historial', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Ver informe · hotel' })
    .first()
    .click();
  await expect(
    page.getByRole('region', { name: 'Informe de sesión' }).getByRole('status'),
  ).toContainText('Informe listo');
});
test('provider failure is visible and report retry recovers without duplicating the session', async ({
  page,
}) => {
  await start(page);
  await page.getByLabel('Tu respuesta').fill('SYNTHETIC_REPORT_FAILURE');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(
    page.getByText(/learner:.*SYNTHETIC_REPORT_FAILURE/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Terminar' }).click();
  const panel = page.getByRole('region', { name: 'Informe de sesión' });
  await expect(panel.getByRole('status')).toContainText(
    'Tu sesión se conserva',
    { timeout: 15000 },
  );
  await panel.getByRole('button', { name: 'Reintentar informe' }).click();
  await expect(panel.getByRole('status')).toContainText('Informe listo', {
    timeout: 15000,
  });
  await expect(
    panel.getByText('SYNTHETIC_REPORT_FAILURE', { exact: true }),
  ).toBeVisible();
});
test('empty session explicitly has no fabricated feedback', async ({
  page,
}) => {
  await start(page);
  await page.getByRole('button', { name: 'Terminar' }).click();
  const panel = page.getByRole('region', { name: 'Informe de sesión' });
  await expect(panel.getByRole('status')).toContainText(
    'Sin respuestas para analizar',
  );
  await expect(panel.getByRole('heading', { name: 'Fortalezas' })).toHaveCount(
    0,
  );
});
test('failed report fetch offers visible reload recovery', async ({ page }) => {
  await start(page);
  await page.getByLabel('Tu respuesta').fill('Hello');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByText(/learner:.*Hello/)).toBeVisible();
  await page.route('**/api/v1/sessions/*/report', (route) =>
    route.fulfill({ status: 503, body: 'unavailable' }),
  );
  await page.getByRole('button', { name: 'Terminar' }).click();
  const panel = page.getByRole('region', { name: 'Informe de sesión' });
  await expect(panel.getByRole('status')).toContainText('No pudimos cargar');
  await page.unroute('**/api/v1/sessions/*/report');
  await panel.getByRole('button', { name: 'Volver a cargar' }).click();
  await expect(panel.getByRole('status')).toContainText('Informe listo', {
    timeout: 15000,
  });
});
test('conversation provider failure preserves input and retries with the same request key', async ({
  page,
}) => {
  await start(page);
  let firstKey = '';
  await page.route('**/api/v1/sessions/*/turns', async (route) => {
    const input = route.request().postDataJSON() as { sourceEventKey: string };
    firstKey = input.sourceEventKey;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'unavailable',
          message:
            'El proveedor no está disponible. Puedes volver a intentarlo.',
        },
      }),
    });
    await page.unroute('**/api/v1/sessions/*/turns');
  });
  await page.getByLabel('Tu respuesta').fill('Can I book a room?');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'proveedor no está disponible',
  );
  await expect(page.getByLabel('Tu respuesta')).toHaveValue(
    'Can I book a room?',
  );
  const request = page.waitForRequest((r) => r.url().includes('/turns'));
  await page.getByRole('button', { name: 'Reintentar respuesta' }).click();
  const payload = (await request).postDataJSON() as { sourceEventKey: string };
  expect(payload.sourceEventKey).toBe(firstKey);
  await expect(page.getByText(/learner:.*Can I book a room/)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
