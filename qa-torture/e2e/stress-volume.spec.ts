import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { attachErrorCollectors, isolateNetwork } from './helpers';

test('Capa 7 — Estrés de Volumen y Memoria (3.000 mensajes + 1.500 descargas)', async ({ page }) => {
  await isolateNetwork(page);
  const errors = attachErrorCollectors(page);

  await page.addInitScript(() => {
    const now = new Date().toISOString();
    const messages = Array.from({ length: 3000 }, (_, i) => ({
      id: `stress-msg-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Mensaje de estrés #${i} verificando paginación y rendimiento de Jarvis Pocket.`,
      createdAt: now,
    }));
    const jobs = Array.from({ length: 1500 }, (_, i) => ({
      id: `stress-job-${i}`,
      url: `https://www.youtube.com/watch?v=video${i}`,
      platform: 'youtube',
      mode: i % 2 === 0 ? 'video' : 'audio',
      quality: '1080',
      destination: 'pc',
      engine: 'yt-dlp',
      status: 'completed',
      progress: 'Guardado en JarvisDownloads',
      createdAt: now,
    }));
    localStorage.setItem('jarvis_pocket_messages_v1', JSON.stringify(messages));
    localStorage.setItem('jarvis_pocket_jobs_v1', JSON.stringify(jobs));
  });

  const startLoad = Date.now();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Jarvis Pocket' })).toBeVisible();
  const initialLoadMs = Date.now() - startLoad;

  const brainNodes = await page.evaluate(() => document.querySelectorAll('*').length);

  const startCobalt = Date.now();
  await page.getByRole('button', { name: 'Cobalt' }).click();
  await expect(page.getByText(/Historial de descargas \(1500\)/)).toBeVisible();
  const cobaltRenderMs = Date.now() - startCobalt;

  const cobaltNodes = await page.evaluate(() => document.querySelectorAll('*').length);

  const storageAndHeap = await page.evaluate(() => {
    let bytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || '';
      bytes += (k.length + (localStorage.getItem(k) || '').length) * 2;
    }
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return {
      localStorageKB: Math.round(bytes / 1024),
      jsHeapMB: mem ? Math.round((mem.usedJSHeapSize / 1024 / 1024) * 10) / 10 : null,
    };
  });

  const metrics = {
    initialLoadMs,
    cobaltRenderMs,
    brainDomNodes: brainNodes,
    cobaltDomNodes: cobaltNodes,
    ...storageAndHeap,
  };

  const artifactsDir = path.resolve(process.cwd(), 'qa-torture/artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(path.join(artifactsDir, 'stress-metrics.json'), JSON.stringify(metrics, null, 2));

  expect(initialLoadMs).toBeLessThan(10_000);
  expect(cobaltRenderMs).toBeLessThan(6_000);
  expect(brainNodes).toBeLessThan(15_000);
  expect(cobaltNodes).toBeLessThan(15_000);
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});
