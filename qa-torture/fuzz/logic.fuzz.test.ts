import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  calcDiskUsagePercent,
  clampShutdownMinutes,
  classifyScriptRisk,
  detectMediaPlatform,
  extractProposedScript,
  formatBytes,
  normalizeAgentUrl,
  sanitizeFilename,
} from '../../src/lib/validation';
import { mergeById } from '../../src/lib/storage';

describe('Capa 3 — Fuzzing / Property-Based Testing (Jarvis Pocket)', () => {
  it('formatBytes nunca devuelve NaN, Infinity ni valores negativos', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.double(), fc.constant(NaN), fc.constant(Infinity), fc.constant(-Infinity), fc.integer()),
        (n) => {
          const out = formatBytes(n);
          expect(typeof out).toBe('string');
          expect(out).not.toContain('NaN');
          expect(out).not.toContain('Infinity');
          expect(out.startsWith('-')).toBe(false);
        },
      ),
    );
  });

  it('calcDiskUsagePercent siempre devuelve un porcentaje finito entre 0 y 100', () => {
    fc.assert(
      fc.property(fc.double(), fc.double(), (used, total) => {
        const pct = calcDiskUsagePercent(used, total);
        expect(Number.isFinite(pct)).toBe(true);
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
      }),
    );
  });

  it('sanitizeFilename bloquea path traversal, slashes y strings vacíos', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.constant('../../Windows/System32/cmd.exe'),
          fc.constant('..\\..\\secret.txt'),
          fc.constant('   '),
          fc.constant('🔥🚀 archivo:malo*?.pdf'),
        ),
        (raw) => {
          const safe = sanitizeFilename(raw);
          expect(safe.length).toBeGreaterThan(0);
          expect(safe.length).toBeLessThanOrEqual(140);
          expect(safe).not.toContain('/');
          expect(safe).not.toContain('\\');
          expect(safe).not.toContain('..');
          expect(safe).not.toBe('.');
        },
      ),
    );
  });

  it('normalizeAgentUrl solo acepta http/https y nunca lanza excepciones', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.webUrl(),
          fc.constant('javascript:alert(1)'),
          fc.constant('file:///C:/Windows/win.ini'),
        ),
        (raw) => {
          const out = normalizeAgentUrl(raw);
          expect(typeof out).toBe('string');
          if (out) {
            expect(out.startsWith('http://') || out.startsWith('https://')).toBe(true);
            expect(out.endsWith('/')).toBe(false);
          }
        },
      ),
    );
  });

  it('detectMediaPlatform clasifica URLs arbitrarias sin lanzar excepciones', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.webUrl()), (raw) => {
        const res = detectMediaPlatform(raw);
        expect(typeof res.valid).toBe('boolean');
        if (!res.valid) {
          expect(res.platform).toBe('invalid');
        }
      }),
    );
  });

  it('clampShutdownMinutes siempre retorna un entero entre 1 y 480', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.double(), fc.constant(NaN), fc.constant(Infinity), fc.constant(-Infinity)),
        (n) => {
          const out = clampShutdownMinutes(n);
          expect(Number.isInteger(out)).toBe(true);
          expect(out).toBeGreaterThanOrEqual(1);
          expect(out).toBeLessThanOrEqual(480);
        },
      ),
    );
  });

  it('classifyScriptRisk y extractProposedScript nunca lanzan excepciones ante entradas arbitrarias', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const risk = classifyScriptRisk(text);
        expect(['low', 'medium', 'high']).toContain(risk.level);
        expect(Array.isArray(risk.reasons)).toBe(true);

        const extracted = extractProposedScript(text);
        expect(extracted === null || typeof extracted === 'string').toBe(true);
      }),
    );

    expect(classifyScriptRisk('Remove-Item -Recurse -Force C:\\temp').level).toBe('high');
    expect(classifyScriptRisk('shutdown /s /t 60').level).toBe('high');
    expect(classifyScriptRisk('taskkill /PID 1234 /F').level).toBe('medium');
  });

  it('mergeById no duplica IDs ni pierde registros únicos dentro del límite', () => {
    const itemArb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 12 }),
      value: fc.string({ maxLength: 20 }),
    });
    fc.assert(
      fc.property(fc.array(itemArb, { maxLength: 40 }), fc.array(itemArb, { maxLength: 40 }), (a, b) => {
        const merged = mergeById(a, b, 500);
        const ids = merged.map((x) => x.id);
        expect(new Set(ids).size).toBe(ids.length);

        const expectedUniqueIds = new Set([...a, ...b].map((x) => x.id));
        expect(merged.length).toBe(expectedUniqueIds.size);
      }),
    );
  });
});
