import { expect, test } from '@playwright/test';

test('production ignores visual-test state query parameters', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-compose');
  await page.goto('/?state=complete');
  await expect(page.getByRole('heading', { name: 'Trade a file with a stranger.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Save received file/i })).toHaveCount(0);
});
