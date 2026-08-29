import { readFile } from 'node:fs/promises';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { PeerSession, PeerSessionEvent } from '../apps/web/src/peer-session.js';

declare global {
  interface Window {
    ByteRoulette: { PeerSession: typeof PeerSession };
    testSession?: PeerSession;
    testEvents?: PeerSessionEvent[];
  }
}

async function startFileSession(
  page: Page,
  name: string,
  bytes: number[],
  type: string,
): Promise<void> {
  await page.evaluate(
    async ({ name, bytes, type }) => {
      window.testEvents = [];
      const file = new File([Uint8Array.from(bytes)], name, { type });
      window.testSession = new window.ByteRoulette.PeerSession(
        { signalUrl: new URL('/signal', location.href).href.replace(/^http/, 'ws'), file },
        (event) => window.testEvents?.push(event),
      );
      await window.testSession.start();
    },
    { name, bytes, type },
  );
}
async function useBlobFallback(...contexts: BrowserContext[]): Promise<void> {
  await Promise.all(
    contexts.map((context) =>
      context.addInitScript(() =>
        Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }),
      ),
    ),
  );
}

test('two browser contexts negotiate WebRTC, exchange metadata, and mutually consent', async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await useBlobFallback(firstContext, secondContext);
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await Promise.all([first.goto('/'), second.goto('/')]);
  await Promise.all([
    first.evaluate(async () => {
      window.testEvents = [];
      window.testSession = new window.ByteRoulette.PeerSession(
        {
          signalUrl: new URL('/signal', location.href).href.replace(/^http/, 'ws'),
          file: { name: 'alpha.txt', size: 5, type: 'text/plain' },
        },
        (event) => window.testEvents?.push(event),
      );
      await window.testSession.start();
    }),
    second.evaluate(async () => {
      window.testEvents = [];
      window.testSession = new window.ByteRoulette.PeerSession(
        {
          signalUrl: new URL('/signal', location.href).href.replace(/^http/, 'ws'),
          file: { name: 'βeta.bin', size: 7, type: 'application/octet-stream' },
        },
        (event) => window.testEvents?.push(event),
      );
      await window.testSession.start();
    }),
  ]);
  await expect
    .poll(() =>
      first.evaluate(() =>
        window.testEvents?.some(
          (event) => event.type === 'metadata' && event.metadata.name === 'βeta.bin',
        ),
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      second.evaluate(() =>
        window.testEvents?.some(
          (event) => event.type === 'metadata' && event.metadata.name === 'alpha.txt',
        ),
      ),
    )
    .toBe(true);
  expect(await first.evaluate(() => window.testSession?.canTransfer())).toBe(false);
  await first.evaluate(() => window.testSession?.accept());
  expect(await first.evaluate(() => window.testSession?.canTransfer())).toBe(false);
  await second.evaluate(() => window.testSession?.accept());
  await expect.poll(() => first.evaluate(() => window.testSession?.canTransfer())).toBe(true);
  await expect.poll(() => second.evaluate(() => window.testSession?.canTransfer())).toBe(true);
  await Promise.all([
    first.evaluate(() => window.testSession?.close()),
    second.evaluate(() => window.testSession?.close()),
  ]);
  await firstContext.close();
  await secondContext.close();
});

test('client sends signaling heartbeats while queued', async ({ page }) => {
  await page.addInitScript(() => {
    // Intentionally invoke the native method with the tracked WebSocket as `this`.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = WebSocket.prototype.send;
    const sent: string[] = [];
    Object.defineProperty(window, '__sentSignals', { value: sent });
    WebSocket.prototype.send = function (data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      if (typeof data === 'string') sent.push(data);
      Reflect.apply(original, this, [data]);
    };
  });
  await page.goto('/');
  await page.evaluate(async () => {
    window.testSession = new window.ByteRoulette.PeerSession(
      {
        signalUrl: new URL('/signal', location.href).href.replace(/^http/, 'ws'),
        file: { name: 'heartbeat.txt', size: 1, type: 'text/plain' },
      },
      () => undefined,
    );
    await window.testSession.start();
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const messages = (window as unknown as { __sentSignals: string[] }).__sentSignals;
          return messages.some((message) => {
            const parsed = JSON.parse(message) as unknown;
            return (
              typeof parsed === 'object' &&
              parsed !== null &&
              'type' in parsed &&
              parsed.type === 'heartbeat'
            );
          });
        }),
      { timeout: 15_000 },
    )
    .toBe(true);
  await page.evaluate(() => window.testSession?.close());
});

