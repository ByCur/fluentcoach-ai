import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';
import type { LearningPlan, SessionRecord } from '@fluentcoach/application';
import { openLearnerPage } from './learner-navigation.js';

async function onboard(page: Page, interests = 'viajes') {
  await page.goto('/');
  await page.route('**/api/v1/auth/synthetic-login', route => route.continue({
    postData: JSON.stringify({subject: `roadmap-${randomUUID()}`}),
  }));
  await page.getByRole('button', {name: /Entrar/}).click();
  await page.getByLabel('B1').check();
  await page.getByLabel(/Intereses/).fill(interests);
  await page.getByRole('button', {name: 'Continuar', exact: true}).click();
  await page.getByRole('button', {name: 'Continuar', exact: true}).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', {name: 'Aceptar y guardar'}).click();
  await expect(page.getByRole('button', {name: 'Continuar mi ruta'})).toBeVisible();
}
async function roadmap(page: Page) {
  const value = await (await page.request.get('/api/v1/plans/current')).json() as {active: LearningPlan; proposal: null};
  expect(value.proposal).toBeNull();
  expect(value.active.state).toBe('active');
  return value.active;
}
async function finish(page: Page, text = 'Yesterday I went to the station') {
  await page.getByLabel('Tu respuesta').pressSequentially(text, {delay: 35});
  await page.getByRole('button', {name: 'Enviar', exact: true}).click();
  await expect(page.getByLabel('Tu respuesta')).toHaveValue('');
  await page.getByRole('button', {name: 'Terminar', exact: true}).click();
  await page.getByRole('button', {name: 'Inicio', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Continuar mi ruta'})).toBeVisible();
}

test('onboarding creates one active roadmap automatically; interests order the expanded adult topics', async ({page}) => {
  await onboard(page);
  const route = await roadmap(page);
  expect(route.sourceSnapshot).toMatchObject({level: 'B1', interests: ['viajes']});
  expect(route.activities[0]?.scenarioSlug).toBe('travel');
  expect(route.activities).toHaveLength(14);
  expect(new Set(route.activities.map(a => a.id)).size).toBe(14);
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Tu ruta de inglés · B1');
  await expect(page.getByText(/Plan activo|Propuesta|Aceptar plan|Actualizar plan|Omitir conversación/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', {name: 'Continuar mi ruta'})).toBeVisible();
  expect((await roadmap(page)).id).toBe(route.id);
  await openLearnerPage(page, 'Mi perfil');
  await page.getByLabel(/Intereses/).fill('cocina');
  await page.getByRole('button', {name: 'Guardar cambios'}).click();
  await expect(page.getByRole('status')).toContainText('Cambios guardados');
  await page.getByRole('button', {name: 'Inicio', exact: true}).click();
  await expect(page.locator('.current-step h2')).toContainText('restaurante');
  expect((await roadmap(page)).activities[0]?.scenarioSlug).toBe('restaurant');
});

test('current conversation starts immediately, resumes after reload, finishes and advances with no duplicated session', async ({page}) => {
  await onboard(page);
  const route = await roadmap(page), first = route.activities[0]!;
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.getByLabel('Tu respuesta')).toBeVisible();
  const sessionId = await page.locator('[data-session]').getAttribute('data-session');
  expect(sessionId).toBeTruthy();
  await page.getByLabel('Tu respuesta').fill('I travel by train');
  await page.getByRole('button', {name: 'Enviar', exact: true}).click();
  await expect(page.getByLabel('Tu respuesta')).toHaveValue('');
  await page.getByRole('button', {name: 'Inicio', exact: true}).click();
  await page.reload();
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.locator('[data-session]')).toHaveAttribute('data-session', sessionId!);
  await expect(page.getByText('Tú: I travel by train', {exact: true})).toBeVisible();
  await finish(page);
  const next = await roadmap(page);
  expect(next.activities.find(a => a.id === first.id)?.state).toBe('completed');
  expect(next.activities.find(a => a.state === 'pending')?.scenarioSlug).not.toBe(first.scenarioSlug);
  await expect(page.locator('.roadmap-timeline .completed')).toContainText('Completada');
  expect((await (await page.request.get('/api/v1/sessions')).json() as SessionRecord[])).toHaveLength(1);
  await openLearnerPage(page, 'Mi progreso');
  await expect(page.getByTestId('completed-sessions')).toContainText('1');
  await expect(page.getByTestId('speaking-minutes')).toHaveText('0.0');
  const metrics = await (await page.request.get('/api/v1/progress')).json() as {textMinutes: number};
  expect(metrics.textMinutes).toBeGreaterThan(0);
});

test('regression: lost conversation-start acknowledgement retries the original version and creates exactly one session', async ({page}) => {
  await onboard(page);
  const original = await roadmap(page);
  const bodies: unknown[] = [];
  await page.route('**/api/v1/plans/*/activities/*/start', async route => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort('connectionreset');
    } else await route.continue();
  });
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.getByRole('alert')).toContainText('No pudimos abrir esta práctica');
  await expect(page.getByRole('button', {name: 'Continuar mi ruta'})).toBeEnabled();
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.getByLabel('Tu respuesta')).toBeVisible();
  expect(bodies).toEqual([{expectedVersion: original.version}, {expectedVersion: original.version}]);
  expect((await (await page.request.get('/api/v1/sessions')).json() as SessionRecord[])).toHaveLength(1);
});

