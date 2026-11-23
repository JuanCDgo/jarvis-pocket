import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { AiProvider, JarvisSettings } from '../types';
import { normalizeAgentUrl } from '../lib/validation';

interface SettingsDialogProps {
  open: boolean;
  settings: JarvisSettings;
  onSave: (next: JarvisSettings) => void;
  onClose: () => void;
}

export function SettingsDialog({ open, settings, onSave, onClose }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<JarvisSettings>(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedAgent = normalizeAgentUrl(draft.agentUrl) || 'http://localhost:8787';
    onSave({
      ...draft,
      agentUrl: cleanedAgent,
      cobaltUrl: normalizeAgentUrl(draft.cobaltUrl),
    });
    onClose();
  };

  return (
    <dialog ref={dialogRef} aria-labelledby="settings-dialog-title">
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 id="settings-dialog-title" className="text-lg font-bold text-slate-100">
            Conexión Híbrida y Cerebro IA
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ajustes"
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-sm">
          <div>
            <label htmlFor="agent-url" className="block text-xs font-semibold text-slate-300 mb-1">
              URL del Windows Agent (Wi-Fi local o Tailscale)
            </label>
            <input
              id="agent-url"
              type="url"
              value={draft.agentUrl}
              onChange={(e) => setDraft({ ...draft, agentUrl: e.target.value })}
              placeholder="http://100.x.x.x:8787"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500"
            />
          </div>

          <div>
            <label htmlFor="agent-token" className="block text-xs font-semibold text-slate-300 mb-1">
              Token del Windows Agent (de tu consola / .env)
            </label>
            <input
              id="agent-token"
              type="password"
              value={draft.agentToken}
              onChange={(e) => setDraft({ ...draft, agentToken: e.target.value })}
              placeholder="Pegá el JARVIS_TOKEN generado en tu PC"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500"
            />
          </div>

          <hr className="border-slate-800" />

          <div>
            <label htmlFor="ai-provider" className="block text-xs font-semibold text-slate-300 mb-1">
              Cerebro IA (funciona 24/7 en Modo Nube o local en tu RX 590)
            </label>
            <select
              id="ai-provider"
              value={draft.aiProvider}
              onChange={(e) => setDraft({ ...draft, aiProvider: e.target.value as AiProvider })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            >
              <option value="offline">Modo Offline / Asistente Integrado (sin API Key)</option>
              <option value="gemini">Gemini API (Nube 24/7)</option>
              <option value="openai-compat">LM Studio / Ollama (Vulkan en RX 590) u OpenAI</option>
            </select>
          </div>

          {draft.aiProvider !== 'offline' && (
            <>
              <div>
                <label htmlFor="ai-key" className="block text-xs font-semibold text-slate-300 mb-1">
                  API Key (opcional si usás LM Studio / Ollama local)
                </label>
                <input
                  id="ai-key"
                  type="password"
                  value={draft.aiApiKey}
                  onChange={(e) => setDraft({ ...draft, aiApiKey: e.target.value })}
                  placeholder="Tu clave personal (solo se guarda en este dispositivo)"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500"
                />
              </div>

              <div>
                <label htmlFor="ai-model" className="block text-xs font-semibold text-slate-300 mb-1">
                  Modelo
                </label>
                <input
                  id="ai-model"
                  type="text"
                  value={draft.aiModel}
                  onChange={(e) => setDraft({ ...draft, aiModel: e.target.value })}
                  placeholder="gemini-2.5-flash o qwen2.5-7b-instruct"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500"
                />
              </div>
            </>
          )}

          {draft.aiProvider === 'openai-compat' && (
            <div>
              <label htmlFor="local-llm-url" className="block text-xs font-semibold text-slate-300 mb-1">
                Endpoint OpenAI-compatible (LM Studio / Ollama)
              </label>
              <input
                id="local-llm-url"
                type="url"
                value={draft.localLlmUrl}
                onChange={(e) => setDraft({ ...draft, localLlmUrl: e.target.value })}
                placeholder="http://localhost:1234/v1/chat/completions"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500"
              />
            </div>
          )}

          <div>
            <label htmlFor="cobalt-url" className="block text-xs font-semibold text-slate-300 mb-1">
              URL de Cobalt API (opcional, para bajar al celu 24/7)
            </label>
            <input
              id="cobalt-url"
              type="url"
              value={draft.cobaltUrl}
              onChange={(e) => setDraft({ ...draft, cobaltUrl: e.target.value })}
              placeholder="https://tu-instancia-cobalt.example.com"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 font-semibold text-slate-100 hover:bg-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-lg bg-sky-500 px-4 py-2 font-bold text-slate-950 hover:bg-sky-400"
            >
              Guardar
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
