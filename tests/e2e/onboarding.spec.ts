import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const localConsent = {
  purpose: 'local-ai-practice', policyVersion: 'privacy-2026-10-05',
  providerDisclosureVersion: 'local-first-2026-10-05',
};
const legacyConsent = {
  purpose: 'gemini-free-ai-practice', policyVersion: 'privacy-2026-09-29',
  providerDisclosureVersion: 'gemini-free-2026-09-29',
};

test('synthetic learner accepts local-first onboarding and values survive reload', async ({ page }) => {
  await page.goto('/');
  const loginButton = page.getByRole('button', { name: /Entrar/ });
  await expect(loginButton).toBeVisible();
  const responsePromise = page.waitForResponse(response => response.url().includes('/auth/synthetic-login'));
  await loginButton.click();
  expect((await responsePromise).status()).toBe(201);
  await expect(page.getByRole('heading', { name: 'Prepara tu aprendizaje' })).toBeVisible();
  await page.getByLabel('B1').check();
  await page.getByLabel(/Intereses/).fill('viajes, cocina');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Minutos por día').fill('20');
  await page.getByLabel('Días por semana').fill('4');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText(/Por defecto, Ollama/)).toBeVisible();
  await expect(page.getByText(/no almacena audio sin procesar/)).toBeVisible();
  await expect(page.getByText(/no se garantiza que funcionen sin conexión/)).toBeVisible();
  await expect(page.getByText(/No se envía contenido a Gemini por defecto/)).toBeVisible();
  await expect(page.getByText(/Privacidad.*versión 2026-10-05/)).toBeVisible();
  await expect(page.getByText(/Divulgación Gemini Free|puede ser utilizado por Google/)).toHaveCount(0);
  await page.getByRole('checkbox').check();
  const saved = page.waitForResponse(r => r.url().endsWith('/onboarding/complete') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Aceptar y guardar' }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const submitted = response.request().postDataJSON() as { consent: unknown };
  expect(submitted.consent).toEqual({ ...localConsent, accepted: true });
  await expect(page.getByRole('status')).toContainText('Configuración guardada');
  const history = await page.request.get('/api/v1/consent');
  expect(history.status()).toBe(200);
  expect(await history.json()).toEqual(expect.arrayContaining([expect.objectContaining(localConsent)]));
  await page.reload();
  await expect(page.getByLabel('B1')).toBeChecked();
  await expect(page.getByLabel(/Intereses/)).toHaveValue('viajes, cocina');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Minutos por día').fill('25');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('checkbox')).toBeChecked();
  await page.getByRole('button', { name: 'Aceptar y guardar' }).click();
  await expect(page.getByRole('status')).toContainText('Configuración guardada');
  await page.reload();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByLabel('Minutos por día')).toHaveValue('25');
});

test('historical Gemini consent is preserved and requires a separate local-first acceptance', async ({ page }) => {
  await page.goto('/');
  const auth = await page.request.post('/api/v1/auth/synthetic-login', {
    headers: { Origin: 'http://127.0.0.1:4173' },
    data: { subject: `legacy-onboarding-audit-${randomUUID()}` },
  });
  expect(auth.status()).toBe(201);
  const { csrfToken } = await auth.json() as { csrfToken: string };
  const seeded = await page.request.post('/api/v1/onboarding/complete', {
    headers: { Origin: 'http://127.0.0.1:4173', 'x-csrf-token': csrfToken },
    data: {
      profile: { interfaceLanguage: 'es', nativeLanguage: 'es', timezone: 'UTC', cefrLevel: 'A1', interests: [] },
      goal: { minutesPerDay: 10, daysPerWeek: 3 },
      consent: { ...legacyConsent, accepted: true },
    },
  });
  expect(seeded.status()).toBe(201);
  const historical = await (await page.request.get('/api/v1/consent')).json() as unknown[];
  expect(historical).toEqual([expect.objectContaining(legacyConsent)]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Prepara tu aprendizaje' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.getByRole('button', { name: 'Aceptar y guardar' }).click();
  await expect(page.getByRole('status')).toContainText('Debes aceptar la divulgación');
  expect(await (await page.request.get('/api/v1/consent')).json()).toEqual(historical);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Aceptar y guardar' }).click();
  await expect(page.getByRole('status')).toContainText('Configuración guardada');
  const updated = await (await page.request.get('/api/v1/consent')).json() as unknown[];
  expect(updated).toHaveLength(2);
  expect(updated).toEqual(expect.arrayContaining([...historical, expect.objectContaining(localConsent)]));
});