test('creation failure is inline, leaves the activity pending, and a rapid retry starts only once', async ({page}) => {
  await onboard(page);
  await page.route('**/api/v1/plans/*/activities/*/start', route => route.fulfill({status: 503, json: {}}));
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.getByRole('alert')).toContainText('Vuelve a intentarlo');
  expect((await roadmap(page)).activities[0]?.state).toBe('pending');
  expect(await (await page.request.get('/api/v1/sessions')).json()).toEqual([]);
  await page.unroute('**/api/v1/plans/*/activities/*/start');
  await page.getByRole('button', {name: 'Continuar mi ruta'}).dblclick();
  await expect(page.getByLabel('Tu respuesta')).toBeVisible();
  expect((await (await page.request.get('/api/v1/sessions')).json() as SessionRecord[])).toHaveLength(1);
});

test('recurring issues adapt upcoming steps; confirmed due vocabulary creates and completes a short review', async ({page}) => {
  test.setTimeout(90000);
  await onboard(page);
  for (let session = 0; session < 2; session++) {
    await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
    for (let turn = 0; turn < 2; turn++) {
      await page.getByLabel('Tu respuesta').fill(`Yesterday I go to the hotel ${session}-${turn}`);
      await page.getByRole('button', {name: 'Enviar', exact: true}).click();
      await expect(page.getByLabel('Tu respuesta')).toHaveValue('');
    }
    await page.getByRole('button', {name: 'Terminar'}).click();
    await expect(page.getByRole('region', {name: 'Informe de sesión'}).getByRole('status')).toContainText('Informe listo', {timeout: 15000});
    await page.getByRole('button', {name: 'Inicio', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Continuar mi ruta'})).toBeVisible();
  }
  await expect(page.locator('.current-step h2')).toContainText('Practica:');
  await expect(page.getByText('He adaptado las próximas prácticas según lo que estás trabajando.')).toBeVisible();
  const before = await roadmap(page);
  expect(before.activities.filter(a => a.state === 'completed')).toHaveLength(2);
  const ids = before.activities.filter(a => a.state === 'completed').map(a => a.id);
  // Dismissing the issue removes its upcoming practice without disturbing completed history.
  await openLearnerPage(page, 'Lo que debo mejorar');
  await page.getByRole('button', {name: /Descartar ·/}).first().click();
  await openLearnerPage(page, 'Mi vocabulario');
  await page.getByRole('button', {name: 'Añadir al repaso'}).first().click();
  await page.getByRole('button', {name: 'Inicio', exact: true}).click();
  await expect(page.locator('.current-step h2')).toHaveText('Repasa tus expresiones');
  expect((await roadmap(page)).activities.filter(a => a.state === 'completed').map(a => a.id)).toEqual(ids);
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.getByRole('heading', {level: 1, name: 'Mi vocabulario'})).toBeVisible();
  await page.getByRole('button', {name: 'Bien', exact: true}).first().click();
  await expect(page.getByRole('heading', {level: 1, name: 'Tu ruta de inglés · B1'})).toBeVisible();
  await expect(page.locator('.roadmap-timeline .completed')).toHaveCount(3);
  expect((await roadmap(page)).activities.find(a => a.state === 'pending')?.type).toBe('conversation');
});


test('session hydration failure is visible and retry resumes the committed conversation without creating another', async ({page}) => {
  await onboard(page);
  const sessionRead = (url: URL) => /\/api\/v1\/sessions\/[a-f0-9-]+$/.test(url.pathname);
  await page.route(sessionRead, route => route.fulfill({status: 503, json: {}}));
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.getByRole('alert')).toContainText('No pudimos cargar la práctica');
  const id = await page.locator('[data-session]').getAttribute('data-session');
  await page.unroute(sessionRead);
  await page.getByRole('button', {name: 'Inicio', exact: true}).click();
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.locator('[data-session]')).toHaveAttribute('data-session', id!);
  await expect(page.getByRole('button', {name: 'Enviar', exact: true})).toBeEnabled();
  expect((await (await page.request.get('/api/v1/sessions')).json() as SessionRecord[])).toHaveLength(1);
});


test('a short roadmap review shows only its five assigned cards and advances automatically', async ({page}) => {
  test.setTimeout(90000);
  await onboard(page);
  const {id: accountId} = await (await page.request.get('/api/v1/me')).json() as {id: string};
  // Execute the canonical synthetic fixture in its own TS runtime, outside Playwright's browser transform.
  await promisify(execFile)(process.execPath, ['--import', 'tsx', 'tests/support/roadmap-vocabulary-fixture.ts', accountId], {timeout: 30000});
  await page.reload();
  await expect(page.locator('.current-step h2')).toHaveText('Repasa tus expresiones');
  const route = await roadmap(page), step = route.activities.find(a => a.state === 'pending')!;
  expect(step.cardIds).toHaveLength(5);
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.getByRole('heading', {name: 'Un repaso breve'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Añadir al repaso'})).toHaveCount(0);
  for (let remaining = 5; remaining > 0; remaining--) {
    await expect(page.getByText(`${remaining} expresiones por repasar. Después continuarás tu ruta.`)).toBeVisible();
    await page.getByRole('button', {name: 'Bien', exact: true}).click();
  }
  await expect(page.getByRole('heading', {level: 1, name: 'Tu ruta de inglés · B1'})).toBeVisible();
  await expect(page.locator('.roadmap-timeline .completed')).toHaveCount(1);
  const due = await (await page.request.get('/api/v1/vocabulary/reviews/due')).json() as {id: string}[];
  expect(due).toHaveLength(1);
  expect(step.cardIds).not.toContain(due[0]!.id);
});
