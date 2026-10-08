import {setSessionInitiator} from '../support/session-initiator.js';
import { randomUUID } from 'node:crypto';
import type { LearningPlan } from '@fluentcoach/application';
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
  return csrfToken;
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

async function forceRoadmapInitiator(page: Page, initiator: 'tutor'|'learner') {
  await page.route('**/api/v1/plans/*/activities/*/start', async route => {
    const response = await route.fetch();
    const body = await response.json() as {sessionId: string};
    body.sessionId = await setSessionInitiator(body.sessionId, initiator);
    await route.fulfill({response, json: body});
    await page.unroute('**/api/v1/plans/*/activities/*/start');
  });
}

async function expectNoPracticeForm(page: Page) {
  await expect(page.getByRole('heading', {name: '¿Qué quieres practicar?'})).toHaveCount(0);
  for (const name of ['Situación', 'Nivel de práctica', 'Cómo quieres practicar']) {
    await expect(page.getByRole('combobox', {name, exact: true})).toHaveCount(0);
  }
  await expect(page.getByRole('button', {name: 'Empezar práctica'})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Ver historial'})).toHaveCount(0);
}

for (const action of ['Continuar mi ruta', 'Cerrar informe']) {
  test(`roadmap session report returns to the canonical next step through ${action}`, async ({page}) => {
    await readyLearner(page);
    await expect(page.locator('.current-step')).toBeVisible();
    const firstId = await page.locator('.current-step').getAttribute('data-activity');
    let starts = 0;
    page.on('request', request => {if (request.url().endsWith('/start')) starts++;});
    await expectNoPracticeForm(page);
    await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
    await expect(page.getByRole('button', {name: 'Enviar', exact: true})).toBeEnabled();
    await page.getByLabel('Tu respuesta').fill('I would like to travel by train');
    await page.getByRole('button', {name: 'Enviar', exact: true}).click();
    await expect(page.getByLabel('Tu respuesta')).toHaveValue('');
    await page.getByRole('button', {name: 'Terminar'}).click();
    const report = page.getByRole('region', {name: 'Informe de sesión'});
    await expect(report.getByRole('status')).toContainText('Informe listo', {timeout: 15000});
    await expectNoPracticeForm(page);
    await expect(page.getByRole('button', {name: 'Práctica libre'})).toHaveCount(0);
    await expect(report.getByRole('button', {name: 'Continuar mi ruta'})).toBeVisible();
    const reloaded = page.waitForResponse(response => response.url().endsWith('/roadmap') && response.request().method() === 'POST');
    await report.getByRole('button', {name: action}).click();
    const canonical = await (await reloaded).json() as LearningPlan;
    expect(canonical.activities.find(activity => activity.id === firstId)?.state).toBe('completed');
    const next = canonical.activities.find(activity => activity.state === 'started') ?? canonical.activities.find(activity => activity.state === 'pending');
    expect(next!.id).not.toBe(firstId);
    await expect(page.getByRole('heading', {level: 1, name: 'Tu ruta de inglés · A2'})).toBeFocused();
    await expect(page.locator('.current-step')).toHaveAttribute('data-activity', next!.id);
    await expect(page.locator('.current-step h2')).toHaveText(next!.title);
    await expect(report).toHaveCount(0);
    await expectNoPracticeForm(page);
    await expect(page.getByLabel('Tu respuesta')).toHaveCount(0);
    expect(starts).toBe(1);
    expect(await (await page.request.get('/api/v1/sessions')).json() as unknown[]).toHaveLength(1);
    // Only a separate choice on Inicio opens the next conversation.
    await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
    await expect(page.getByLabel('Tu respuesta')).toBeVisible();
    expect(starts).toBe(2);
  });
}

for (const initiator of ['learner', 'tutor'] as const) {
  test(`roadmap report without learner turns returns to the canonical step without recording completion (${initiator} starts)`, async ({page}) => {
    await readyLearner(page);
    await forceRoadmapInitiator(page, initiator);
    await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
    await expect(page.getByRole('button', {name: 'Terminar'})).toBeEnabled();
    if (initiator === 'tutor') await expect(page.locator('[data-session] p')).toHaveCount(1);
    await page.getByRole('button', {name: 'Terminar'}).click();
    const report = page.getByRole('region', {name: 'Informe de sesión'});
    await expect(report.getByRole('status')).toContainText('Sin respuestas para analizar');
    await expect(report.getByRole('heading', {name: 'Lo que haces bien'})).toHaveCount(0);
    await expectNoPracticeForm(page);
    const reloaded = page.waitForResponse(response => response.url().endsWith('/roadmap') && response.request().method() === 'POST');
    await report.getByRole('button', {name: initiator === 'learner' ? 'Continuar mi ruta' : 'Cerrar informe'}).click();
    const canonical = await (await reloaded).json() as LearningPlan;
    const next = canonical.activities.find(activity => activity.state === 'started') ?? canonical.activities.find(activity => activity.state === 'pending');
    await expect(page.getByRole('heading', {level: 1, name: 'Tu ruta de inglés · A2'})).toBeVisible();
    await expect(page.locator('.current-step')).toHaveAttribute('data-activity', next!.id);
    await expect(page.getByLabel('Tu respuesta')).toHaveCount(0);
    expect(canonical.activities.filter(activity => activity.state === 'completed')).toHaveLength(0);
    expect(await (await page.request.get('/api/v1/sessions')).json() as unknown[]).toHaveLength(1);
  });
}

test('free practice selection requires the explicit home action, including after closing current and historical reports', async ({page}) => {
  await readyLearner(page);
  await expectNoPracticeForm(page);
  await page.getByRole('button', {name: 'Práctica libre'}).click();
  for (const name of ['Situación', 'Nivel de práctica', 'Cómo quieres practicar']) {
    await expect(page.getByRole('combobox', {name, exact: true})).toBeVisible();
  }
  await page.getByLabel('Situación').selectOption('hotel');
  await page.getByRole('button', {name: 'Empezar práctica'}).click();
  await expect(page.getByRole('button', {name: 'Terminar'})).toBeEnabled();
  await page.getByRole('button', {name: 'Terminar'}).click();
  const report = page.getByRole('region', {name: 'Informe de sesión'});
  await expect(report.getByRole('status')).toContainText('Sin respuestas para analizar');
  await expectNoPracticeForm(page);
  await report.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.getByRole('heading', {level: 1, name: 'Tu ruta de inglés · A2'})).toBeVisible();
  await expectNoPracticeForm(page);
  await page.getByRole('button', {name: 'Práctica libre'}).click();
  await expect(page.getByLabel('Nivel de práctica')).toHaveValue('A2');
  await page.getByRole('button', {name: 'Ver historial'}).click();
  await page.getByRole('button', {name: 'Ver informe · En un hotel'}).click();
  await expect(report).toBeVisible();
  await expectNoPracticeForm(page);
  await report.getByRole('button', {name: 'Cerrar informe'}).click();
  await expect(page.getByRole('heading', {level: 1, name: 'Tu ruta de inglés · A2'})).toBeVisible();
  await expectNoPracticeForm(page);
  await page.getByRole('button', {name: 'Práctica libre'}).click();
  await page.getByRole('button', {name: 'Empezar práctica'}).click();
  await expect(page.getByLabel('Tu respuesta')).toHaveValue('');
  expect(await (await page.request.get('/api/v1/sessions')).json() as unknown[]).toHaveLength(2);
});

