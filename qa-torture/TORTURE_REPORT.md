# Reporte de Tortura QA — Jarvis Pocket

- **Fecha:** 2026-11-23T03:46:55.092Z
- **Resultado Global:** ✅ TODAS LAS CAPAS EN VERDE (7/7)

## Resumen por Capa

| Capa | Estado |
| :--- | :--- |
| Capa 1 — Salud Estática, Build y Seguridad | ✅ PASS |
| Capa 2 — Auditoría de Empaquetado y Seguridad Electron | ⏭️ Omitida (Web/PWA) |
| Capa 3 — Fuzzing / Property-Based Testing (Vitest + fast-check) | ✅ PASS |
| Capa 4 — Flujos Críticos, Sabotaje de Red y Responsive (Playwright) | ✅ PASS |
| Capa 5 — Accesibilidad Automática (@axe-core/playwright) | ✅ PASS |
| Capa 6 — Modo Mono Caótico (gremlins.js) | ✅ PASS |
| Capa 7 — Estrés de Volumen y Memoria (Playwright) | ✅ PASS |

## Detalle

### Capa 1 — Salud Estática, Build y Seguridad
- **TypeScript (tsc --noEmit)**: ✅ OK (2315 ms)
```text
Sin errores de tipado.
```
- **Build de producción (npm run build)**: ✅ OK (4506 ms)
```text
Compilado correctamente.
```
- **Auditoría de dependencias (npm audit --omit=dev)**: ✅ OK (1246 ms)
```text
Sin vulnerabilidades críticas/altas en dependencias de producción.
```
- **Escaneo de secretos hardcodeados (src/, agent/, electron/)**: ✅ OK
```text
No se detectaron credenciales hardcodeadas.
```

### Capa 2 — Auditoría de Empaquetado y Seguridad Electron
- **Electron no detectado**: ✅ OK
```text
Proyecto web/PWA puro, capa omitida.
```

### Capa 3 — Fuzzing / Property-Based Testing (Vitest + fast-check)
- **Propiedades puras de validación y storage**: ✅ OK (1926 ms)
```text
[1m[30m[46m RUN [49m[39m[22m [36mv5.1.1 [39m[90mC:/Users/juanm/.gemini/antigravity/scratch/jarvis-pocket[39m

 [32m✓[39m qa-torture/fuzz/logic.fuzz.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 52[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m8 passed[39m[22m[90m (8)[39m
[2m   Start at [22m 00:46:32
[2m   Duration [22m 257ms[2m (tests 49%, import 31%, transform 14%, worker 5%)[22m
```

### Capa 4 — Flujos Críticos, Sabotaje de Red y Responsive (Playwright)
- **Sabotaje offline+F5, clics frenéticos, TU SÍ y mobile 390x844**: ✅ OK (5382 ms)
```text
Running 2 tests using 1 worker

  ok 1 qa-torture\e2e\sabotage.spec.ts:5:3 › Capa 4 — Flujos Críticos, Sabotaje de Red y Responsive › Recorre las 4 vistas, prueba guardrail TU SÍ, sabotaje offline+F5 y doble clic (753ms)
  ok 2 qa-torture\e2e\sabotage.spec.ts:55:3 › Capa 4 — Flujos Críticos, Sabotaje de Red y Responsive › Sabotaje 3 — Responsive Mobile 390x844 sin desborde horizontal (<= 16px) (390ms)

  2 passed (3.8s)
```

### Capa 5 — Accesibilidad Automática (@axe-core/playwright)
- **Auditoría WCAG 2.1 AA en todas las pestañas**: ✅ OK (6218 ms)
```text
Running 1 test using 1 worker

  ok 1 qa-torture\e2e\a11y.spec.ts:7:1 › Capa 5 — Accesibilidad WCAG 2.1 AA en todas las vistas (0 critical/serious) (1.9s)

  1 passed (4.7s)
```

### Capa 6 — Modo Mono Caótico (gremlins.js)
- **250 acciones caóticas con semilla determinista**: ✅ OK (6131 ms)
```text
Running 1 test using 1 worker

  ok 1 qa-torture\e2e\monkey.spec.ts:5:1 › Capa 6 — Modo Mono Caótico (gremlins.js, 250 acciones aleatorias) (2.0s)

  1 passed (4.6s)
```

### Capa 7 — Estrés de Volumen y Memoria (Playwright)
- **3.000 mensajes + 1.500 descargas y límites de DOM/rendimiento**: ✅ OK (4426 ms)
```text
Running 1 test using 1 worker

  ok 1 qa-torture\e2e\stress-volume.spec.ts:6:1 › Capa 7 — Estrés de Volumen y Memoria (3.000 mensajes + 1.500 descargas) (324ms)

  1 passed (2.9s)
```

## Métricas de Estrés (Capa 7)
```json
{
  "initialLoadMs": 140,
  "cobaltRenderMs": 59,
  "brainDomNodes": 199,
  "cobaltDomNodes": 325,
  "localStorageKB": 1776,
  "jsHeapMB": 9.5
}
```