import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { runStaticAudit } from './checks/static-audit.mjs';
import { runElectronAudit } from './checks/electron-audit.mjs';

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, 'qa-torture/TORTURE_REPORT.md');

function runCmdLayer(layer, name, cmd) {
  const start = Date.now();
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    return {
      layer,
      passed: true,
      checks: [{ name, ok: true, durationMs: Date.now() - start, details: out.trim().slice(-1200) || 'OK' }],
    };
  } catch (err) {
    const output = ((err.stdout || '') + '\n' + (err.stderr || '')).trim();
    return {
      layer,
      passed: false,
      checks: [{ name, ok: false, durationMs: Date.now() - start, details: output.slice(-2000) || 'Falló el comando' }],
    };
  }
}

const layers = [];

console.log('\n=== Iniciando Protocolo Estándar de Tortura QA (7 Capas) ===\n');

// Capa 1
console.log('[1/7] Salud Estática, Build y Seguridad...');
layers.push(runStaticAudit());

// Capa 2
console.log('[2/7] Auditoría Electron...');
layers.push(runElectronAudit());

// Capa 3
console.log('[3/7] Fuzzing / Property-Based Testing (Vitest + fast-check)...');
layers.push(
  runCmdLayer(
    'Capa 3 — Fuzzing / Property-Based Testing (Vitest + fast-check)',
    'Propiedades puras de validación y storage',
    'npx vitest run qa-torture/fuzz/logic.fuzz.test.ts',
  ),
);

// Capa 4
console.log('[4/7] Flujos Críticos, Sabotaje de Red y Responsive...');
layers.push(
  runCmdLayer(
    'Capa 4 — Flujos Críticos, Sabotaje de Red y Responsive (Playwright)',
    'Sabotaje offline+F5, clics frenéticos, TU SÍ y mobile 390x844',
    'npx playwright test -c qa-torture/playwright.config.ts qa-torture/e2e/sabotage.spec.ts',
  ),
);

// Capa 5
console.log('[5/7] Accesibilidad Automática (axe-core WCAG 2.1 AA)...');
layers.push(
  runCmdLayer(
    'Capa 5 — Accesibilidad Automática (@axe-core/playwright)',
    'Auditoría WCAG 2.1 AA en todas las pestañas',
    'npx playwright test -c qa-torture/playwright.config.ts qa-torture/e2e/a11y.spec.ts',
  ),
);

// Capa 6
console.log('[6/7] Modo Mono Caótico (gremlins.js)...');
layers.push(
  runCmdLayer(
    'Capa 6 — Modo Mono Caótico (gremlins.js)',
    '250 acciones caóticas con semilla determinista',
    'npx playwright test -c qa-torture/playwright.config.ts qa-torture/e2e/monkey.spec.ts',
  ),
);

// Capa 7
console.log('[7/7] Estrés de Volumen y Memoria...');
layers.push(
  runCmdLayer(
    'Capa 7 — Estrés de Volumen y Memoria (Playwright)',
    '3.000 mensajes + 1.500 descargas y límites de DOM/rendimiento',
    'npx playwright test -c qa-torture/playwright.config.ts qa-torture/e2e/stress-volume.spec.ts',
  ),
);

const allPassed = layers.every((l) => l.passed);
let stressSummary = '';
const stressPath = path.join(ROOT, 'qa-torture/artifacts/stress-metrics.json');
if (fs.existsSync(stressPath)) {
  stressSummary = fs.readFileSync(stressPath, 'utf-8');
}

const mdLines = [
  '# Reporte de Tortura QA — Jarvis Pocket',
  '',
  `- **Fecha:** ${new Date().toISOString()}`,
  `- **Resultado Global:** ${allPassed ? '✅ TODAS LAS CAPAS EN VERDE (7/7)' : '❌ FALLOS DETECTADOS'}`,
  '',
  '## Resumen por Capa',
  '',
  '| Capa | Estado |',
  '| :--- | :--- |',
  ...layers.map((l) => `| ${l.layer} | ${l.skipped ? '⏭️ Omitida (Web/PWA)' : l.passed ? '✅ PASS' : '❌ FAIL'} |`),
  '',
  '## Detalle',
  '',
];

for (const l of layers) {
  mdLines.push(`### ${l.layer}`);
  for (const c of l.checks) {
    mdLines.push(`- **${c.name}**: ${c.ok ? '✅ OK' : '❌ FAIL'}${c.durationMs ? ` (${c.durationMs} ms)` : ''}`);
    if (c.details) {
      mdLines.push('```text');
      mdLines.push(c.details);
      mdLines.push('```');
    }
  }
  mdLines.push('');
}

if (stressSummary) {
  mdLines.push('## Métricas de Estrés (Capa 7)');
  mdLines.push('```json');
  mdLines.push(stressSummary);
  mdLines.push('```');
}

fs.writeFileSync(REPORT_PATH, mdLines.join('\n'), 'utf-8');
console.log(`\nReporte generado en: ${REPORT_PATH}`);
console.log(allPassed ? '✅ PROTOCOLO DE TORTURA QA SUPERADO (7/7)!' : '❌ Se encontraron fallos. Revisá TORTURE_REPORT.md.');
process.exit(allPassed ? 0 : 1);