test('five empty persistent practices are abandoned and a double click opens one valid roadmap practice', async ({page}) => {
  const csrf = await readyLearner(page);
  for (let i = 0; i < 5; i++) expect((await page.request.post('/api/v1/sessions', {
    headers: {Origin: 'http://127.0.0.1:4173', 'x-csrf-token': csrf}, data: {scenarioSlug: 'hotel', level: 'A2', mode: 'natural'},
  })).status()).toBe(201);
  await page.getByRole('button', {name: 'Continuar mi ruta'}).evaluate(button => {(button as HTMLButtonElement).click(); (button as HTMLButtonElement).click();});
  await expect(page.getByLabel('Tu respuesta')).toBeVisible();
  const sessions = await (await page.request.get('/api/v1/sessions')).json() as {state: string}[];
  expect(sessions).toHaveLength(6);
  expect(sessions.filter(s => s.state === 'abandoned')).toHaveLength(5);
  expect(sessions.filter(s => s.state === 'created')).toHaveLength(1);
});

test('open-session limits stay below the CTA and never trigger blind retries or roadmap refresh', async ({page}) => {
  await readyLearner(page);
  let starts = 0, refreshes = 0;
  await page.route('**/api/v1/roadmap', route => {refreshes++; return route.continue();});
  await page.route('**/api/v1/plans/*/activities/*/start', route => {starts++; return route.fulfill({status: 409, json: {error: {code: 'OPEN_SESSION_LIMIT'}}});});
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  const alert = page.locator('.current-step [role="alert"]');
  await expect(alert).toContainText('cinco prácticas sin terminar');
  expect(await alert.evaluate(node => node.previousElementSibling?.textContent)).toBe('Continuar mi ruta');
  expect(starts).toBe(1);
  expect(refreshes).toBe(0);
});

