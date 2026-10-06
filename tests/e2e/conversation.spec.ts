import { test, expect, type Page } from '@playwright/test';
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
  await expect(page.getByRole('status')).toContainText('Configuración guardada');
  await page.getByRole('button', {name: 'Practicar'}).click();
}
test('delayed chunks reach the browser progressively; disconnect and cursor resume preserve each chunk once', async ({page}) => {
  await onboarding(page);
  await page.getByLabel('Escenario').selectOption('hotel');
  await page.getByLabel('Modo').selectOption('teaching');
  await page.getByLabel('Nivel de práctica').selectOption('B2');
  const startResponse = page.waitForResponse(r => r.url().endsWith('/sessions') && r.request().method() === 'POST');
  await page.getByRole('button', {name: 'Iniciar sesión'}).click();
  const started = await (await startResponse).json() as {id:string;snapshot:{scenarioSlug:string;level:string;mode:string}};
  expect(started.snapshot).toMatchObject({scenarioSlug: 'hotel', level: 'B2', mode: 'teaching'});
  let turnCompleted = false;
  const turnResponse = page.waitForResponse(r => r.url().includes('/turns')).then(r => { turnCompleted = true; return r; });
  await page.getByLabel('Tu respuesta').fill('I need a room');
  await page.getByLabel('Tu respuesta').press('Enter');
  const stream = page.getByTestId('tutor-stream');
  await expect(stream).toHaveText("stream: Let's continue: ");
  expect(turnCompleted).toBe(false);
  const firstCursor = Number(await page.locator('[data-cursor]').getAttribute('data-cursor'));
  expect(firstCursor).toBe(1);
  // Leaving practice closes the live EventSource while the POST/provider keeps running.
  await page.getByRole('button', {name: 'Perfil', exact: true}).click();
  const resumedRequest = page.waitForRequest(r => r.url().includes(`/sessions/${started.id}/events?cursor=1`));
  await page.getByRole('button', {name: 'Practicar'}).click();
  await resumedRequest;
  await expect(stream).toHaveText("stream: Let's continue: I need a room.");
  expect(turnCompleted).toBe(false);
  expect(Number(await page.locator('[data-cursor]').getAttribute('data-cursor'))).toBe(2);
  const response = await turnResponse;
  expect(response.status(), await response.text()).toBe(201);
  await expect(page.getByText(/Quick tip/)).toBeVisible();
  await expect(page.getByText(/Let's continue:/)).toHaveCount(1);
  await expect(page.locator('[data-cursor]')).toHaveAttribute('data-cursor', '4');
  await page.getByRole('button', {name: 'Ayuda en español'}).click();
  await expect(page.getByText(/Explicación breve/)).toBeVisible();
  await page.getByLabel('Tu respuesta').fill('Thank you');
  await page.getByRole('button', {name: 'Enviar', exact: true}).click();
  await expect(page.getByText(/tutor:.*Thank you/)).toBeVisible();
  await expect(page.getByRole('button', {name: 'Enviar', exact: true})).toBeEnabled();
  await page.getByRole('button', {name: 'Terminar'}).click();
  await page.reload();
  await page.getByRole('button', {name: 'Practicar'}).click();
  await page.getByRole('button', {name: 'Ver historial'}).click();
  await expect(page.locator(`[data-session-history="${started.id}"]`)).toHaveText('hotel · ended');
});
test('all six scenarios and A1/A2/B1/B2 are selectable with persisted snapshots and a fresh stream cursor per session', async ({page}) => {
  await onboarding(page);
  const scenarios = ['restaurant','travel','hotel','shopping','doctor-visit','free-conversation'];
  expect(await page.getByLabel('Escenario').locator('option').evaluateAll(options => options.map(o => (o as HTMLOptionElement).value))).toEqual(scenarios);
  for (const level of ['A1','A2','B1','B2']) {
    await page.getByLabel('Nivel de práctica').selectOption(level);
    await page.getByLabel('Escenario').selectOption(scenarios[['A1','A2','B1','B2'].indexOf(level)]!);
    const response = page.waitForResponse(r => r.url().endsWith('/sessions') && r.request().method() === 'POST');
    await page.getByRole('button', {name: 'Iniciar sesión'}).click();
    const body=await (await response).json() as {snapshot:{level:string}};expect(body.snapshot.level).toBe(level);
    await expect(page.locator('[data-cursor]')).toHaveAttribute('data-cursor','0');
    await page.getByLabel('Tu respuesta').fill('Synthetic greeting');
    await page.getByRole('button', {name: 'Enviar', exact: true}).click();
    await expect(page.getByText(/tutor:.*Synthetic greeting/)).toBeVisible();
    await expect(page.getByText(/Quick tip/)).toHaveCount(0);
    await expect(page.getByRole('button', {name: 'Enviar', exact: true})).toBeEnabled();
    await page.getByRole('button', {name: 'Terminar'}).click();
  }
});
