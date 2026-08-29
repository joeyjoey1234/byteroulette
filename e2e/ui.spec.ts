import { expect, test } from '@playwright/test';
import { workflowStates } from '../packages/protocol/src/state-machine.js';

for (const state of workflowStates) {
  test(`${state} renders without critical overflow`, async ({ page }) => {
    await page.goto(`/?state=${state}`);
    await expect(page.locator('h1')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('landing passes automated semantic accessibility checks', async ({ page }) => {
  await page.goto('/?state=landing');
  const issues = await page.evaluate(() => {
    const found: string[] = [];
    if (document.querySelectorAll('main').length !== 1) found.push('main landmark');
    if (document.querySelectorAll('h1').length !== 1) found.push('single h1');
    for (const button of document.querySelectorAll('button')) {
      if (!button.textContent.trim() && !button.getAttribute('aria-label'))
        found.push('button name');
    }
    for (const image of document.querySelectorAll('img')) {
      if (!image.hasAttribute('alt')) found.push('image alt');
    }
    return found;
  });
  expect(issues).toEqual([]);
});

test('missing WebRTC support selects the unsupported-browser state', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'RTCPeerConnection', { value: undefined });
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Required peer APIs are missing.' }),
  ).toBeVisible();
});

test('design system stylesheet is applied', async ({ page }) => {
  await page.goto('/?state=landing');
  await expect(page.locator('.topbar')).toHaveCSS('display', 'flex');
  await expect(page.locator('.brand img')).toHaveCSS('width', '34px');
  const background = await page
    .locator('body')
    .evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(background).toContain('radial-gradient');
});

test('primary workflow exposes a visible keyboard focus', async ({ page }) => {
  await page.goto('/?state=peer-review');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
});

test('complete state keeps save and restart as separate actions', async ({ page }) => {
  await page.goto('/?state=complete');
  await expect(page.getByRole('button', { name: /Save received file/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Start another exchange/i })).toBeVisible();
  await page.getByRole('button', { name: /Start another exchange/i }).click();
  await expect(page.getByRole('heading', { name: 'Trade a file with a stranger.' })).toBeVisible();
});

test('leave queue cancels the live session and exposes restart', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Begin exchange/i }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /I understand/i }).click();
  await (
    await chooser
  ).setFiles({
    name: 'leave-queue.png',
    mimeType: 'image/png',
    buffer: Buffer.from([1, 2, 3]),
  });
  await page.getByRole('button', { name: /Review exchange/i }).click();
  await page.getByRole('button', { name: /Find a peer/i }).click();
  await expect(page.getByRole('button', { name: /Leave queue/i })).toBeVisible();
  await page.getByRole('button', { name: /Leave queue/i }).click();
  await expect(page.getByRole('heading', { name: 'Transfer channels closed.' })).toBeVisible();
  await page.getByRole('button', { name: /Start again/i }).click();
  await expect(page.getByRole('heading', { name: 'Trade a file with a stranger.' })).toBeVisible();
});

test('reduced motion disables repeating animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?state=searching');
  const iterations = await page
    .locator('.beam i')
    .first()
    .evaluate((element) => getComputedStyle(element).animationIterationCount);
  expect(iterations).toBe('1');
});

test('privacy and safety briefing is keyboard-operable and technically accurate', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'PRIVACY / SAFETY' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('does not scan for malware');
  await expect(dialog).toContainText('TURN');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

for (const viewport of [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  const size = `${String(viewport.width)}x${String(viewport.height)}`;
  test(`capture key states at ${size}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const state of ['landing', 'searching', 'peer-review', 'exchanging', 'complete']) {
      await page.goto(`/?state=${state}`);
      await page.screenshot({
        path: `docs/screenshots/${state}-${size}.png`,
        fullPage: true,
      });
    }
  });
}