test('stale versions refresh and retry only once; lost acknowledgement resumes the committed session', async ({page}) => {
  await readyLearner(page);
  let starts = 0;
  const url = '**/api/v1/plans/*/activities/*/start';
  await page.route(url, route => {starts++; return starts === 1
    ? route.fulfill({status: 409, json: {error: {code: 'STALE_PLAN_VERSION'}}}) : route.continue();});
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.getByLabel('Tu respuesta')).toBeVisible();
  expect(starts).toBe(2);
  expect(await (await page.request.get('/api/v1/sessions')).json() as unknown[]).toHaveLength(1);
  await page.unroute(url);
  await page.getByRole('button', {name: 'Inicio', exact: true}).click();
  await page.route(url, async route => {
    await route.fetch();
    return route.fulfill({status: 409, json: {error: {code: 'STALE_PLAN_VERSION'}}});
  });
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.getByLabel('Tu respuesta')).toBeVisible();
  expect(await (await page.request.get('/api/v1/sessions')).json() as unknown[]).toHaveLength(1);
});

test('a repeated version conflict stops after one retry and remains next to the CTA', async ({page}) => {
  await readyLearner(page);
  let starts = 0;
  await page.route('**/api/v1/plans/*/activities/*/start', route => {starts++; return route.fulfill({status: 409, json: {error: {code: 'STALE_PLAN_VERSION'}}});});
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.locator('.current-step [role="alert"]')).toContainText('Tu ruta se ha actualizado');
  expect(starts).toBe(2);
  expect(await (await page.request.get('/api/v1/sessions')).json() as unknown[]).toHaveLength(0);
});

test('the persisted tutor opener is shown and spoken normally, with no duplicate after reload or another request', async ({page}) => {
  await page.addInitScript(() => {
    const probe = window as unknown as {__spoken: string[]}; probe.__spoken = [];
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {value: class {constructor(public text: string) {} }});
    const synthesis = new EventTarget();
    Object.assign(synthesis, {getVoices: () => [], cancel: () => undefined, speak: (utterance: SpeechSynthesisUtterance) => {probe.__spoken.push(utterance.text);}});
    Object.defineProperty(window, 'speechSynthesis', {value: synthesis});
  });
  const csrf = await readyLearner(page);
  await forceRoadmapInitiator(page, 'tutor');
  let release!: () => void;
  const held = new Promise<void>(resolve => {release = resolve;});
  let openingRequests = 0;
  await page.route('**/api/v1/sessions/*/opening', async route => {
    openingRequests++;
    const response = await route.fetch();
    await held;
    await route.fulfill({response});
  });
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.getByLabel('Tu respuesta')).toBeVisible();
  await expect(page.getByRole('status').filter({hasText: 'El tutor empieza la conversación…'})).toBeVisible();
  release();
  await expect(page.locator('[data-session] p')).toHaveText('Tutor: Hi! Where would you like to travel?');
  await expect.poll(() => page.evaluate(() => (window as unknown as {__spoken: string[]}).__spoken)).toEqual(['Hi! Where would you like to travel?']);
  const id = (await page.locator('[data-session]').getAttribute('data-session'))!;
  const replay = await page.request.post(`/api/v1/sessions/${id}/opening`, {headers: {Origin: 'http://127.0.0.1:4173', 'x-csrf-token': csrf}});
  expect((await replay.json() as {turns: unknown[]}).turns).toHaveLength(1);
  await page.reload();
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.locator('[data-session] p')).toHaveText('Tutor: Hi! Where would you like to travel?');
  expect(openingRequests).toBe(1);
  expect((await (await page.request.get(`/api/v1/sessions/${id}`)).json() as {turns: {speaker: string}[]}).turns.map(t => t.speaker)).toEqual(['tutor']);
});

