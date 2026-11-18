import { getVersion } from "@tauri-apps/api/app";
import { arch, platform } from "@tauri-apps/plugin-os";

export interface RuntimeInfo {
  inTauri: boolean;
  version: string;
  platform: string | null;
  arch: string | null;
}

const FALLBACK_VERSION = "1.0.0";

/** `false` quando a UI é aberta no navegador (dev sem Tauri). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function readRuntimeInfo(): Promise<RuntimeInfo> {
  if (!isTauri()) {
    return { inTauri: false, version: FALLBACK_VERSION, platform: null, arch: null };
  }

  try {
    return {
      inTauri: true,
      version: await getVersion(),
      platform: platform(),
      arch: arch(),
    };
  } catch {
    // Se o plugin de OS falhar, a janela ainda abre — só perde o rodapé.
    return { inTauri: true, version: FALLBACK_VERSION, platform: null, arch: null };
  }
}
