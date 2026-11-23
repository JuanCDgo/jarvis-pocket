export type ActiveTab = 'brain' | 'cobalt' | 'pc' | 'files';

export type AiProvider = 'offline' | 'gemini' | 'openai-compat';

export type MediaPlatform =
  | 'youtube'
  | 'instagram'
  | 'tiktok'
  | 'x'
  | 'reddit'
  | 'soundcloud'
  | 'other'
  | 'invalid';

export type ScriptRiskLevel = 'low' | 'medium' | 'high';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  attachmentName?: string;
  proposedScript?: string;
}

export interface DownloadJob {
  id: string;
  url: string;
  platform: MediaPlatform;
  mode: 'video' | 'audio';
  quality: '1080' | '720' | 'best';
  destination: 'pc' | 'device';
  engine: 'yt-dlp' | 'cobalt';
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: string;
  outputFile?: string | null;
  createdAt: string;
}

export interface DiskDrive {
  drive: string;
  label: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
}

export interface AgentHealth {
  ok: boolean;
  hostname: string;
  platform: string;
  uptimeSec: number;
  cpuModel: string;
  cpuCores: number;
  ramTotalBytes: number;
  ramFreeBytes: number;
  disks: DiskDrive[];
  tools: {
    ytDlp: boolean;
    ffmpeg: boolean;
    cobaltConfigured: boolean;
  };
  folders: {
    drop: string;
    downloads: string;
  };
}

export interface ProcessItem {
  pid: number;
  name: string;
  title: string;
  memoryBytes: number;
}

export interface RemoteFile {
  name: string;
  sizeBytes: number;
  modifiedAt?: string;
  path?: string;
}

export interface JarvisSettings {
  agentUrl: string;
  agentToken: string;
  aiProvider: AiProvider;
  aiApiKey: string;
  aiModel: string;
  localLlmUrl: string;
  cobaltUrl: string;
}

export interface PendingApproval {
  title: string;
  description: string;
  commandPreview: string;
  risk: ScriptRiskLevel;
  reasons: string[];
  onApprove: () => Promise<void> | void;
}