test('learner-start stays empty and an opening transport failure leaves the response field usable', async ({page}) => {
  await readyLearner(page);
  await forceRoadmapInitiator(page, 'learner');
  let openings = 0;
  page.on('request', request => {if (request.url().endsWith('/opening')) openings++;});
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.getByRole('button', {name: 'Enviar', exact: true})).toBeEnabled();
  await expect(page.locator('[data-session] p')).toHaveCount(0);
  expect(openings).toBe(0);
  // Select a separate owned learner for the tutor failure branch.
  await readyLearner(page);
  await forceRoadmapInitiator(page, 'tutor');
  await page.route('**/api/v1/sessions/*/opening', route => route.fulfill({status: 503, json: {error: {code: 'unavailable'}}}));
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.getByRole('status').filter({hasText: 'Puedes iniciar tú'})).toBeVisible();
  await page.getByLabel('Tu respuesta').fill('Hello');
  await page.getByRole('button', {name: 'Enviar', exact: true}).click();
  await expect(page.getByText(/Tutor:.*Hello/)).toBeVisible();
});

test('an activity conflict that changes the current step refreshes the UI without starting a different practice', async ({page}) => {
  await readyLearner(page);
  let starts = 0;
  await page.route('**/api/v1/plans/*/activities/*/start', route => {starts++; return route.fulfill({status: 409, json: {error: {code: 'ACTIVITY_STATE_CONFLICT'}}});});
  await page.route('**/api/v1/roadmap', async route => {
    const response = await route.fetch();
    const body = await response.json() as {activities: {state: string}[]};
    body.activities[0]!.state = 'completed';
    await route.fulfill({response, json: body});
  });
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.locator('.current-step [role="alert"]')).toContainText('Revisa tu siguiente paso');
  expect(starts).toBe(1);
  expect(await (await page.request.get('/api/v1/sessions')).json() as unknown[]).toHaveLength(0);
});

test('an in-flight opening receipt loads the persisted result without asking for another generation', async ({page}) => {
  const csrf = await readyLearner(page);
  await forceRoadmapInitiator(page, 'tutor');
  let generation: Promise<unknown> | undefined, reads = 0, openingRequests = 0;
  page.on('request', request => {if (request.url().endsWith('/opening')) openingRequests++;});
  await page.route('**/api/v1/sessions/*', async route => {
    const response = await route.fetch();
    const body = await response.json() as {id: string; events: {sequence: number; kind: string}[]};
    if (++reads === 1) {
      generation = page.request.post(`/api/v1/sessions/${body.id}/opening`, {headers: {Origin: 'http://127.0.0.1:4173', 'x-csrf-token': csrf}});
      body.events = [{sequence: 1, kind: 'opening.requested'}];
      await route.fulfill({response, json: body});
    } else await route.fulfill({response});
  });
  await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
  await expect(page.locator('[data-session] p')).toHaveText('Tutor: Hi! Where would you like to travel?');
  await generation;
  expect(openingRequests).toBe(0);
  expect(reads).toBeGreaterThan(1);
});
