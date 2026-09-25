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
