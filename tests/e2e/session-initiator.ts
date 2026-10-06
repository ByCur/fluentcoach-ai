import type {Page} from '@playwright/test';
import {setSessionInitiator} from '../support/session-initiator.js';

/** Select a real persisted initiator for deterministic browser branches. */
export async function practiceStarts(page: Page, initiator: 'learner'|'tutor') {
  await page.route('**/api/v1/sessions', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({response});
    const body = await response.json() as {id: string; initiator: string};
    body.id = await setSessionInitiator(body.id, initiator);
    body.initiator = initiator;
    return route.fulfill({response, json: body});
  });
}

export function learnerStarts(page: Page) {return practiceStarts(page, 'learner');}
