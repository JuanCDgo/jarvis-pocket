import type { MediaPlatform, ScriptRiskLevel } from '../types';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  const decimals = idx === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[idx]}`;
}

export function calcDiskUsagePercent(usedBytes: number, totalBytes: number): number {
  if (!Number.isFinite(usedBytes) || !Number.isFinite(totalBytes) || totalBytes <= 0 || usedBytes <= 0) {
    return 0;
  }
  const pct = (usedBytes / totalBytes) * 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, Math.round(pct * 10) / 10));
}

export function sanitizeFilename(input: string): string {
  const raw = String(input ?? '');
  const base = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replace(/\.\.+/g, '.')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, 140);
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return 'archivo.bin';
  }
  return cleaned;
}

export function normalizeAgentUrl(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function detectMediaPlatform(rawUrl: string): {
  valid: boolean;
  platform: MediaPlatform;
  normalizedUrl: string;
} {
  const trimmed = String(rawUrl ?? '').trim();
  if (!trimmed) {
    return { valid: false, platform: 'invalid', normalizedUrl: '' };
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { valid: false, platform: 'invalid', normalizedUrl: '' };
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let platform: MediaPlatform = 'other';
    if (host === 'youtu.be' || host.endsWith('youtube.com')) platform = 'youtube';
    else if (host.endsWith('instagram.com') || host === 'instagr.am') platform = 'instagram';
    else if (host.endsWith('tiktok.com')) platform = 'tiktok';
    else if (host === 'x.com' || host.endsWith('twitter.com')) platform = 'x';
    else if (host.endsWith('reddit.com') || host === 'redd.it') platform = 'reddit';
    else if (host.endsWith('soundcloud.com')) platform = 'soundcloud';

    return { valid: true, platform, normalizedUrl: url.toString() };
  } catch {
    return { valid: false, platform: 'invalid', normalizedUrl: '' };
  }
}

export function clampShutdownMinutes(value: number): number {
  if (!Number.isFinite(value)) return 15;
  const rounded = Math.round(value);
  if (rounded < 1) return 1;
  if (rounded > 480) return 480;
  return rounded;
}

const HIGH_RISK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(remove-item|rm\s+-rf|del\s+\/f|format-volume|diskpart|cipher\s+\/w)\b/i, reason: 'Borrado o formateo destructivo' },
  { pattern: /\b(shutdown|restart-computer|stop-computer)\b/i, reason: 'Apagado o reinicio del sistema' },
  { pattern: /\b(reg\s+delete|set-executionpolicy|invoke-expression|iex\b)\b/i, reason: 'Modificación de registro o ejecución dinámica' },
];

const MEDIUM_RISK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(stop-process|taskkill|kill)\b/i, reason: 'Cierre forzado de procesos' },
  { pattern: /\b(invoke-webrequest|curl|wget|start-bitstransfer)\b/i, reason: 'Descarga o tráfico de red externo' },
  { pattern: /\b(move-item|rename-item|set-content|out-file)\b/i, reason: 'Escritura o modificación de archivos' },
];

export function classifyScriptRisk(command: string): { level: ScriptRiskLevel; reasons: string[] } {
  const cmd = String(command ?? '').trim();
  if (!cmd) return { level: 'low', reasons: [] };

  const reasons: string[] = [];
  for (const rule of HIGH_RISK_PATTERNS) {
    if (rule.pattern.test(cmd)) reasons.push(rule.reason);
  }
  if (reasons.length > 0) return { level: 'high', reasons };

  for (const rule of MEDIUM_RISK_PATTERNS) {
    if (rule.pattern.test(cmd)) reasons.push(rule.reason);
  }
  if (reasons.length > 0) return { level: 'medium', reasons };

  return { level: 'low', reasons: ['Comando de lectura o consulta general'] };
}

export function extractProposedScript(text: string): string | null {
  const raw = String(text ?? '');
  const match = raw.match(/```(?:powershell|ps1|pwsh|cmd)\s*\r?\n([\s\S]*?)```/i);
  if (!match) return null;
  const script = match[1].trim();
  return script.length > 0 ? script : null;
}
