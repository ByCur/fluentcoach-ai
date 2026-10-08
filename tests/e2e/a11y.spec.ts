import { openLearnerPage } from './learner-navigation.js';
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
async function check(page: Page, flow: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    serious,
    JSON.stringify({ flow, violations: serious }, null, 2),
  ).toEqual([]);
}
async function onboard(page: Page) {
  await page.goto("/");
  await page.route("**/api/v1/auth/synthetic-login", (route) =>
    route.continue({
      postData: JSON.stringify({ subject: "a11y-" + randomUUID() }),
    }),
  );
  await page.getByRole("button", { name: /Entrar/ }).click();
}
test("onboarding labels, consent, keyboard and visible focus", async ({
  page,
}) => {
  await onboard(page);
  await check(page, "onboarding-profile");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await check(page, "onboarding-goals");
  await page.getByRole("button", { name: "Continuar" }).click();
  await check(page, "onboarding-consent");
});
test("practice, conversation, fake voice controls, report, issues, vocabulary and plan/progress", async ({
  page,
}) => {
  test.setTimeout(90000);
  await onboard(page);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Aceptar y guardar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Configuración guardada" })).toContainText("Configuración guardada");
  await check(page, "learner-home");
  await openLearnerPage(page, 'Mi perfil');
  await expect(page.getByText(/Paso [123] de 3/)).toHaveCount(0);
  await check(page, 'returning-profile-settings');
  await page.getByRole('button', { name: 'Inicio', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir menú de perfil' }).click();
  await check(page, "profile-navigation");
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Abrir menú de perfil' })).toBeFocused();
  await page.getByRole("button", { name: 'Práctica libre' }).click();
  await check(page, "practice-selection");
  // Transient fake media exercises the recording UI without device access.
  await page.evaluate(() => {
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>Promise.resolve({getTracks:()=>[{stop:()=>undefined}]} as unknown as MediaStream)}});
    class FakeRecorder extends EventTarget {
      static isTypeSupported(){return true;}
      state:RecordingState='inactive';mimeType='audio/webm';
      ondataavailable:((event:BlobEvent)=>void)|null=null;onstop:(()=>void)|null=null;
      constructor(public stream: MediaStream){super();}
      start(){this.state='recording';}
      stop(){this.ondataavailable?.({data:new Blob(['synthetic-audio'],{type:this.mimeType})} as BlobEvent);this.state='inactive';this.onstop?.();this.dispatchEvent(new Event('stop'));}
    }
    Object.defineProperty(window,'MediaRecorder',{configurable:true,value:FakeRecorder});
  });
  for (let n = 0; n < 2; n++) {
    if (n > 0) await page.getByRole('button', {name: 'Práctica libre'}).click();
    await page.getByRole("button", { name: "Empezar práctica" }).click();
    await check(page, "text-conversation-and-voice-controls");
    if(n===0){
      await page.getByRole('button',{name:'Silenciar voz del tutor'}).click();
      await page.getByRole('button',{name:'Hablar'}).click();
      await expect(page.getByRole('button',{name:'Detener y enviar'})).toBeVisible();
      await check(page,'fake-microphone-recording-state');
      await page.getByRole('button',{name:'Detener y enviar'}).click();
      await expect(page.getByText(/Tú:.*Synthetic spoken turn/)).toBeVisible();
    }
    for (let turn = 0; turn < 2; turn++) {
      await page
        .getByLabel("Tu respuesta")
        .fill(`Yesterday I go to the hotel ${n}-${turn}`);
      await page.getByRole("button", { name: "Enviar", exact: true }).click();
      await expect(page.getByLabel("Tu respuesta")).toHaveValue("", { timeout: 15000 });
    }
    await page.getByRole("button", { name: "Terminar" }).click();
    const report = page.getByRole("region", { name: "Informe de sesión" });
    await expect(report.getByRole("status")).toContainText("Informe listo", {
      timeout: 15000,
    });
    await check(page, "report");
    await expect(page.getByRole('heading', {name: '¿Qué quieres practicar?'})).toHaveCount(0);
    await report.getByRole("button", { name: n === 0 ? 'Continuar mi ruta' : 'Cerrar informe' }).click();
    await expect(page.getByRole('heading', {level: 1, name: 'Tu ruta de inglés · A1'})).toBeFocused();
    await expect(page.getByRole('button', {name: 'Continuar mi ruta'})).toBeVisible();
    await check(page, 'roadmap-after-report');
  }
  await openLearnerPage(page, 'Lo que debo mejorar');
  await page.getByRole("button", { name: "Actualizar mis ejemplos" }).click();
  await check(page, "recurring-issues");
  await openLearnerPage(page, 'Mi vocabulario');
  await page.getByRole("button", { name: "Actualizar vocabulario" }).click();
  await page.getByRole("button", { name: "Añadir al repaso" }).first().click();
  await check(page, "vocabulary-review");
  await page.getByRole('button', {name: 'Inicio', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Continuar mi ruta'})).toBeVisible();
  await check(page, 'adaptive-roadmap');
  await openLearnerPage(page, 'Mi progreso');
  await check(page, 'progress');
});
test("privacy export states, confirmation and deletion completion are accessible and clear learner UI", async ({
  page,
}) => {
  await onboard(page);
  await page.getByRole("button", { name: "Privacidad y tus datos" }).click();
  await check(page, "privacy");
  const deleteButton = page.getByRole("button", {
    name: "Eliminar mi cuenta y mis datos",
    exact: true,
  });
  await expect(deleteButton).toBeDisabled();
  await page
    .getByRole("button", { name: "Exportar mis datos", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Descargar mis datos" }),
  ).toBeVisible({ timeout: 15000 });
  await check(page, "export-ready");
  await page
    .getByRole("checkbox", {
      name: "Confirmo que quiero eliminar mi cuenta y mis datos.",
    })
    .check();
  await deleteButton.click();
  await expect(
    page.getByRole("heading", { name: "Eliminación iniciada" }),
  ).toBeVisible();
  await check(page, "deletion-completion");
  await expect(page.getByText("Prepara tu aprendizaje")).toHaveCount(0);
});
