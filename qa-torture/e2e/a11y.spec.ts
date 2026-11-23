import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { isolateNetwork } from './helpers';

test('Capa 5 — Accesibilidad WCAG 2.1 AA en todas las vistas (0 critical/serious)', async ({ page }) => {
  await isolateNetwork(page);
  await page.goto('/');

  const report: Record<string, unknown> = {};
  const blockingViolations: Array<{ tab: string; id: string; impact: string | null | undefined; help: string }> = [];

  for (const tabName of ['Cerebro', 'Cobalt', 'PC', 'Archivos']) {
    await page.getByRole('button', { name: tabName, exact: true }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    report[tabName] = results.violations;
    for (const v of results.violations) {
      if (v.impact === 'critical' || v.impact === 'serious') {
        blockingViolations.push({ tab: tabName, id: v.id, impact: v.impact, help: v.help });
      }
    }
  }

  const artifactsDir = path.resolve(process.cwd(), 'qa-torture/artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(path.join(artifactsDir, 'a11y-report.json'), JSON.stringify(report, null, 2));

  expect(blockingViolations, JSON.stringify(blockingViolations, null, 2)).toEqual([]);
});
