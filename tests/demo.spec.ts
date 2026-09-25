import { expect, test } from '@playwright/test';

test('serves the frozen four-question sequence without an API', async ({ page, isMobile }) => {
  const apiRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });

  await page.goto('/');
  await expect(page).toHaveTitle('SNS Demo');
  if (!isMobile) await expect(page.getByRole('heading', { name: 'SNS Demo · Four-question practice' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to question 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to question 2', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to question 3', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to question 4', exact: true })).toBeVisible();
  await expect(page.locator('.paper-brand a')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change difficulty' })).toHaveCount(0);
  await expect(page.getByText('6 items = ______ groups of 3')).toBeVisible();
  expect(apiRequests).toEqual([]);
});

test('loads every fixed question and its help experience', async ({ page, isMobile }) => {
  await page.goto('/');
  for (const label of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: `Go to question ${label}`, exact: true }).click();
    await expect(page.locator('.paper-question:visible .paper-number')).toHaveText(label);
    await page.getByRole('button', { name: 'Help Me' }).click();
    const activeHelp = page.locator('.paper-question:visible .paper-teach-host');
    await expect.poll(() => activeHelp.evaluate(element => element.childElementCount)).toBeGreaterThan(0);
    await activeHelp.dispatchEvent('teaching-close');
    await expect(activeHelp).toBeHidden();
  }
});

test('reports the complete exercise lifecycle to the console', async ({ page }) => {
  const lifecycle: string[] = [];
  page.on('console', message => {
    if (['exercise started', 'question answered', 'exercise ended'].includes(message.text())) {
      lifecycle.push(message.text());
    }
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect.poll(() => lifecycle).toEqual(['exercise started']);

  for (const [index, answer] of ['2', '36', '10', '16'].entries()) {
    const input = page.locator('.paper-question:visible .paper-answer-panel input[type="hidden"]').first();
    await input.evaluate((element: HTMLInputElement, value) => {
      element.value = String(value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, answer);
    await page.getByRole('button', { name: 'Check answer' }).click();
    await expect.poll(() => lifecycle.filter(message => message === 'question answered').length).toBe(index + 1);
    const action = page.getByRole('button', { name: index === 3 ? 'Finish' : 'Next Question' });
    await expect(action).toBeEnabled();
    await action.click();
  }

  await expect(page.getByRole('heading', { name: 'Demo complete' })).toBeVisible();
  expect(lifecycle).toEqual([
    'exercise started',
    'question answered',
    'question answered',
    'question answered',
    'question answered',
    'exercise ended'
  ]);
});
