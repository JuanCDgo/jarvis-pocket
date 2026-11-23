import type { Page } from '@playwright/test';

export async function isolateNetwork(page: Page) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      await route.continue();
      return;
    }
    try {
      const parsed = new URL(url);
      const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (!isLocal) {
        await route.abort();
        return;
      }
      // Mock local Windows Agent port 8787 so tests never hit a live PC agent
      if (parsed.port === '8787') {
        if (parsed.pathname === '/api/health') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              hostname: 'JARVIS-MOCK-PC',
              platform: 'win32',
              uptimeSec: 3600,
              cpuModel: 'Intel Core i5-11400F',
              cpuCores: 12,
              ramTotalBytes: 16 * 1024 ** 3,
              ramFreeBytes: 8 * 1024 ** 3,
              disks: [
                {
                  drive: 'C:',
                  label: 'Windows',
                  totalBytes: 4.29 * 1024 ** 4,
                  usedBytes: 3.21 * 1024 ** 4,
                  freeBytes: 1.08 * 1024 ** 4,
                },
              ],
              tools: { ytDlp: true, ffmpeg: true, cobaltConfigured: false },
              folders: { drop: 'C:\\Users\\mock\\JarvisDrop', downloads: 'C:\\Users\\mock\\JarvisDownloads' },
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, files: [], processes: [], jobs: [], stdout: 'Mock OK', exitCode: 0 }),
        });
        return;
      }
      await route.continue();
    } catch {
      await route.abort();
    }
  });
}

export function attachErrorCollectors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('response', (res) => {
    const url = res.url();
    if ((url.startsWith('http://127.0.0.1:4173') || url.startsWith('http://localhost:4173')) && res.status() >= 400) {
      failedRequests.push(`${res.status()} ${url}`);
    }
  });

  return { pageErrors, consoleErrors, failedRequests };
}