test('workflow review shows the actual peer-selected filename', async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await useBlobFallback(firstContext, secondContext);
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await Promise.all([first.goto('/'), second.goto('/')]);

  const chooseAndQueue = async (page: Page, name: string, mimeType: string) => {
    await page.getByRole('button', { name: /Begin exchange/i }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /I understand/i }).click();
    await (await chooser).setFiles({ name, mimeType, buffer: Buffer.from([1, 2, 3]) });
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await page.getByRole('button', { name: /Review exchange/i }).click();
    await page.getByRole('button', { name: /Find a peer/i }).click();
  };

  await Promise.all([
    chooseAndQueue(first, 'phone-photo.jpg', 'image/jpeg'),
    chooseAndQueue(second, 'desktop-image.png', 'image/png'),
  ]);
  await expect(first.getByRole('heading', { name: 'desktop-image.png' })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'phone-photo.jpg' })).toBeVisible();
  await expect(first.locator('[data-telemetry="session"]')).not.toHaveText('QUEUED');
  await expect(first.locator('[data-telemetry="transport"]')).toHaveText('WEBRTC / DTLS');
  await expect(first.locator('[data-telemetry="route"]')).toHaveText(
    /DIRECT|TURN RELAY|UNRESOLVED/,
  );

  await firstContext.close();
  await secondContext.close();
});

test('oversized Blob fallback is rejected before local consent', async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await useBlobFallback(firstContext, secondContext);
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await Promise.all([first.goto('/'), second.goto('/')]);
  await Promise.all([
    first.evaluate(async () => {
      window.testEvents = [];
      window.testSession = new window.ByteRoulette.PeerSession(
        {
          signalUrl: new URL('/signal', location.href).href.replace(/^http/, 'ws'),
          file: { name: 'small.bin', size: 1, type: 'application/octet-stream' },
        },
        (event) => window.testEvents?.push(event),
      );
      await window.testSession.start();
    }),
    second.evaluate(async () => {
      window.testEvents = [];
      window.testSession = new window.ByteRoulette.PeerSession(
        {
          signalUrl: new URL('/signal', location.href).href.replace(/^http/, 'ws'),
          file: {
            name: 'too-large.bin',
            size: 257 * 1024 * 1024,
            type: 'application/octet-stream',
          },
        },
        (event) => window.testEvents?.push(event),
      );
      await window.testSession.start();
    }),
  ]);
  await expect
    .poll(() => first.evaluate(() => window.testEvents?.some((event) => event.type === 'metadata')))
    .toBe(true);
  await expect(first.evaluate(() => window.testSession?.accept())).rejects.toThrow(
    'cannot receive a file that large',
  );
  expect(await first.evaluate(() => window.testSession?.canTransfer())).toBe(false);
  await firstContext.close();
  await secondContext.close();
});

test('one peer accepting does not remove the other peer consent controls', async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await useBlobFallback(firstContext, secondContext);
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await Promise.all([first.goto('/'), second.goto('/')]);

  const chooseAndQueue = async (page: Page, name: string) => {
    await page.getByRole('button', { name: /Begin exchange/i }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /I understand/i }).click();
    await (
      await chooser
    ).setFiles({
      name,
      mimeType: 'image/png',
      buffer: Buffer.from([1, 2, 3]),
    });
    await page.getByRole('button', { name: /Review exchange/i }).click();
    await page.getByRole('button', { name: /Find a peer/i }).click();
  };

  await Promise.all([chooseAndQueue(first, 'mobile.png'), chooseAndQueue(second, 'desktop.png')]);
  await expect(first.getByRole('button', { name: /Accept this exchange/i })).toBeVisible();
  await expect(second.getByRole('button', { name: /Accept this exchange/i })).toBeVisible();

  await first.getByRole('button', { name: /Accept this exchange/i }).click();
  await expect(first.getByRole('heading', { name: 'Waiting for your peer.' })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'mobile.png' })).toBeVisible();
  await expect(second.getByRole('button', { name: /Accept this exchange/i })).toBeVisible();

  await second.getByRole('button', { name: /Accept this exchange/i }).click();
  await expect(first.getByRole('heading', { name: 'Both payloads verified.' })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'Both payloads verified.' })).toBeVisible();
  const downloadPromise = first.waitForEvent('download');
  await first.getByRole('button', { name: /Save received file/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('desktop.png');
  const path = await download.path();
  if (!path) throw new Error('Downloaded file path unavailable');
  expect([...(await readFile(path))]).toEqual([1, 2, 3]);

  await firstContext.close();
  await secondContext.close();
});

test('peer rejection closes both sides before transfer permission', async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await useBlobFallback(firstContext, secondContext);
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await Promise.all([first.goto('/'), second.goto('/')]);
  await Promise.all([
    first.evaluate(async () => {
      window.testEvents = [];
      window.testSession = new window.ByteRoulette.PeerSession(
        {
          signalUrl: new URL('/signal', location.href).href.replace(/^http/, 'ws'),
          file: { name: 'one', size: 1, type: '' },
        },
        (event) => window.testEvents?.push(event),
      );
      await window.testSession.start();
    }),
    second.evaluate(async () => {
      window.testEvents = [];
      window.testSession = new window.ByteRoulette.PeerSession(
        {
          signalUrl: new URL('/signal', location.href).href.replace(/^http/, 'ws'),
          file: { name: 'two', size: 2, type: '' },
        },
        (event) => window.testEvents?.push(event),
      );
      await window.testSession.start();
    }),
  ]);
  await expect
    .poll(() => first.evaluate(() => window.testEvents?.some((event) => event.type === 'metadata')))
    .toBe(true);
  await first.evaluate(() => window.testSession?.reject());
  await expect
    .poll(() =>
      second.evaluate(() =>
        window.testEvents?.some(
          (event) => event.type === 'error' && event.message.includes('rejected'),
        ),
      ),
    )
    .toBe(true);
  expect(await second.evaluate(() => window.testSession?.canTransfer())).toBe(false);
  await firstContext.close();
  await secondContext.close();
});

