import type { JarvisSettings } from '../types';
import { extractProposedScript } from './validation';

const SYSTEM_PROMPT = `Sos Jarvis Pocket, el asistente personal híbrido del usuario en Windows (i5-11400F, 16GB RAM, RX 590 8GB).
Respondé siempre en español rioplatense claro y conciso.
Si el usuario pide ejecutar una acción en su PC Windows, devolvé el comando exacto dentro de un bloque \`\`\`powershell ... \`\`\` para que la app le muestre el botón "TU SÍ (Aprobar y ejecutar)". Nunca inventes salidas de comandos que no corriste.`;

export interface AiReply {
  content: string;
  proposedScript?: string;
}

function buildOfflineSummary(prompt: string, attachmentText?: string): AiReply {
  const lower = prompt.toLowerCase();

  if (attachmentText && attachmentText.trim().length > 0) {
    const clean = attachmentText.replace(/\s+/g, ' ').trim();
    const sentences = clean
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.length > 20)
      .slice(0, 4);
    const words = clean.split(' ').length;
    const bullets =
      sentences.length > 0
        ? sentences.map((s) => `• ${s.slice(0, 180)}`).join('\n')
        : `• ${clean.slice(0, 260)}...`;
    return {
      content: `Resumen rápido (Modo Offline · ~${words} palabras leídas):\n\n${bullets}\n\nTip: Si cargás una Gemini API Key o LM Studio en Ajustes, te hago análisis profundo y preguntas sobre el archivo.`,
    };
  }

  if (lower.includes('espacio') || lower.includes('disco') || lower.includes('basura') || lower.includes('tb')) {
    const script =
      'Get-ChildItem "$env:USERPROFILE\\Downloads" -File -Recurse -ErrorAction SilentlyContinue | Sort-Object Length -Descending | Select-Object -First 10 Name, @{N="MB";E={[math]::Round($_.Length/1MB,1)}}';
    return {
      content:
        'Preparé un comando seguro de solo lectura para listar los 10 archivos más pesados de tu carpeta Descargas. Tocá **Aprobar y ejecutar** para correrlo en tu PC:',
      proposedScript: script,
    };
  }

  if (lower.includes('apagar') || lower.includes('shutdown')) {
    const script = 'shutdown /s /t 1800';
    return {
      content:
        'Listo: preparé el apagado programado en 30 minutos (1800s). Podés aprobarlo acá abajo o cancelarlo con `shutdown /a`:',
      proposedScript: script,
    };
  }

  if (lower.includes('ip') || lower.includes('red') || lower.includes('tailscale')) {
    const script = 'Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne "127.0.0.1" } | Select-Object InterfaceAlias, IPAddress';
    return {
      content: 'Con este comando podés ver tus IPs locales y de Tailscale en Windows:',
      proposedScript: script,
    };
  }

  return {
    content:
      'Estoy en **Modo Asistente Offline** (sin API Key cargada). Puedo:\n• Resumir archivos de texto/PDF que adjuntes.\n• Proponerte scripts PowerShell listos para aprobar (probá decir *"revisar espacio en disco"* o *"ver mi IP de Tailscale"*).\n• Si querés chat IA completo 24/7, cargá tu **Gemini API Key** o tu **LM Studio / Ollama (Vulkan)** en Ajustes.',
  };
}

export async function askJarvisBrain(
  prompt: string,
  settings: JarvisSettings,
  attachmentText?: string,
): Promise<AiReply> {
  const fullPrompt = attachmentText
    ? `${prompt}\n\n--- CONTENIDO ADJUNTO (extracto) ---\n${attachmentText.slice(0, 12000)}`
    : prompt;

  if (settings.aiProvider === 'offline') {
    return buildOfflineSummary(prompt, attachmentText);
  }

  if (settings.aiProvider === 'gemini') {
    if (!settings.aiApiKey.trim()) {
      return {
        content: 'Elegiste **Gemini API** pero todavía no pegaste tu API Key en Ajustes. Mientras tanto podés cambiar a Modo Offline o pegar tu clave.',
      };
    }
    const model = settings.aiModel.trim() || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(settings.aiApiKey.trim())}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Gemini API respondió ${res.status}`);
    }
    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') ||
      'Sin respuesta de Gemini.';
    return { content: text, proposedScript: extractProposedScript(text) || undefined };
  }

  // OpenAI-compatible (LM Studio / Ollama Vulkan on RX 590 or OpenAI)
  const endpoint = settings.localLlmUrl.trim() || 'http://localhost:1234/v1/chat/completions';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.aiApiKey.trim()) {
    headers.Authorization = `Bearer ${settings.aiApiKey.trim()}`;
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.aiModel.trim() || 'local-model',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: fullPrompt },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Servidor LLM respondió ${res.status}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || 'Sin respuesta del modelo.';
  return { content: text, proposedScript: extractProposedScript(text) || undefined };
}
