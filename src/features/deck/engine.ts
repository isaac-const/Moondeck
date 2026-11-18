import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import { commands } from "@/lib/bindings";
import { isTauri } from "@/lib/runtime";
import type { ActionOutcome, EngineStatus } from "@/lib/types";

interface EngineStore {
  status: EngineStatus | null;
  /** Última ação que falhou; o Shell mostra e limpa. */
  failure: ActionOutcome | null;
  load: () => Promise<void>;
  retry: () => Promise<void>;
  clearFailure: () => void;
}

let unlisten: UnlistenFn[] = [];

/** Estado do motor de teclas. Em navegador (sem Tauri) fica `null`. */
export const useEngineStore = create<EngineStore>((set) => ({
  status: null,
  failure: null,

  load: async () => {
    if (!isTauri()) return;
    set({ status: await commands.engineStatus() });
    if (unlisten.length > 0) return;
    unlisten = await Promise.all([
      listen<EngineStatus>("engine://status", (event) => set({ status: event.payload })),
      listen<ActionOutcome>("engine://action", (event) => {
        if (!event.payload.ok) set({ failure: event.payload });
      }),
    ]);
  },

  retry: async () => {
    if (!isTauri()) return;
    await commands.engineRetry();
  },

  clearFailure: () => set({ failure: null }),
}));
