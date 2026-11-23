import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain,
  Download,
  Monitor,
  FolderSync,
  Settings,
  Send,
  Paperclip,
  Terminal,
  Camera,
  Power,
  RefreshCw,
  Upload,
  HardDrive,
  Wifi,
  Cloud,
  Trash2,
  Play,
  ShieldCheck,
  Search,
} from 'lucide-react';
import type {
  ActiveTab,
  AgentHealth,
  ChatMessage,
  DownloadJob,
  JarvisSettings,
  PendingApproval,
  ProcessItem,
  RemoteFile,
} from './types';
import {
  calcDiskUsagePercent,
  clampShutdownMinutes,
  classifyScriptRisk,
  detectMediaPlatform,
  formatBytes,
  normalizeAgentUrl,
  sanitizeFilename,
} from './lib/validation';
import { DEFAULT_SETTINGS, mergeById, safeLoadJson, safeSaveJson, STORAGE_KEYS } from './lib/storage';
import { askJarvisBrain } from './lib/ai';
import { ApprovalDialog } from './components/ApprovalDialog';
import { SettingsDialog } from './components/SettingsDialog';

const PAGE_SIZE = 30;

const INITIAL_WELCOME: ChatMessage = {
  id: 'welcome-jarvis',
  role: 'assistant',
  content:
    'Hola Juan. Soy **Jarvis Pocket** en Modo Híbrido. Aunque tu PC esté apagada, podés usar el **Cerebro IA**, resumir archivos y preparar descargas. Cuando tu Windows Agent esté online (Wi-Fi o Tailscale), se activan el **Puente de Archivos**, **Capturas**, **Control PC** y **Scripts con TU SÍ**.',
  createdAt: new Date().toISOString(),
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('brain');
  const [settings, setSettings] = useState<JarvisSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...safeLoadJson<Partial<JarvisSettings>>(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
  }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [approval, setApproval] = useState<PendingApproval | null>(null);
  const [statusBanner, setStatusBanner] = useState<string>('');

  // Hybrid connection state
  const [pcOnline, setPcOnline] = useState(false);
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [checkingPc, setCheckingPc] = useState(false);

  // Tab 1: Brain IA
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const loaded = safeLoadJson<ChatMessage[]>(STORAGE_KEYS.messages, []);
    return loaded.length > 0 ? loaded : [INITIAL_WELCOME];
  });
  const [visibleMessages, setVisibleMessages] = useState(PAGE_SIZE);
  const [promptInput, setPromptInput] = useState('');
  const [attachedFile, setAttachedFile] = useState<{ name: string; text: string } | null>(null);
  const [sendingAi, setSendingAi] = useState(false);
  const sendingRef = useRef(false);

  // Tab 2: Cobalt / Descargas
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaMode, setMediaMode] = useState<'video' | 'audio'>('video');
  const [mediaQuality, setMediaQuality] = useState<'1080' | '720' | 'best'>('1080');
  const [mediaDest, setMediaDest] = useState<'pc' | 'device'>('pc');
  const [jobs, setJobs] = useState<DownloadJob[]>(() => safeLoadJson<DownloadJob[]>(STORAGE_KEYS.jobs, []));
  const [visibleJobs, setVisibleJobs] = useState(PAGE_SIZE);
  const [submittingJob, setSubmittingJob] = useState(false);

  // Tab 3: Control PC
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [takingShot, setTakingShot] = useState(false);
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [shutdownMinutes, setShutdownMinutes] = useState(30);
  const [quickScript, setQuickScript] = useState('Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, @{N="LibreGB";E={[math]::Round($_.FreeSpace/1GB,1)}}');

  // Tab 4: File Bridge
  const [fileDir, setFileDir] = useState<'drop' | 'downloads'>('drop');
  const [fileQuery, setFileQuery] = useState('');
  const [remoteFiles, setRemoteFiles] = useState<RemoteFile[]>([]);
  const [largestFiles, setLargestFiles] = useState<RemoteFile[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  const agentBaseUrl = useMemo(() => normalizeAgentUrl(settings.agentUrl), [settings.agentUrl]);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {};
    if (settings.agentToken.trim()) {
      h.Authorization = `Bearer ${settings.agentToken.trim()}`;
    }
    return h;
  }, [settings.agentToken]);

  const showNotice = useCallback((msg: string) => {
    setStatusBanner(msg);
  }, []);

  // Persist locally
  useEffect(() => {
    safeSaveJson(STORAGE_KEYS.settings, settings);
  }, [settings]);

  useEffect(() => {
    safeSaveJson(STORAGE_KEYS.messages, messages.slice(-3500));
  }, [messages]);

  useEffect(() => {
    safeSaveJson(STORAGE_KEYS.jobs, jobs.slice(-2000));
  }, [jobs]);

  const checkAgentHealth = useCallback(async () => {
    if (!agentBaseUrl) {
      setPcOnline(false);
      setHealth(null);
      return;
    }
    setCheckingPc(true);
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 3500);
      const res = await fetch(`${agentBaseUrl}/api/health`, {
        headers: authHeaders(),
        signal: ctrl.signal,
      });
      window.clearTimeout(timer);
      if (!res.ok) {
        setPcOnline(false);
        setHealth(null);
        return;
      }
      const data = (await res.json()) as AgentHealth;
      setHealth(data);
      setPcOnline(Boolean(data.ok));
    } catch {
      setPcOnline(false);
      setHealth(null);
    } finally {
      setCheckingPc(false);
    }
  }, [agentBaseUrl, authHeaders]);

  useEffect(() => {
    void checkAgentHealth();
  }, [checkAgentHealth]);

  // Cleanup screenshot blob URL
  useEffect(() => {
    return () => {
      if (screenshotUrl) URL.revokeObjectURL(screenshotUrl);
    };
  }, [screenshotUrl]);

  // --- Power 1: Brain IA ---
  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setAttachedFile({ name: sanitizeFilename(file.name), text: text.slice(0, 20000) });
      showNotice(`Adjunto listo: ${file.name}`);
    } catch {
      showNotice('No se pudo leer el archivo adjunto.');
    }
    e.target.value = '';
  };

  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = promptInput.trim();
    if ((!trimmed && !attachedFile) || sendingRef.current) return;

    sendingRef.current = true;
    setSendingAi(true);
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      content: trimmed || `Resumí el archivo adjunto: ${attachedFile?.name}`,
      attachmentName: attachedFile?.name,
      createdAt: new Date().toISOString(),
    };

    const currentAttachment = attachedFile;
    setMessages((prev) => mergeById(prev, [userMsg], 3500));
    setPromptInput('');
    setAttachedFile(null);

    try {
      const reply = await askJarvisBrain(userMsg.content, settings, currentAttachment?.text);
      const aiMsg: ChatMessage = {
        id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: 'assistant',
        content: reply.content,
        proposedScript: reply.proposedScript,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => mergeById(prev, [aiMsg], 3500));
    } catch (err) {
      const errMsg: ChatMessage = {
        id: `e-${Date.now()}`,
        role: 'system',
        content: `No se pudo contactar al proveedor IA (${err instanceof Error ? err.message : 'error de red'}). Podés seguir usando Modo Offline en Ajustes.`,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => mergeById(prev, [errMsg], 3500));
    } finally {
      sendingRef.current = false;
      setSendingAi(false);
    }
  };

  const requestScriptExecution = (command: string) => {
    const clean = command.trim();
    if (!clean) return;
    const risk = classifyScriptRisk(clean);
    setApproval({
      title: 'Ejecutar script en tu PC Windows',
      description: pcOnline
        ? 'Revisá el comando PowerShell antes de darle TU SÍ. Se ejecutará en tu PC con timeout de 20s.'
        : 'Tu PC figura offline en este momento. Si aprobás, intentará enviarlo al Windows Agent configurado.',
      commandPreview: clean,
      risk: risk.level,
      reasons: risk.reasons,
      onApprove: async () => {
        if (!agentBaseUrl) {
          showNotice('Configurá la URL de tu Windows Agent en Ajustes.');
          return;
        }
        try {
          const res = await fetch(`${agentBaseUrl}/api/script/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ command: clean, approved: true }),
          });
          const data = await res.json();
          const outputText = data.stdout || data.stderr || data.error || 'Sin salida.';
          const resultMsg: ChatMessage = {
            id: `s-${Date.now()}`,
            role: 'system',
            content: `Resultado en PC (exit ${data.exitCode ?? (data.ok ? 0 : 1)}):\n${outputText}`,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => mergeById(prev, [resultMsg], 3500));
          showNotice(data.ok ? 'Script ejecutado en tu PC.' : 'El script devolvió un error.');
        } catch {
          showNotice('No se pudo conectar con el Windows Agent para ejecutar el script.');
        }
      },
    });
  };

  // --- Power 2: Cobalt / Descargas ---
  const urlCheck = useMemo(() => detectMediaPlatform(mediaUrl), [mediaUrl]);

  const handleStartDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlCheck.valid || submittingJob) return;
    setSubmittingJob(true);

    const newJob: DownloadJob = {
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      url: urlCheck.normalizedUrl,
      platform: urlCheck.platform,
      mode: mediaMode,
      quality: mediaQuality,
      destination: mediaDest,
      engine: mediaDest === 'device' ? 'cobalt' : 'yt-dlp',
      status: 'running',
      progress: mediaDest === 'device' ? 'Consultando Cobalt 24/7...' : 'Enviando al Windows Agent...',
      createdAt: new Date().toISOString(),
    };
    setJobs((prev) => mergeById(prev, [newJob], 2000));
    setMediaUrl('');

    try {
      if (mediaDest === 'device') {
        if (!settings.cobaltUrl) {
          setJobs((prev) =>
            prev.map((j) =>
              j.id === newJob.id
                ? {
                    ...j,
                    status: 'failed',
                    progress: 'Configurá tu URL de Cobalt API en Ajustes (o cambiá destino a Guardar en PC).',
                  }
                : j,
            ),
          );
          return;
        }
        const res = await fetch(settings.cobaltUrl, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: newJob.url,
            downloadMode: newJob.mode === 'audio' ? 'audio' : 'auto',
            videoQuality: newJob.quality,
          }),
        });
        const data = await res.json();
        if (data?.url) {
          setJobs((prev) =>
            prev.map((j) =>
              j.id === newJob.id
                ? { ...j, status: 'completed', progress: 'Listo para descargar al celu', outputFile: data.url }
                : j,
            ),
          );
        } else {
          setJobs((prev) =>
            prev.map((j) =>
              j.id === newJob.id
                ? { ...j, status: 'failed', progress: data?.error?.code || 'Cobalt no devolvió link.' }
                : j,
            ),
          );
        }
      } else {
        if (!pcOnline || !agentBaseUrl) {
          setJobs((prev) =>
            prev.map((j) =>
              j.id === newJob.id
                ? {
                    ...j,
                    status: 'queued',
                    progress: 'PC apagada: guardado en cola local hasta que enciendas el Windows Agent.',
                  }
                : j,
            ),
          );
          return;
        }
        const res = await fetch(`${agentBaseUrl}/api/download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            url: newJob.url,
            mode: newJob.mode,
            quality: newJob.quality,
            engine: newJob.engine,
            cobaltUrl: settings.cobaltUrl || undefined,
          }),
        });
        const data = await res.json();
        setJobs((prev) =>
          prev.map((j) =>
            j.id === newJob.id
              ? {
                  ...j,
                  status: data.ok ? 'running' : 'failed',
                  progress: data.ok ? 'Descargando en JarvisDownloads...' : data.error || 'Error del agente',
                }
              : j,
          ),
        );
      }
    } catch {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === newJob.id ? { ...j, status: 'failed', progress: 'Error de red al iniciar descarga.' } : j,
        ),
      );
    } finally {
      setSubmittingJob(false);
    }
  };

  // --- Power 3: Control PC ---
  const handleTakeScreenshot = async () => {
    if (!pcOnline || !agentBaseUrl || takingShot) return;
    setTakingShot(true);
    try {
      const res = await fetch(`${agentBaseUrl}/api/screenshot`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Error al capturar pantalla');
      const blob = await res.blob();
      const nextUrl = URL.createObjectURL(blob);
      setScreenshotUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return nextUrl;
      });
      showNotice('Captura actualizada.');
    } catch {
      showNotice('No se pudo sacar la captura de pantalla.');
    } finally {
      setTakingShot(false);
    }
  };

  const handleLoadProcesses = async () => {
    if (!pcOnline || !agentBaseUrl) return;
    try {
      const res = await fetch(`${agentBaseUrl}/api/processes`, { headers: authHeaders() });
      const data = await res.json();
      if (data.ok && Array.isArray(data.processes)) {
        setProcesses(data.processes);
      }
    } catch {
      showNotice('No se pudo leer la lista de procesos.');
    }
  };

  const handleKillProcess = (proc: ProcessItem) => {
    setApproval({
      title: `Cerrar ${proc.name} (PID ${proc.pid})`,
      description: 'Se cerrará el proceso de forma forzada en tu Windows.',
      commandPreview: `taskkill /PID ${proc.pid} /F`,
      risk: 'medium',
      reasons: ['Cierre forzado de procesos (podés perder trabajo sin guardar)'],
      onApprove: async () => {
        if (!agentBaseUrl) return;
        const res = await fetch(`${agentBaseUrl}/api/processes/kill`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ pid: proc.pid, approved: true }),
        });
        const data = await res.json();
        showNotice(data.ok ? `Proceso ${proc.name} cerrado.` : data.output || 'No se pudo cerrar.');
        void handleLoadProcesses();
      },
    });
  };

  const handlePowerAction = (action: 'shutdown' | 'restart' | 'abort') => {
    const mins = clampShutdownMinutes(shutdownMinutes);
    const cmd =
      action === 'abort'
        ? 'shutdown /a'
        : `shutdown ${action === 'restart' ? '/r' : '/s'} /t ${mins * 60}`;
    setApproval({
      title:
        action === 'abort'
          ? 'Cancelar apagado programado'
          : action === 'restart'
            ? `Reiniciar PC en ${mins} minutos`
            : `Apagar PC en ${mins} minutos`,
      description: 'Acción de energía sobre tu Windows. Requiere TU SÍ.',
      commandPreview: cmd,
      risk: action === 'abort' ? 'low' : 'high',
      reasons: action === 'abort' ? ['Cancela cualquier apagado pendiente'] : ['Apagado o reinicio del sistema'],
      onApprove: async () => {
        if (!agentBaseUrl) return;
        const res = await fetch(`${agentBaseUrl}/api/power`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ action, minutes: mins, approved: true }),
        });
        const data = await res.json();
        showNotice(data.message || (data.ok ? 'Comando enviado.' : 'Error de energía.'));
      },
    });
  };

  const handleLaunchApp = async (appKey: string) => {
    if (!pcOnline || !agentBaseUrl) return;
    try {
      const res = await fetch(`${agentBaseUrl}/api/apps/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ app: appKey }),
      });
      const data = await res.json();
      showNotice(data.ok ? `Abriendo ${appKey} en tu PC.` : data.error || 'No se pudo abrir.');
    } catch {
      showNotice('Error de red al abrir programa.');
    }
  };

  // --- Power 4: File Bridge ---
  const handleLoadFiles = useCallback(async () => {
    if (!pcOnline || !agentBaseUrl) return;
    try {
      const params = new URLSearchParams({ dir: fileDir, q: fileQuery });
      const res = await fetch(`${agentBaseUrl}/api/files?${params.toString()}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.ok && Array.isArray(data.files)) {
        setRemoteFiles(data.files);
      }
    } catch {
      showNotice('No se pudo listar la carpeta de la PC.');
    }
  }, [pcOnline, agentBaseUrl, fileDir, fileQuery, authHeaders, showNotice]);

  useEffect(() => {
    if (activeTab === 'files' && pcOnline) {
      void handleLoadFiles();
    }
  }, [activeTab, pcOnline, handleLoadFiles]);

  const handleUploadToPc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pcOnline || !agentBaseUrl) return;
    setUploadingFile(true);
    try {
      const safeName = sanitizeFilename(file.name);
      const params = new URLSearchParams({ dir: fileDir, name: safeName });
      const res = await fetch(`${agentBaseUrl}/api/files/upload?${params.toString()}`, {
        method: 'POST',
        headers: authHeaders(),
        body: file,
      });
      const data = await res.json();
      showNotice(data.ok ? `Subido a tu PC: ${safeName}` : data.error || 'Falló la subida.');
      void handleLoadFiles();
    } catch {
      showNotice('Error al subir archivo a tu PC.');
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleDownloadFromPc = async (filename: string) => {
    if (!pcOnline || !agentBaseUrl) return;
    try {
      const params = new URLSearchParams({ dir: fileDir, name: filename });
      const res = await fetch(`${agentBaseUrl}/api/files/download?${params.toString()}`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Error');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showNotice('No se pudo descargar el archivo desde tu PC.');
    }
  };

  const handleScanLargest = async () => {
    if (!pcOnline || !agentBaseUrl) return;
    try {
      const res = await fetch(`${agentBaseUrl}/api/files/largest?scope=user_downloads`, { headers: authHeaders() });
      const data = await res.json();
      if (data.ok && Array.isArray(data.files)) {
        setLargestFiles(data.files);
        showNotice(`Escaneado: ${data.files.length} archivos más pesados en Descargas.`);
      }
    } catch {
      showNotice('No se pudo escanear archivos pesados.');
    }
  };

  // Windowed slices for stress-test DOM safety
  const displayedMessages = useMemo(
    () => messages.slice(-visibleMessages),
    [messages, visibleMessages],
  );
  const displayedJobs = useMemo(
    () => [...jobs].reverse().slice(0, visibleJobs),
    [jobs, visibleJobs],
  );

  const navItems: Array<{ id: ActiveTab; label: string; Icon: typeof Brain }> = [
    { id: 'brain', label: 'Cerebro', Icon: Brain },
    { id: 'cobalt', label: 'Cobalt', Icon: Download },
    { id: 'pc', label: 'PC', Icon: Monitor },
    { id: 'files', label: 'Archivos', Icon: FolderSync },
  ];

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-[#090d16]/95 backdrop-blur">
        <div className="mx-auto max-w-4xl px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-sky-500/15 border border-sky-400/40 flex items-center justify-center shrink-0">
              <Brain className="h-5 w-5 text-sky-300" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-tight text-white truncate">Jarvis Pocket</h1>
              <p className="text-xs text-slate-400 truncate">Centro de Comando Híbrido</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void checkAgentHealth()}
              title="Actualizar estado de conexión con tu PC"
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                pcOnline
                  ? 'border-emerald-600 bg-emerald-950/90 text-emerald-200'
                  : 'border-sky-700 bg-sky-950/80 text-sky-200'
              }`}
            >
              {pcOnline ? (
                <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{checkingPc ? 'Chequeando...' : pcOnline ? 'PC ONLINE' : 'NUBE 24/7'}</span>
              <span className="sr-only"> — actualizar estado</span>
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Abrir ajustes de conexión e IA"
              className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-200 hover:bg-slate-800"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Optional live status notice */}
      {statusBanner && (
        <div
          role="status"
          className="mx-auto w-full max-w-4xl px-3 sm:px-4 pt-3"
        >
          <div className="flex items-center justify-between gap-2 rounded-lg border border-sky-800 bg-sky-950/60 px-3 py-2 text-xs text-sky-100">
            <span className="truncate">{statusBanner}</span>
            <button
              type="button"
              onClick={() => setStatusBanner('')}
              aria-label="Descartar aviso"
              className="text-sky-200 hover:text-white font-semibold shrink-0"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-3 sm:px-4 py-4 pb-24">
        {/* TAB 1: CEREBRO IA */}
        {activeTab === 'brain' && (
          <section aria-labelledby="tab-brain-heading" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="tab-brain-heading" className="text-lg font-bold text-white">
                  Cerebro IA + Scripts (TU SÍ)
                </h2>
                <p className="text-xs text-slate-400">
                  Funciona 24/7 en Nube o local. Adjuntá texto/PDF o pedí comandos para aprobar antes de correr.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMessages([INITIAL_WELCOME])}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Limpiar chat
              </button>
            </div>

            {messages.length > visibleMessages && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setVisibleMessages((v) => v + PAGE_SIZE)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-slate-800"
                >
                  Cargar mensajes anteriores ({messages.length - visibleMessages} ocultos)
                </button>
              </div>
            )}

            <div className="space-y-3">
              {displayedMessages.map((msg) => (
                <article
                  key={msg.id}
                  className={`rounded-2xl border p-3.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'ml-auto max-w-[90%] border-sky-700/70 bg-sky-950/50 text-slate-100'
                      : msg.role === 'system'
                        ? 'border-amber-800/70 bg-amber-950/30 text-amber-100'
                        : 'border-slate-800 bg-slate-900/90 text-slate-100'
                  }`}
                >
                  {msg.attachmentName && (
                    <p className="mb-1.5 inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-xs text-sky-200">
                      <Paperclip className="h-3 w-3" aria-hidden="true" />
                      {msg.attachmentName}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  {msg.proposedScript && (
                    <div className="mt-3 space-y-2 rounded-xl border border-slate-700 bg-slate-950 p-3">
                      <pre className="text-xs text-sky-200 overflow-x-auto whitespace-pre-wrap break-words">
                        <code>{msg.proposedScript}</code>
                      </pre>
                      <button
                        type="button"
                        onClick={() => requestScriptExecution(msg.proposedScript!)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-sky-400"
                      >
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                        Revisar y aprobar (TU SÍ)
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>

            <form onSubmit={handleSendPrompt} className="space-y-2 pt-2">
              {attachedFile && (
                <div className="flex items-center justify-between rounded-lg border border-sky-800 bg-sky-950/40 px-3 py-1.5 text-xs text-sky-200">
                  <span className="truncate">Adjunto: {attachedFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachedFile(null)}
                    className="font-semibold text-sky-100 hover:underline"
                  >
                    Quitar
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <label
                  htmlFor="brain-file-attach"
                  className="cursor-pointer rounded-xl border border-slate-700 bg-slate-900 p-3 text-slate-200 hover:bg-slate-800 shrink-0"
                  title="Adjuntar texto o PDF"
                >
                  <Paperclip className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Adjuntar archivo para resumir</span>
                  <input
                    id="brain-file-attach"
                    type="file"
                    accept=".txt,.md,.json,.csv,.log,.pdf"
                    onChange={handleAttachFile}
                    className="sr-only"
                  />
                </label>

                <label htmlFor="brain-prompt-input" className="sr-only">
                  Mensaje para Jarvis
                </label>
                <input
                  id="brain-prompt-input"
                  type="text"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="Pedile algo a Jarvis (ej. revisar espacio en disco)..."
                  className="flex-1 min-w-0 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
                />

                <button
                  type="submit"
                  disabled={sendingAi}
                  aria-label="Enviar mensaje a Jarvis"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-sky-400 disabled:opacity-60 shrink-0"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{sendingAi ? 'Pensando...' : 'Enviar'}</span>
                </button>
              </div>
            </form>
          </section>
        )}

        {/* TAB 2: COBALT / DESCARGAS */}
        {activeTab === 'cobalt' && (
          <section aria-labelledby="tab-cobalt-heading" className="space-y-4">
            <div>
              <h2 id="tab-cobalt-heading" className="text-lg font-bold text-white">
                Descargador estilo Cobalt (YT, IG, TikTok, X)
              </h2>
              <p className="text-xs text-slate-400">
                Elegí si guardarlo directo en tu PC (`yt-dlp` / Cobalt) o bajarlo al celu 24/7 vía Cobalt API.
              </p>
            </div>

            <form
              onSubmit={handleStartDownload}
              className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3"
            >
              <div>
                <label htmlFor="cobalt-url-input" className="block text-xs font-semibold text-slate-300 mb-1">
                  Link del video o audio
                </label>
                <input
                  id="cobalt-url-input"
                  type="url"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... o Instagram / TikTok / X"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500"
                />
                {mediaUrl.trim().length > 0 && (
                  <p className={`mt-1 text-xs ${urlCheck.valid ? 'text-emerald-300' : 'text-red-300'}`}>
                    {urlCheck.valid
                      ? `Plataforma detectada: ${urlCheck.platform.toUpperCase()}`
                      : 'Pegá una URL válida (http:// o https://)'}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label htmlFor="media-mode" className="block text-xs font-semibold text-slate-300 mb-1">
                    Formato
                  </label>
                  <select
                    id="media-mode"
                    value={mediaMode}
                    onChange={(e) => setMediaMode(e.target.value as 'video' | 'audio')}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  >
                    <option value="video">Video (MP4)</option>
                    <option value="audio">Solo Audio (MP3)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="media-quality" className="block text-xs font-semibold text-slate-300 mb-1">
                    Calidad
                  </label>
                  <select
                    id="media-quality"
                    value={mediaQuality}
                    onChange={(e) => setMediaQuality(e.target.value as '1080' | '720' | 'best')}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  >
                    <option value="1080">1080p Full HD</option>
                    <option value="720">720p Liviano</option>
                    <option value="best">Máxima disponible</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="media-dest" className="block text-xs font-semibold text-slate-300 mb-1">
                    Destino
                  </label>
                  <select
                    id="media-dest"
                    value={mediaDest}
                    onChange={(e) => setMediaDest(e.target.value as 'pc' | 'device')}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  >
                    <option value="pc">Guardar en PC (JarvisDownloads)</option>
                    <option value="device">Bajar al Celu (Cobalt 24/7)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={!urlCheck.valid || submittingJob}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {submittingJob ? 'Procesando...' : 'Descargar ahora'}
              </button>
            </form>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-200">Historial de descargas ({jobs.length})</h3>
                {jobs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setJobs([])}
                    className="text-xs font-semibold text-slate-400 hover:text-slate-200"
                  >
                    Limpiar historial
                  </button>
                )}
              </div>

              {displayedJobs.length === 0 ? (
                <p className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-400">
                  Todavía no bajaste nada. Pegá un link arriba para probar.
                </p>
              ) : (
                <div className="space-y-2">
                  {displayedJobs.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold uppercase text-sky-300">
                          {job.platform} · {job.mode} · {job.destination === 'pc' ? 'PC' : 'CELU'}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 font-semibold ${
                            job.status === 'completed'
                              ? 'bg-emerald-950 text-emerald-200'
                              : job.status === 'failed'
                                ? 'bg-red-950 text-red-200'
                                : 'bg-amber-950 text-amber-200'
                          }`}
                        >
                          {job.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 truncate">{job.url}</p>
                      <p className="text-xs text-slate-400">{job.progress}</p>
                    </div>
                  ))}
                  {jobs.length > visibleJobs && (
                    <button
                      type="button"
                      onClick={() => setVisibleJobs((v) => v + PAGE_SIZE)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 text-xs font-semibold text-sky-300 hover:bg-slate-800"
                    >
                      Ver más descargas ({jobs.length - visibleJobs} restantes)
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 3: CONTROL PC */}
        {activeTab === 'pc' && (
          <section aria-labelledby="tab-pc-heading" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="tab-pc-heading" className="text-lg font-bold text-white">
                  Control Remoto Windows
                </h2>
                <p className="text-xs text-slate-400">
                  Captura de pantalla, discos, procesos, lanzador de apps y apagado con TU SÍ.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void checkAgentHealth()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Reconectar
              </button>
            </div>

            {!pcOnline && (
              <div className="rounded-xl border border-sky-800/70 bg-sky-950/30 p-4 text-sm text-sky-100 space-y-1">
                <p className="font-semibold">Tu PC está en Modo Nube 24/7 (Agente offline)</p>
                <p className="text-xs text-sky-200/80">
                  Corré <code className="rounded bg-slate-900 px-1.5 py-0.5">npm run agent</code> en tu Windows y pegá el
                  token en Ajustes (o conectate por Tailscale) para activar estos controles.
                </p>
              </div>
            )}

            {/* Telemetry & Disks */}
            {health && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                  <span className="font-bold text-white">{health.hostname}</span>
                  <span>
                    RAM libre: {formatBytes(health.ramFreeBytes)} / {formatBytes(health.ramTotalBytes)}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {health.disks.map((d) => {
                    const pct = calcDiskUsagePercent(d.usedBytes, d.totalBytes);
                    return (
                      <div key={d.drive} className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-100 inline-flex items-center gap-1.5">
                            <HardDrive className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                            {d.drive} ({d.label})
                          </span>
                          <span className="text-slate-300">{pct}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full bg-sky-400" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-slate-400">
                          {formatBytes(d.usedBytes)} usados de {formatBytes(d.totalBytes)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Screenshot & Power Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
                <h3 className="text-sm font-bold text-white inline-flex items-center gap-2">
                  <Camera className="h-4 w-4 text-sky-400" aria-hidden="true" />
                  Captura de pantalla
                </h3>
                <button
                  type="button"
                  disabled={!pcOnline || takingShot}
                  onClick={handleTakeScreenshot}
                  className="w-full rounded-xl bg-sky-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
                >
                  {takingShot ? 'Capturando...' : 'Sacar captura ahora'}
                </button>
                {screenshotUrl && (
                  <img
                    src={screenshotUrl}
                    alt="Captura actual de tu escritorio Windows"
                    className="w-full rounded-lg border border-slate-700"
                  />
                )}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
                <h3 className="text-sm font-bold text-white inline-flex items-center gap-2">
                  <Power className="h-4 w-4 text-amber-400" aria-hidden="true" />
                  Apagado programado
                </h3>
                <div className="flex items-center gap-2">
                  <label htmlFor="shutdown-mins" className="text-xs text-slate-300 shrink-0">
                    Minutos:
                  </label>
                  <input
                    id="shutdown-mins"
                    type="number"
                    min={1}
                    max={480}
                    value={shutdownMinutes}
                    onChange={(e) => setShutdownMinutes(clampShutdownMinutes(Number(e.target.value)))}
                    className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-white"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handlePowerAction('shutdown')}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500"
                  >
                    Programar apagado
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePowerAction('abort')}
                    className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
                  >
                    Cancelar apagado
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Apps & PowerShell with TU SI */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
              <h3 className="text-sm font-bold text-white inline-flex items-center gap-2">
                <Terminal className="h-4 w-4 text-sky-400" aria-hidden="true" />
                Lanzador rápido y PowerShell (con TU SÍ)
              </h3>
              <div className="flex flex-wrap gap-2">
                {['notepad', 'calc', 'explorer', 'spotify', 'chrome', 'code'].map((app) => (
                  <button
                    key={app}
                    type="button"
                    disabled={!pcOnline}
                    onClick={() => void handleLaunchApp(app)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Play className="h-3 w-3 text-sky-400" aria-hidden="true" />
                    {app}
                  </button>
                ))}
              </div>

              <div className="space-y-2 pt-2">
                <label htmlFor="quick-ps-input" className="block text-xs font-semibold text-slate-300">
                  Comando PowerShell manual
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id="quick-ps-input"
                    type="text"
                    value={quickScript}
                    onChange={(e) => setQuickScript(e.target.value)}
                    className="flex-1 min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-sky-200 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => requestScriptExecution(quickScript)}
                    className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-sky-400 shrink-0"
                  >
                    Aprobar y ejecutar
                  </button>
                </div>
              </div>
            </div>

            {/* Processes */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Procesos activos</h3>
                <button
                  type="button"
                  disabled={!pcOnline}
                  onClick={() => void handleLoadProcesses()}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                >
                  Cargar procesos
                </button>
              </div>
              {processes.length > 0 && (
                <div className="space-y-1.5">
                  {processes.slice(0, 15).map((p) => (
                    <div
                      key={p.pid}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-100 truncate">
                          {p.name} <span className="text-slate-400">#{p.pid}</span>
                        </p>
                        <p className="text-slate-400 truncate">{formatBytes(p.memoryBytes)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleKillProcess(p)}
                        className="rounded bg-red-950 border border-red-800 px-2.5 py-1 font-semibold text-red-200 hover:bg-red-900 shrink-0"
                      >
                        Cerrar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 4: PUENTE DE ARCHIVOS */}
        {activeTab === 'files' && (
          <section aria-labelledby="tab-files-heading" className="space-y-4">
            <div>
              <h2 id="tab-files-heading" className="text-lg font-bold text-white">
                Puente de Archivos (PC ↔ Celu)
              </h2>
              <p className="text-xs text-slate-400">
                Subí archivos del celu directo a tu PC sin compresión, bajá desde tus carpetas o buscá archivos gigantes.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFileDir('drop')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                    fileDir === 'drop'
                      ? 'bg-sky-500 text-slate-950'
                      : 'border border-slate-700 bg-slate-950 text-slate-200'
                  }`}
                >
                  JarvisDrop
                </button>
                <button
                  type="button"
                  onClick={() => setFileDir('downloads')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                    fileDir === 'downloads'
                      ? 'bg-sky-500 text-slate-950'
                      : 'border border-slate-700 bg-slate-950 text-slate-200'
                  }`}
                >
                  JarvisDownloads
                </button>

                <label
                  htmlFor="pc-upload-input"
                  className={`ml-auto inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 cursor-pointer hover:bg-emerald-400 ${
                    !pcOnline ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  {uploadingFile ? 'Subiendo...' : 'Subir a PC'}
                  <input
                    id="pc-upload-input"
                    type="file"
                    disabled={!pcOnline}
                    onChange={handleUploadToPc}
                    className="sr-only"
                  />
                </label>
              </div>

              <div className="flex gap-2">
                <label htmlFor="file-search-input" className="sr-only">
                  Buscar archivos en tu PC
                </label>
                <input
                  id="file-search-input"
                  type="search"
                  value={fileQuery}
                  onChange={(e) => setFileQuery(e.target.value)}
                  placeholder="Filtrar por nombre..."
                  className="flex-1 min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-500"
                />
                <button
                  type="button"
                  disabled={!pcOnline}
                  onClick={() => void handleLoadFiles()}
                  aria-label="Buscar archivos"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {!pcOnline ? (
                <p className="text-xs text-slate-400">
                  Prendé tu Windows Agent para explorar y transferir archivos entre tu PC y tu celu.
                </p>
              ) : remoteFiles.length === 0 ? (
                <p className="text-xs text-slate-400">No hay archivos en esta carpeta todavía.</p>
              ) : (
                <div className="space-y-1.5">
                  {remoteFiles.slice(0, PAGE_SIZE).map((f) => (
                    <div
                      key={f.name}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-100 truncate">{f.name}</p>
                        <p className="text-slate-400">{formatBytes(f.sizeBytes)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDownloadFromPc(f.name)}
                        className="rounded bg-sky-500 px-2.5 py-1 font-bold text-slate-950 hover:bg-sky-400 shrink-0"
                      >
                        Bajar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Giant Files Radar */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white">Radar de archivos gigantes</h3>
                  <p className="text-xs text-slate-400">Encontrá qué ocupa más espacio en tu carpeta Descargas.</p>
                </div>
                <button
                  type="button"
                  disabled={!pcOnline}
                  onClick={() => void handleScanLargest()}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-slate-800 disabled:opacity-50 shrink-0"
                >
                  Escanear
                </button>
              </div>

              {largestFiles.length > 0 && (
                <div className="space-y-1.5">
                  {largestFiles.map((f) => (
                    <div
                      key={f.path || f.name}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs"
                    >
                      <span className="truncate text-slate-200">{f.name}</span>
                      <span className="font-bold text-amber-300 shrink-0">{formatBytes(f.sizeBytes)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Bottom Mobile-First Navigation */}
      <nav
        aria-label="Secciones principales de Jarvis Pocket"
        className="fixed bottom-0 inset-x-0 z-20 border-t border-slate-800 bg-[#090d16]/95 backdrop-blur"
      >
        <div className="mx-auto max-w-4xl grid grid-cols-4">
          {navItems.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setActiveTab(id)}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-semibold transition ${
                  active ? 'text-sky-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Native <dialog> Modals */}
      <ApprovalDialog approval={approval} onClose={() => setApproval(null)} />
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onSave={(next) => {
          setSettings(next);
          showNotice('Ajustes guardados.');
        }}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
