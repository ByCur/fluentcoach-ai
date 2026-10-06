import type { Page } from '@playwright/test';

export async function openLearnerPage(page: Page, name: string) {
  await page.getByRole('button', { name: 'Abrir menú de perfil' }).click();
  await page.getByRole('navigation', { name: 'Mi aprendizaje' })
    .getByRole('button', { name, exact: true }).click();
}
