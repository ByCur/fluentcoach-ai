import type {Page} from '@playwright/test';
import {setSessionInitiator} from '../support/session-initiator.js';

/** Existing transport tests select the learner-start branch; opener UX has separate coverage. */
export async function learnerStarts(page: Page) {
  await page.route('**/api/v1/sessions', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({response});
    const body = await response.json() as {id: string; initiator: string};
    body.id = await setSessionInitiator(body.id, 'learner');
    body.initiator = 'learner';
    return route.fulfill({response, json: body});
  });
}
