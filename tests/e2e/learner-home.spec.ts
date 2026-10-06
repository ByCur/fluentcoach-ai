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
  await expect(page.getByRole('heading', { level: 1, name: 'Tu ruta de inglés · A2' })).toBeVisible();
}

test('roadmap home has one next action, profile destinations and keyboard focus', async ({page}) => {
  await readyLearner(page);
  await expect(page.getByRole('button', {name: 'Continuar mi ruta'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Práctica libre'})).toBeVisible();
  const trigger = page.getByRole('button', {name: 'Abrir menú de perfil'});
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('navigation', {name: 'Mi aprendizaje'});
  await expect(menu.getByRole('button')).toHaveText([
    'Mi perfil', 'Mi progreso', 'Lo que debo mejorar', 'Mi vocabulario', 'Privacidad', 'Cerrar sesión',
  ]);
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('button', {name: 'Mi perfil', exact: true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  for (const name of ['Mi perfil', 'Mi progreso', 'Lo que debo mejorar', 'Mi vocabulario']) {
    await openLearnerPage(page, name);
    await expect(page.getByRole('heading', {level: 1, name})).toBeFocused();
  }
  await openLearnerPage(page, 'Privacidad');
  await expect(page.getByRole('button', {name: 'Exportar mis datos', exact: true})).toBeVisible();
});

test('failed roadmap loading offers an inline retry and keeps optional practice available', async ({page}) => {
  await readyLearner(page);
  await page.route('**/api/v1/roadmap', route => route.fulfill({status: 503, json: {}}));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('No pudimos cargar tu ruta');
  await expect(page.getByRole('button', {name: 'Práctica libre'})).toBeVisible();
  await page.unroute('**/api/v1/roadmap');
  await page.getByRole('button', {name: 'Volver a intentar'}).click();
  await expect(page.getByRole('button', {name: 'Continuar mi ruta'})).toBeVisible();
});

test('leaving Home during a committed start keeps the destination open and resumes the same session later', async ({page}) => {
  await readyLearner(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => {release = resolve;});
  let committed!: (id: string) => void;
  const sessionId = new Promise<string>(resolve => {committed = resolve;});
  let delivered!: () => void;
  const delivery = new Promise<void>(resolve => {delivered = resolve;});
  const startUrl = '**/api/v1/plans/*/activities/*/start';
  await page.route(startUrl, async route => {
    const response = await route.fetch();
    committed((await response.json() as {sessionId: string}).sessionId);
    await held;
    await route.fulfill({response});
    delivered();
  });
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  const id = await sessionId;
  await openLearnerPage(page, 'Mi perfil');
  release();
  await delivery;
  // Let the released response and any resulting render settle before checking the destination.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole('heading', {level: 1, name: 'Mi perfil'})).toBeVisible();
  await expect(page.locator('[data-session]')).toHaveCount(0);
  await page.unroute(startUrl);
  await page.getByRole('button', {name: 'Inicio', exact: true}).click();
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.locator('[data-session]')).toHaveAttribute('data-session', id);
  expect(await (await page.request.get('/api/v1/sessions')).json() as unknown[]).toHaveLength(1);
});

test('continue keeps the same practice after home navigation and reload; logout invalidates the server session', async ({ page }) => {
  await readyLearner(page);
  await page.getByRole('button', { name: 'Práctica libre', exact: true }).click();
  await expect(page.getByLabel('Nivel de práctica')).toHaveValue('A2');
  await page.getByRole('button', { name: 'Empezar práctica' }).click();
  const id = await page.locator('[data-session]').getAttribute('data-session');
  await page.getByRole('button', { name: 'Inicio', exact: true }).click();
  await page.getByRole('button', { name: 'Práctica libre', exact: true }).click();
  await expect(page.locator('[data-session]')).toHaveAttribute('data-session', id!);
  await page.reload();
  await page.getByRole('button', { name: 'Práctica libre', exact: true }).click();
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
