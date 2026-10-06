import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { LearningPlan } from '@fluentcoach/application';

test('real Ollama outage uses the deterministic route after onboarding and reload, with no paid fallback', async ({page}) => {
  test.setTimeout(60000);
  // A separate real API instance selects the local provider, while the standard server keeps the rest of CI deterministic.
  const server = spawn(process.execPath, ['apps/api/dist/main.js'], {
    env: {...process.env, API_PORT: '3002', APP_ENVIRONMENT: 'test', NODE_ENV: 'test',
      PUBLIC_ORIGIN: 'http://127.0.0.1:4173', AI_PROVIDER: 'ollama', AI_FALLBACK_PROVIDER: 'none',
      OLLAMA_BASE_URL: 'http://127.0.0.1:11435', SPEECH_PROVIDER: 'fake', BILLING_MODE: 'free_only'},
    stdio: 'ignore',
  });
  try {
    await expect.poll(async () => {
      try {return (await fetch('http://127.0.0.1:3002/health/live')).status;} catch {return 0;}
    }, {timeout: 15000}).toBe(200);
    await page.route(url => url.pathname.startsWith('/api/v1/') && !url.pathname.endsWith('/events'), async route => {
      const url = new URL(route.request().url());
      url.port = '3002';
      const response = await route.fetch({url: url.toString()});
      await route.fulfill({response});
    });
    await page.goto('/');
    await page.route('**/api/v1/auth/synthetic-login', async route => {
      const response = await route.fetch({url: 'http://127.0.0.1:3002/api/v1/auth/synthetic-login',
        postData: JSON.stringify({subject: `ollama-outage-${randomUUID()}`})});
      await route.fulfill({response});
    });
    await page.getByRole('button', {name: /Entrar/}).click();
    await page.getByLabel('B1').check();
    await page.getByLabel(/Intereses/).fill('cocina');
    await page.getByRole('button', {name: 'Continuar', exact: true}).click();
    await page.getByRole('button', {name: 'Continuar', exact: true}).click();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', {name: 'Aceptar y guardar'}).click();
    await expect(page.locator('.current-step h2')).toContainText('restaurante');
    const before = await page.evaluate(async () => (await (await fetch('/api/v1/plans/current')).json()) as {active: LearningPlan});
    expect(before.active.activities[0]?.scenarioSlug).toBe('restaurant');
    await page.reload();
    await expect(page.locator('.current-step h2')).toContainText('restaurante');
    const after = await page.evaluate(async () => (await (await fetch('/api/v1/plans/current')).json()) as {active: LearningPlan});
    expect(after.active.activities.map(a => a.id)).toEqual(before.active.activities.map(a => a.id));
    await page.getByRole('button', {name: 'Continuar mi ruta'}).click();
    await expect(page.getByLabel('Tu respuesta')).toBeVisible();
    const sessions = await page.evaluate(async () => (await (await fetch('/api/v1/sessions')).json()) as unknown[]);
    expect(sessions).toHaveLength(1);
  } finally {
    if (server.exitCode === null) { const exited = once(server, 'exit'); server.kill('SIGTERM'); await exited; }
  }
});
