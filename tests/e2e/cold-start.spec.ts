import { randomUUID } from 'node:crypto';
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

test('lost turn acknowledgement and stream reconnect retain the session and idempotency key',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:/Entrar/}).click();
  await page.getByRole('button',{name:'Continuar'}).click();await page.getByRole('button',{name:'Continuar'}).click();
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Aceptar y guardar'}).click();
  await expect(page.getByRole('status').filter({ hasText: 'Configuración guardada' })).toContainText('Configuración guardada');
  await page.getByRole('button',{name:/Practicar ahora|Continuar práctica/,exact:true}).click();await page.getByRole('button',{name:'Empezar práctica'}).click();
  const sessionId=await page.locator('[data-session]').getAttribute('data-session');
  let first=true;
  await page.route('**/turns',async route=>{
    if(first){first=false;await route.fetch();await route.abort('connectionreset');}
    else await route.continue();
  });
  await page.getByLabel('Tu respuesta').fill('Synthetic reconnect request');await page.getByRole('button',{name:'Enviar',exact:true}).click();
  await expect(page.getByRole('button',{name:'Reintentar respuesta'})).toBeEnabled();
  const cursor=await page.locator('[data-cursor]').getAttribute('data-cursor');
  await page.getByRole('button',{name:'Inicio',exact:true}).click();
  let streamFailed=false;
  await page.route('**/events?cursor=*',async route=>{
    if(!streamFailed){streamFailed=true;await route.abort('connectionreset');}else await route.continue();
  });
  const resumed=page.waitForRequest(r=>r.url().includes(`/sessions/${sessionId}/events?cursor=${cursor}`));
  await page.getByRole('button',{name:/Practicar ahora|Continuar práctica/,exact:true}).click();
  await resumed;
  await expect(page.getByRole('status').filter({hasText:'Reconectando'})).toBeVisible();
  await page.getByRole('button',{name:'Reintentar respuesta'}).click();
  await expect(page.getByRole('button',{name:'Enviar',exact:true})).toBeEnabled();
  await expect(page.locator('[data-session]')).toHaveAttribute('data-session',sessionId!);
  await expect(page.getByText('Tú: Synthetic reconnect request', {exact:true})).toHaveCount(1);
  await expect(page.getByText(/Tutor:.*Synthetic reconnect request/)).toHaveCount(1);
  await page.getByRole('button',{name:'Terminar',exact:true}).click();
});
