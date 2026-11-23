# GEMINI.md — Jarvis Pocket (Modo Híbrido)

## 1. Visión del Proyecto
**Jarvis Pocket** es un centro de comando personal **híbrido (24/7 Nube + Agente Local Windows)** diseñado como una PWA oscura mobile-first que controla tu PC desde el celular (vía Wi-Fi local o **Tailscale** en 4G/5G) y mantiene disponibles los poderes de nube incluso cuando la PC está apagada.

## 2. Hardware Objetivo del Usuario
- **CPU:** Intel Core i5-11400F (6C/12T)
- **RAM:** 16 GB (14.3 GB utilizable)
- **GPU:** AMD Radeon RX 590 (8 GB VRAM, Polaris — usar **Vulkan** para LLMs locales en LM Studio / Ollama, nunca CUDA)
- **Almacenamiento:** ~4.29 TB (~3.21 TB usados)
- **SO:** Windows (PowerShell + Node.js v24)

## 3. Arquitectura Híbrida
1. **PWA Frontend (`src/`)**: React 19 + TypeScript + Vite + Tailwind CSS v4.
   - Funciona 24/7 aunque la PC esté apagada (Chat IA vía API, resumen de texto/PDF, descarga estilo Cobalt al celu).
   - Detecta automáticamente el estado del **Windows Agent** (`/api/health`) y habilita los controles de PC cuando está online.
2. **Windows Agent (`agent/server.mjs`)**: Servidor HTTP nativo de Node.js v24 sin dependencias externas pesadas.
   - Corre en el puerto `8787` (`0.0.0.0`) para aceptar conexiones de red local y **Tailscale**.
   - Expone los 4 poderes: **Cerebro IA + Scripts ("TU SÍ")**, **Descargas estilo Cobalt (`yt-dlp` / Cobalt API)**, **Control PC (Captura, Procesos, Apagado)** y **Puente de Archivos (PC ↔ Celu + Radar de archivos gigantes)**.

## 4. Reglas de Seguridad y Guardrails ("TU SÍ")
- **Autenticación obligatoria:** Todo endpoint `/api/*` del Windows Agent requiere `Authorization: Bearer <JARVIS_TOKEN>` (excepto `/api/ping` mínimo). El token nunca se hardcodea en código fuente; se lee de `.env`.
- **Aprobación humana ("TU SÍ"):** Toda acción destructiva o sensible (ejecutar script PowerShell, cerrar proceso, programar apagado/reinicio) exige confirmación explícita mediante `<dialog>` nativo (`autofocus` en **Cancelar**).
- **Sandbox de archivos:** El Puente de Archivos restringe lectura/escritura estrictamente a carpetas permitidas (`JARVIS_DROP_DIR` y rutas configuradas), bloqueando *path traversal* (`..`, rutas absolutas fuera de raíz).
- **Sin secretos en `src/`:** Las claves de API del usuario se guardan solo en su `localStorage` local o `.env` del agente (ignorado por Git).

## 5. Estándares de Ingeniería y QA
- **Simplicidad primero (Karpathy Guidelines):** Código mínimo, limpio, sin abstracciones innecesarias.
- **Lógica pura en `src/lib/`:** Validadores, clasificadores de riesgo, sanitizadores de rutas y storage van separados de React para ser testeados con fuzzing (`fast-check`).
- **UI Moderna y Accesible:** `<meta name="color-scheme" content="dark">`, `<dialog>` nativo con `overscroll-behavior: contain`, WCAG 2.1 AA sin violaciones críticas/serias, responsive mobile `390x844` con desborde horizontal `<= 16px`, y paginación/windowing para listas grandes (`< 15.000` nodos DOM).
- **Protocolo de Tortura QA (7 Capas):** Antes de considerar cualquier versión lista, ejecutar `npm run qa:torture` y verificar `qa-torture/TORTURE_REPORT.md` en verde.

## 6. Comandos Principales
- `npm run dev` — Levanta la PWA en desarrollo (`http://localhost:5173`).
- `npm run agent` — Levanta el Windows Agent local (`http://localhost:8787`).
- `npm run start:all` — Levanta PWA + Windows Agent juntos.
- `npm run build` — Compila la PWA de producción en `dist/` (lista para Netlify/Vercel o servir desde el agente).
- `npm run qa:torture` — Ejecuta el Protocolo de Tortura QA de 7 capas y genera `qa-torture/TORTURE_REPORT.md`.
