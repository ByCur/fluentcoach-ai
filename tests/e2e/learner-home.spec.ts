import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { openLearnerPage } from './learner-navigation.js';

async function readyLearner(page: Page) {
  await page.goto('/');
  const login = await page.request.post('/api/v1/auth/synthetic-login', {
    headers: { Origin: 'http://127.0.0.1:4173' },
    data: { subject: `learner-home-${randomUUID()}` },
  });
  expect(login.status()).toBe(201);
  const { csrfToken } = await login.json() as { csrfToken: string };
  const saved = await page.request.post('/api/v1/onboarding/complete', {
    headers: { Origin: 'http://127.0.0.1:4173', 'x-csrf-token': csrfToken },
    data: {
      profile: { interfaceLanguage: 'es', nativeLanguage: 'es', timezone: 'Europe/Madrid', cefrLevel: 'A2', interests: ['viajes'] },
      goal: { minutesPerDay: 10, daysPerWeek: 3 },
      consent: { purpose: 'local-ai-practice', policyVersion: 'privacy-2026-10-05', providerDisclosureVersion: 'local-first-2026-10-05', accepted: true },
    },
  });
  expect(saved.status()).toBe(201);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Tu espacio de inglés' })).toBeVisible();
}

test('home order, read-only recommendations, profile destinations and keyboard focus', async ({ page }) => {
  await readyLearner(page);
  await expect(page.locator('.learner-home h2')).toHaveText([
    'Practicar ahora', 'Recomendado para ti', 'Lo que debo mejorar', 'Mi progreso',
  ]);
  await expect(page.getByRole('region', { name: 'Lo que debo mejorar' })).toContainText('Aún no hay aspectos');
  await expect(page.getByRole('region', { name: 'Mi progreso' })).toContainText('0.0 de 30');
  expect(await (await page.request.get('/api/v1/plans/current')).json()).toEqual({ active: null, proposal: null });
  const trigger = page.getByRole('button', { name: 'Abrir menú de perfil' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('navigation', { name: 'Mi aprendizaje' });
  await expect(menu.getByRole('button')).toHaveText([
    'Mi perfil', 'Mis recomendaciones', 'Lo que debo mejorar', 'Mi vocabulario', 'Mi plan', 'Mi progreso', 'Cerrar sesión',
  ]);
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('button', { name: 'Mi perfil', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(menu).toHaveCount(0);
  for (const name of ['Mi perfil', 'Mis recomendaciones', 'Lo que debo mejorar', 'Mi vocabulario', 'Mi plan', 'Mi progreso']) {
    await openLearnerPage(page, name);
    await expect(page.getByRole('heading', { level: 1, name })).toBeFocused();
  }
  await openLearnerPage(page, 'Mi perfil');
  await page.getByRole('button', { name: 'Privacidad y tus datos' }).click();
  await expect(page.getByRole('button', { name: 'Exportar mis datos', exact: true })).toBeVisible();
  await expect(trigger).toBeVisible();
});

test('home uses the accepted plan and vocabulary due count; one failed summary does not hide the others', async ({ page }) => {
  await readyLearner(page);
  await openLearnerPage(page, 'Mi plan');
  await page.getByRole('button', { name: 'Preparar mi plan' }).click();
  const proposal = page.getByRole('article', { name: 'Propuesta de plan' });
  const title = await proposal.getByRole('heading', { level: 4 }).first().innerText();
  await proposal.getByRole('button', { name: 'Aceptar plan' }).click();
  await expect(page.getByRole('article', { name: 'Plan activo' })).toBeVisible();
  await page.route('**/api/v1/progress', async (route) => {
    const response = await route.fetch();
    const metrics = await response.json() as Record<string, unknown>;
    await route.fulfill({ json: { ...metrics, dueCards: 3 } });
  });
  await page.route('**/api/v1/issues', (route) => route.fulfill({ status: 503, json: {} }));
  await page.getByRole('button', { name: 'Inicio', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Recomendado para ti' })).toContainText(title);
  await expect(page.getByRole('region', { name: 'Recomendado para ti' })).toContainText('3 expresiones pendientes');
  await expect(page.getByRole('region', { name: 'Lo que debo mejorar' })).toContainText('No pudimos cargar');
  await expect(page.getByRole('region', { name: 'Mi progreso' })).toContainText('0.0 de 30');
  await page.unroute('**/api/v1/issues');
  await page.getByRole('button', { name: 'Volver a cargar' }).click();
  await expect(page.getByRole('region', { name: 'Lo que debo mejorar' })).toContainText('Aún no hay aspectos');
  await page.getByRole('button', { name: 'Repasar mi vocabulario' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mi vocabulario' })).toBeVisible();
});

test('continue keeps the same practice after home navigation and reload; logout invalidates the server session', async ({ page }) => {
  await readyLearner(page);
  await page.getByRole('button', { name: 'Practicar ahora', exact: true }).click();
  await expect(page.getByLabel('Nivel de práctica')).toHaveValue('A2');
  await page.getByRole('button', { name: 'Empezar práctica' }).click();
  const id = await page.locator('[data-session]').getAttribute('data-session');
  await page.getByRole('button', { name: 'Inicio', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar práctica', exact: true }).click();
  await expect(page.locator('[data-session]')).toHaveAttribute('data-session', id!);
  await page.reload();
  await page.getByRole('button', { name: 'Continuar práctica', exact: true }).click();
  await expect(page.locator('[data-session]')).toHaveAttribute('data-session', id!);
  await page.route('**/api/v1/auth/logout', (route) => route.fulfill({ status: 503, json: {} }));
  await openLearnerPage(page, 'Cerrar sesión');
  await expect(page.getByRole('alert')).toContainText('No pudimos cerrar la sesión');
  await expect(page.locator('[data-session]')).toHaveAttribute('data-session', id!);
  await page.unroute('**/api/v1/auth/logout');
  await openLearnerPage(page, 'Cerrar sesión');
  await expect(page.getByRole('button', { name: /Entrar/ })).toBeVisible();
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  await expect(page.getByRole('button', { name: 'Abrir menú de perfil' })).toHaveCount(0);
});

test('home and profile menu fit a narrow screen without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await readyLearner(page);
  await page.getByRole('button', { name: 'Abrir menú de perfil' }).click();
  const menu = await page.getByRole('navigation', { name: 'Mi aprendizaje' }).boundingBox();
  expect(menu!.x).toBeGreaterThanOrEqual(0);
  expect(menu!.x + menu!.width).toBeLessThanOrEqual(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
});

test('returning settings report a failed goal save and allow retry without changing consent', async ({ page }) => {
  await readyLearner(page);
  await openLearnerPage(page, 'Mi perfil');
  const consent = await (await page.request.get('/api/v1/consent')).json() as unknown[];
  await page.getByLabel(/Intereses/).fill('lectura');
  await page.getByLabel('Minutos por día').fill('20');
  await page.route('**/api/v1/practice-goal', (route) => route.request().method() === 'PUT'
    ? route.fulfill({ status: 503, json: {} }) : route.continue());
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('status')).toContainText('Tu perfil se guardó, pero no pudimos guardar tu ritmo');
  expect(await (await page.request.get('/api/v1/practice-goal')).json()).toMatchObject({ minutesPerDay: 10 });
  expect(await (await page.request.get('/api/v1/learner-profile')).json()).toMatchObject({ interests: ['lectura'] });
  await page.unroute('**/api/v1/practice-goal');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('status')).toContainText('Cambios guardados');
  expect(await (await page.request.get('/api/v1/practice-goal')).json()).toMatchObject({ minutesPerDay: 20 });
  expect(await (await page.request.get('/api/v1/consent')).json()).toEqual(consent);
});
