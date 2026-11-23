import { test, expect } from '@playwright/test';
import path from 'node:path';
import { attachErrorCollectors, isolateNetwork } from './helpers';

test('Capa 6 — Modo Mono Caótico (gremlins.js, 250 acciones aleatorias)', async ({ page }) => {
  await isolateNetwork(page);
  const errors = attachErrorCollectors(page);

  await page.addInitScript(() => {
    window.alert = () => {};
    window.confirm = () => true;
    window.prompt = () => '';
  });

  await page.goto('/');
  await page.addScriptTag({
    path: path.resolve(process.cwd(), 'node_modules/gremlins.js/dist/gremlins.min.js'),
  });

  await page.evaluate(async () => {
    const g = (window as unknown as { gremlins: any }).gremlins;
    const horde = g.createHorde({
      randomizer: new g.Chance(20261123),
      species: [
        g.species.clicker({ clickTypes: ['click'] }),
        g.species.formFiller(),
        g.species.typer(),
        g.species.scroller(),
      ],
      strategies: [g.strategies.distribution({ delay: 5, nb: 250 })],
    });
    await horde.unleash();
  });

  await expect(page.locator('#root')).not.toBeEmpty();
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
});
