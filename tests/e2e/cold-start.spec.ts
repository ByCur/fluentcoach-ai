import { randomUUID } from 'node:crypto';
import type { SessionRecord } from '@fluentcoach/application';
import { test,expect } from '@playwright/test';

// Each test owns a learner so unfinished practices cannot affect another flow.
test.beforeEach(async ({ page }) => {
  const subject = `cold-start-e2e-${randomUUID()}`;
  await page.route('**/api/v1/auth/synthetic-login', (route) => route.continue({
    postData: JSON.stringify({ subject }),
  }));
});

test('cold-start HTML and 503 become announced startup; auth waits for actual readiness',async({page})=>{
  let probes=0;
  await page.route('**/health/ready',async route=>{
    probes++;
    if(probes===1)await route.fulfill({status:200,contentType:'text/html',body:'<html>Starting service</html>'});
    else if(probes===2)await route.fulfill({status:503,contentType:'application/json',body:'{"status":"not-ready"}'});
    else await route.continue();
  });
  await page.goto('/');await expect(page.getByRole('status')).toContainText('Iniciando el servicio');
  await expect(page.getByRole('button',{name:/Entrar/})).toBeVisible({timeout:20000});
  expect(probes).toBeGreaterThanOrEqual(3);
});

test('lost turn acknowledgement and stream reconnect retain the session and idempotency key', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Entrar/ }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Aceptar y guardar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Configuración guardada' })).toContainText('Configuración guardada');
  await page.getByRole('button', { name: 'Práctica libre', exact: true }).click();
  await page.getByRole('button', { name: 'Empezar práctica' }).click();
  const sessionId = await page.locator('[data-session]').getAttribute('data-session');
  expect(sessionId).toBeTruthy();
  const sessionPath = `/api/v1/sessions/${sessionId}`;
  const turnRequests: { sourceEventKey: string; text: string }[] = [];
  await page.route(`**${sessionPath}/turns`, async (route) => {
    turnRequests.push(route.request().postDataJSON() as { sourceEventKey: string; text: string });
    if (turnRequests.length === 1) {
      // Commit the turn on the real backend, then lose only its acknowledgement.
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort('connectionreset');
    } else await route.continue();
  });
  await page.getByLabel('Tu respuesta').fill('Synthetic reconnect request');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reintentar respuesta' })).toBeEnabled();
  expect(turnRequests).toHaveLength(1);
  const firstTurn = turnRequests[0]!;
  expect(firstTurn.sourceEventKey).toBeTruthy();

  const streamCursor = (url: URL) => {
    expect(url.searchParams.get('cursor')).toMatch(/^\d+$/);
    const value = Number(url.searchParams.get('cursor'));
    expect(Number.isSafeInteger(value)).toBe(true);
    return value;
  };
  const cursor = Number(await page.locator('[data-cursor]').getAttribute('data-cursor'));
  await page.getByRole('button', { name: 'Inicio', exact: true }).click();
  const isSessionStream = (url: URL) => url.pathname === `${sessionPath}/events`;
  const reconnectUrls: URL[] = [];
  let releaseReconnect!: () => void;
  const reconnectAllowed = new Promise<void>((resolve) => { releaseReconnect = resolve; });
  await page.route(isSessionStream, async (route) => {
    reconnectUrls.push(new URL(route.request().url()));
    if (reconnectUrls.length === 1) await route.abort('connectionreset');
    else {
      // Hold recovery until the first failure's accessible status has been observed.
      await reconnectAllowed;
      await route.continue();
    }
  });
  // SSE can advance after the DOM snapshot; match the session, then compare cursors.
  const resumed = page.waitForRequest((request) => isSessionStream(new URL(request.url())));
  const recovered = page.waitForResponse((response) => isSessionStream(new URL(response.url())));
  const reconnecting = page.getByRole('status').filter({ hasText: 'Reconectando' });
  try {
    await page.getByRole('button', { name: 'Práctica libre', exact: true }).click();
    const request = await resumed;
    expect(streamCursor(new URL(request.url()))).toBeGreaterThanOrEqual(cursor);
    await expect(page.locator('[data-session]')).toHaveAttribute('data-session', sessionId!);
    await expect(reconnecting).toBeVisible();
  } finally {
    releaseReconnect();
  }
  const streamResponse = await recovered;
  expect(streamResponse.ok()).toBe(true);
  expect(streamResponse.headers()['content-type']).toContain('text/event-stream');
  expect(reconnectUrls.length).toBeGreaterThanOrEqual(2);
  let previousCursor = cursor;
  for (const url of reconnectUrls) {
    const nextCursor = streamCursor(url);
    expect(nextCursor).toBeGreaterThanOrEqual(previousCursor);
    previousCursor = nextCursor;
  }
  await expect(reconnecting).toHaveCount(0);

  const retry = page.waitForResponse((response) => new URL(response.url()).pathname === `${sessionPath}/turns`
    && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Reintentar respuesta' }).click();
  const retryResponse = await retry;
  expect(retryResponse.ok()).toBe(true);
  expect(turnRequests).toEqual([firstTurn, firstTurn]);
  const retriedSession = await retryResponse.json() as SessionRecord;
  expect(retriedSession).toMatchObject({
    id: sessionId,
    turns: [
      { speaker: 'learner', sourceEventKey: firstTurn.sourceEventKey, text: firstTurn.text },
      { speaker: 'tutor', sourceEventKey: `${firstTurn.sourceEventKey}:reply` },
    ],
  });
  await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeEnabled();
  await expect(page.locator('[data-session]')).toHaveAttribute('data-session', sessionId!);
  await expect(page.getByText('Tú: Synthetic reconnect request', { exact: true })).toHaveCount(1);
  await expect(page.getByText(/Tutor:.*Synthetic reconnect request/)).toHaveCount(1);

  const ended = page.waitForResponse((response) => new URL(response.url()).pathname === `${sessionPath}/end`
    && response.request().method() === 'POST');
  const history = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/sessions'
    && response.request().method() === 'GET');
  await page.getByRole('button', { name: 'Terminar', exact: true }).click();
  const endResponse = await ended;
  expect(endResponse.ok()).toBe(true);
  const records = await (await history).json() as SessionRecord[];
  expect(records.find((record) => record.id === sessionId)).toMatchObject({ state: 'ended', turns: retriedSession.turns });
  await expect(page.locator('[data-session]')).toHaveCount(0);
  await expect(page.locator(`[data-session-history="${sessionId}"]`)).toContainText('Terminada');
});
