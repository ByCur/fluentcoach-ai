import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
async function onboard(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.route('**/api/v1/auth/synthetic-login', (route) =>
    route.continue({
      postData: JSON.stringify({ subject: `e2e-progress-${randomUUID()}` }),
    }),
  );
  await page.getByRole('button', { name: /Entrar/ }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Aceptar y guardar' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Configuración guardada',
  );
  await page.getByRole('button', { name: 'Practicar' }).click();
}
test('starter proposal, skip, accept and refresh preserve explicit lifecycle across reload', async ({
  page,
}) => {
  await onboard(page);
  const plan = page.getByRole('region', { name: 'Tu plan de práctica' });
  await plan.getByRole('button', { name: 'Generar/Ver propuesta' }).click();
  await expect(plan).toContainText('Aún no hay suficientes datos');
  const proposal = plan.getByRole('article', { name: 'Propuesta de plan' });
  await proposal
    .getByRole('button', { name: /Omitir/ })
    .first()
    .click();
  await expect(proposal).toContainText('Omitida');
  await proposal.getByRole('button', { name: 'Aceptar plan' }).click();
  await expect(
    plan.getByRole('article', { name: 'Plan activo' }),
  ).toBeVisible();
  await plan.getByRole('button', { name: 'Actualizar plan' }).click();
  await expect(
    plan.getByRole('article', { name: 'Propuesta de plan' }),
  ).toBeVisible();
  await expect(
    plan.getByRole('article', { name: 'Plan activo' }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Practicar' }).click();
  await expect(
    plan.getByRole('article', { name: 'Plan activo' }),
  ).toBeVisible();
  await expect(
    plan.getByRole('article', { name: 'Propuesta de plan' }),
  ).toBeVisible();
  await plan.getByRole('button', { name: 'Aceptar plan' }).click();
  await expect(
    plan.getByRole('article', { name: 'Propuesta de plan' }),
  ).toHaveCount(0);
});
test('linked conversation completes only after successful end; text stays separate from speaking', async ({
  page,
}) => {
  await onboard(page);
  const plan = page.getByRole('region', { name: 'Tu plan de práctica' });
  await plan.getByRole('button', { name: 'Generar/Ver propuesta' }).click();
  await plan.getByRole('button', { name: 'Aceptar plan' }).click();
  await plan
    .getByRole('button', { name: /Practicar Conversación/ })
    .first()
    .click();
  await page
    .getByLabel('Tu respuesta')
    .pressSequentially('I want a room', { delay: 60 });
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByLabel('Tu respuesta')).toHaveValue('');
  await page.getByRole('button', { name: 'Terminar' }).click();
  await expect(
    plan.getByRole('article', { name: 'Plan activo' }),
  ).toContainText('Completada');
  await expect(page.getByTestId('completed-sessions')).toContainText('1');
  await expect(page.getByTestId('speaking-minutes')).toHaveText('0.0');
  const metrics = await page.evaluate(
    async () =>
      (await (await fetch('/api/v1/progress')).json()) as {
        textMinutes: number;
        speakingMinutes: number;
      },
  );
  expect(metrics.textMinutes).toBeGreaterThan(0);
  expect(metrics.speakingMinutes).toBe(0);
});
