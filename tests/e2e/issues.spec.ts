import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
test('synthetic sessions cross threshold, expose exact evidence, dismiss across reload and restore', async ({
  page,
}) => {
  await page.goto('/');
  await page.route('**/api/v1/auth/synthetic-login', (route) =>
    route.continue({
      postData: JSON.stringify({ subject: `e2e-issues-${randomUUID()}` }),
    }),
  );
  await page.getByRole('button', { name: /Entrar/ }).click();
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
  const priorities = page.getByRole('region', {
    name: 'Prioridades recurrentes',
  });
  await expect(
    priorities.getByRole('heading', { name: 'Tiempos verbales' }),
  ).toHaveCount(0);
  for (const [sessionIndex, count] of [
    [1, 2],
    [2, 1],
  ] as const) {
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    for (let turn = 0; turn < count; turn++) {
      const text = `Yesterday I go to hotel session ${sessionIndex} turn ${turn}`;
      await page.getByLabel('Tu respuesta').fill(text);
      await page.getByRole('button', { name: 'Enviar', exact: true }).click();
      await expect(
        page.getByText(`learner: ${text}`, { exact: true }),
      ).toBeVisible();
    }
    await page.getByRole('button', { name: 'Terminar' }).click();
    const report = page.getByRole('region', { name: 'Informe de sesión' });
    await expect(report.getByRole('status')).toContainText('Informe listo', {
      timeout: 15000,
    });
    await report.getByRole('button', { name: 'Cerrar informe' }).click();
    await priorities
      .getByRole('button', { name: 'Actualizar prioridades' })
      .click();
    if (sessionIndex === 1)
      await expect(
        priorities.getByRole('heading', { name: 'Tiempos verbales' }),
      ).toHaveCount(0);
  }
  await expect(
    priorities.getByRole('heading', { name: 'Tiempos verbales' }),
  ).toBeVisible();
  await expect(
    priorities.getByText('3 observaciones · 2 sesiones · últimos 30 días'),
  ).toBeVisible();
  await priorities
    .getByText('Ver ejemplos · Tiempos verbales', { exact: true })
    .click();
  await expect(
    priorities.getByText('Yesterday I go to hotel session 1 turn 0', {
      exact: true,
    }),
  ).toBeVisible();
  await priorities
    .getByRole('button', { name: 'Descartar · Tiempos verbales' })
    .click();
  await expect(
    priorities.getByRole('heading', { name: 'Tiempos verbales' }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Practicar' }).click();
  await expect(
    priorities.getByRole('heading', { name: 'Tiempos verbales' }),
  ).toHaveCount(0);
  await priorities
    .getByText('Prioridades descartadas', { exact: true })
    .click();
  await priorities
    .getByRole('button', { name: 'Restaurar · Tiempos verbales' })
    .click();
  await expect(
    priorities.getByRole('heading', { name: 'Tiempos verbales' }),
  ).toBeVisible();
});
