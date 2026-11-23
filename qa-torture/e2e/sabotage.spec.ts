import { test, expect } from '@playwright/test';
import { attachErrorCollectors, isolateNetwork } from './helpers';

test.describe('Capa 4 — Flujos Críticos, Sabotaje de Red y Responsive', () => {
  test('Recorre las 4 vistas, prueba guardrail TU SÍ, sabotaje offline+F5 y doble clic', async ({ page, context }) => {
    await isolateNetwork(page);
    const errors = attachErrorCollectors(page);

    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(page.getByRole('heading', { name: 'Jarvis Pocket' })).toBeVisible();

    // Test Brain IA + TU SI native <dialog>
    const promptInput = page.getByLabel('Mensaje para Jarvis');
    await promptInput.fill('revisar espacio en disco');
    const sendBtn = page.getByRole('button', { name: 'Enviar mensaje a Jarvis' });
    // Sabotaje 2: Doble/triple clic frenético
    await Promise.all([sendBtn.click(), sendBtn.click(), sendBtn.click()]);

    await expect(page.getByRole('button', { name: /Revisar y aprobar \(TU SÍ\)/i }).first()).toBeVisible();
    await page.getByRole('button', { name: /Revisar y aprobar \(TU SÍ\)/i }).first().click();

    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();

    // Navigate all 4 tabs
    await page.getByRole('button', { name: 'Cobalt', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Descargador estilo Cobalt/i })).toBeVisible();

    await page.getByLabel('Link del video o audio').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.getByRole('button', { name: 'Descargar ahora' }).click();
    await expect(page.getByText(/youtube · video/i)).toBeVisible();

    await page.getByRole('button', { name: 'PC', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Control Remoto Windows/i })).toBeVisible();

    await page.getByRole('button', { name: 'Archivos', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Puente de Archivos/i })).toBeVisible();

    // Sabotaje 1: Offline + F5 recovery
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Cerebro', exact: true }).click();
    await expect(page.locator('#root')).not.toBeEmpty();
    await context.setOffline(false);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Jarvis Pocket' })).toBeVisible();

    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.failedRequests).toEqual([]);
  });

  test('Sabotaje 3 — Responsive Mobile 390x844 sin desborde horizontal (<= 16px)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await isolateNetwork(page);
    const errors = attachErrorCollectors(page);

    await page.goto('/');

    for (const tabName of ['Cerebro', 'Cobalt', 'PC', 'Archivos']) {
      await page.getByRole('button', { name: tabName, exact: true }).click();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `Desborde horizontal en pestaña ${tabName}`).toBeLessThanOrEqual(16);
    }

    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });
});
