import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';

// Each test owns a learner so unfinished practices cannot affect another flow.
test.beforeEach(async ({ page }) => {
  const subject = `conversation-e2e-${randomUUID()}`;
  await page.route('**/api/v1/auth/synthetic-login', (route) => route.continue({
    postData: JSON.stringify({ subject }),
  }));
});
async function onboarding(page: Page) {
  await page.goto('/');
  const login = page.getByRole('button', {name: /Entrar/});
  await expect(login).toBeVisible();
  await login.click();
  await expect(page.getByRole('heading', {name: 'Prepara tu aprendizaje'})).toBeVisible();
  await page.getByRole('button', {name: 'Continuar'}).click();
  await page.getByRole('button', {name: 'Continuar'}).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', {name: 'Aceptar y guardar'}).click();
  await expect(page.getByRole('status').filter({ hasText: 'Configuración guardada' })).toContainText('Configuración guardada');
  await page.getByRole('button', {name: 'Práctica libre'}).click();
  // Opening practice awaits canonical sessions; evaluateAll does not wait for the UI to mount.
  await expect(page.getByRole('combobox', {name: 'Situación', exact: true})).toBeVisible();
  await expect(page.getByRole('combobox', {name: 'Situación', exact: true})).toBeEnabled();
}
test('delayed chunks reach the browser progressively; disconnect and cursor resume preserve each chunk once', async ({page}) => {
  await onboarding(page);
  await page.getByLabel('Situación').selectOption('hotel');
  await page.getByLabel('Cómo quieres practicar').selectOption('teaching');
  await page.getByLabel('Nivel de práctica').selectOption('B2');
  const startResponse = page.waitForResponse(r => r.url().endsWith('/sessions') && r.request().method() === 'POST');
  await page.getByRole('button', {name: 'Empezar práctica'}).click();
  const started = await (await startResponse).json() as {id:string;snapshot:{scenarioSlug:string;level:string;mode:string}};
  expect(started.snapshot).toMatchObject({scenarioSlug: 'hotel', level: 'B2', mode: 'teaching'});
  let turnCompleted = false;
  const turnResponse = page.waitForResponse(r => r.url().includes('/turns')).then(r => { turnCompleted = true; return r; });
  await page.getByLabel('Tu respuesta').fill('I need a room');
  await page.getByLabel('Tu respuesta').press('Enter');
  const stream = page.getByTestId('tutor-stream');
  await expect(stream).toHaveText("Tutor: Let's continue: ");
  expect(turnCompleted).toBe(false);
  const firstCursor = Number(await page.locator('[data-cursor]').getAttribute('data-cursor'));
  expect(firstCursor).toBe(1);
  // Leaving practice closes the live EventSource while the POST/provider keeps running.
  await page.getByRole('button', {name: 'Inicio', exact: true}).click();
  const resumedRequest = page.waitForRequest(r => r.url().includes(`/sessions/${started.id}/events?cursor=1`));
  await page.getByRole('button', {name: 'Práctica libre'}).click();
  await resumedRequest;
  await expect(stream).toHaveText("Tutor: Let's continue: I need a room.");
  expect(turnCompleted).toBe(false);
  // The next chunk may arrive while the browser assertion is being evaluated.
  const resumedCursor = Number(await page.locator('[data-cursor]').getAttribute('data-cursor'));
  expect(resumedCursor).toBeGreaterThanOrEqual(2);
  expect(resumedCursor).toBeLessThanOrEqual(3);
  const response = await turnResponse;
  expect(response.status(), await response.text()).toBe(201);
  await expect(page.getByText(/Quick tip/)).toBeVisible();
  await expect(page.getByText(/Let's continue:/)).toHaveCount(1);
  await expect(page.locator('[data-cursor]')).toHaveAttribute('data-cursor', '4');
  await page.getByRole('button', {name: 'Ayuda en español'}).click();
  await expect(page.getByText(/Explicación breve/)).toBeVisible();
  await page.getByLabel('Tu respuesta').fill('Thank you');
  await page.getByRole('button', {name: 'Enviar', exact: true}).click();
  await expect(page.getByText(/Tutor:.*Thank you/)).toBeVisible();
  await expect(page.getByRole('button', {name: 'Enviar', exact: true})).toBeEnabled();
  await page.getByRole('button', {name: 'Terminar'}).click();
  await page.reload();
  await page.getByRole('button', {name: 'Práctica libre'}).click();
  await expect(page.getByRole('combobox', {name: 'Situación', exact: true})).toBeVisible();
  await expect(page.getByRole('combobox', {name: 'Situación', exact: true})).toBeEnabled();
  await page.getByRole('button', {name: 'Ver historial'}).click();
  await expect(page.locator(`[data-session-history="${started.id}"]`)).toHaveText('En un hotel · Terminada');
});
test('all roadmap scenarios and A1/A2/B1/B2 are selectable with persisted snapshots and a fresh stream cursor per session', async ({page}) => {
  await onboarding(page);
  const scenarios = ['introductions','past-experiences','travel','hotel','restaurant','shopping','family-friends','work','hobbies','doctor-visit','future-plans','opinions','problem-solving','free-conversation'];
  expect(await page.getByLabel('Situación').locator('option').evaluateAll(options => options.map(o => (o as HTMLOptionElement).value))).toEqual(scenarios);
  for (const level of ['A1','A2','B1','B2']) {
    const scenarioSlug = scenarios[['A1','A2','B1','B2'].indexOf(level)]!;
    await page.getByLabel('Nivel de práctica').selectOption(level);
    await page.getByLabel('Situación').selectOption(scenarioSlug);
    const response = page.waitForResponse(r => r.url().endsWith('/sessions') && r.request().method() === 'POST');
    const streamRequest = page.waitForRequest(r => new URL(r.url()).pathname.endsWith('/events') && new URL(r.url()).searchParams.get('cursor') === '0');
    await page.getByRole('button', {name: 'Empezar práctica'}).click();
    const body = await (await response).json() as {id: string; snapshot: {scenarioSlug: string; level: string; mode: string}};
    expect(body.snapshot).toMatchObject({scenarioSlug, level, mode: 'natural'});
    expect(new URL((await streamRequest).url()).pathname).toBe(`/api/v1/sessions/${body.id}/events`);
    const persisted = await page.request.get(`/api/v1/sessions/${body.id}`);
    expect(persisted.status()).toBe(200);
    expect((await persisted.json() as {snapshot: unknown}).snapshot).toMatchObject({scenarioSlug, level, mode: 'natural'});
    await expect(page.locator('[data-cursor]')).toHaveAttribute('data-cursor','0');
    await page.getByLabel('Tu respuesta').fill('Synthetic greeting');
    await page.getByRole('button', {name: 'Enviar', exact: true}).click();
    await expect(page.getByText(/Tutor:.*Synthetic greeting/)).toBeVisible();
    await expect(page.getByText(/Quick tip/)).toHaveCount(0);
    await expect(page.getByRole('button', {name: 'Enviar', exact: true})).toBeEnabled();
    await page.getByRole('button', {name: 'Terminar'}).click();
  }
});