test('bidirectional Unicode and binary files transfer without modification', async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await useBlobFallback(firstContext, secondContext);
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await Promise.all([first.goto('/'), second.goto('/')]);
  await Promise.all([
    startFileSession(first, '雪-notes.txt', [104, 101, 108, 108, 111], 'text/plain'),
    startFileSession(second, 'nulls.bin', [0, 255, 0, 1], 'application/octet-stream'),
  ]);
  await expect
    .poll(() => first.evaluate(() => window.testEvents?.some((event) => event.type === 'metadata')))
    .toBe(true);
  await expect
    .poll(() =>
      second.evaluate(() => window.testEvents?.some((event) => event.type === 'metadata')),
    )
    .toBe(true);
  await Promise.all([
    first.evaluate(() => window.testSession?.accept()),
    second.evaluate(() => window.testSession?.accept()),
  ]);
  await expect
    .poll(() => first.evaluate(() => window.testEvents?.some((event) => event.type === 'received')))
    .toBe(true);
  await expect
    .poll(() =>
      second.evaluate(() => window.testEvents?.some((event) => event.type === 'received')),
    )
    .toBe(true);
  const firstBytes = await first.evaluate(async () => {
    const event = window.testEvents?.find((item) => item.type === 'received');
    return event?.type === 'received' ? [...new Uint8Array(await event.blob.arrayBuffer())] : [];
  });
  const secondText = await second.evaluate(async () => {
    const event = window.testEvents?.find((item) => item.type === 'received');
    return event?.type === 'received' ? event.blob.text() : '';
  });
  expect(firstBytes).toEqual([0, 255, 0, 1]);
  expect(secondText).toBe('hello');
  await firstContext.close();
  await secondContext.close();
});

test('empty files transfer and verify', async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await useBlobFallback(firstContext, secondContext);
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await Promise.all([first.goto('/'), second.goto('/')]);
  await Promise.all([
    startFileSession(first, 'empty.bin', [], 'application/octet-stream'),
    startFileSession(second, 'empty-二.txt', [], 'text/plain'),
  ]);
  await expect
    .poll(() => first.evaluate(() => window.testEvents?.some((event) => event.type === 'metadata')))
    .toBe(true);
  await expect
    .poll(() =>
      second.evaluate(() => window.testEvents?.some((event) => event.type === 'metadata')),
    )
    .toBe(true);
  await Promise.all([
    first.evaluate(() => window.testSession?.accept()),
    second.evaluate(() => window.testSession?.accept()),
  ]);
  await expect
    .poll(() => first.evaluate(() => window.testEvents?.some((event) => event.type === 'received')))
    .toBe(true);
  await expect
    .poll(() =>
      second.evaluate(() => window.testEvents?.some((event) => event.type === 'received')),
    )
    .toBe(true);
  expect(
    await first.evaluate(() => {
      const event = window.testEvents?.find((item) => item.type === 'received');
      return event?.type === 'received' ? event.blob.size : -1;
    }),
  ).toBe(0);
  await firstContext.close();
  await secondContext.close();
});

test('a deliberately changed byte fails integrity verification', async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await useBlobFallback(firstContext, secondContext);
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await Promise.all([first.goto('/'), second.goto('/')]);
  await first.evaluate(() => {
    // Intentionally invoke the native method with the intercepted channel as `this`.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = RTCDataChannel.prototype.send;
    let changed = false;
    RTCDataChannel.prototype.send = function (data: string | ArrayBuffer | ArrayBufferView | Blob) {
      let outgoing = data;
      if (!changed && data instanceof ArrayBuffer && data.byteLength > 20) {
        const copy = data.slice(0);
        new Uint8Array(copy)[20] ^= 1;
        outgoing = copy;
        changed = true;
      }
      Reflect.apply(original, this, [outgoing]);
    };
  });
  await Promise.all([
    startFileSession(first, 'changed.bin', [1, 2, 3, 4], 'application/octet-stream'),
    startFileSession(second, 'peer.bin', [5, 6, 7], 'application/octet-stream'),
  ]);
  await expect
    .poll(() => first.evaluate(() => window.testEvents?.some((event) => event.type === 'metadata')))
    .toBe(true);
  await expect
    .poll(() =>
      second.evaluate(() => window.testEvents?.some((event) => event.type === 'metadata')),
    )
    .toBe(true);
  await Promise.all([
    first.evaluate(() => window.testSession?.accept()),
    second.evaluate(() => window.testSession?.accept()),
  ]);
  await expect
    .poll(() =>
      second.evaluate(() => window.testEvents?.some((event) => event.type === 'integrity-failure')),
    )
    .toBe(true);
  await firstContext.close();
  await secondContext.close();
});
