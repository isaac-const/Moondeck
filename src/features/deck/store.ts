import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import { commands } from "@/lib/bindings";
import { isTauri } from "@/lib/runtime";
import { describeError } from "@/lib/describe-error";
import type { ActionInput, DeckError, DeckSnapshot, General, ModeEdit, NewMode } from "@/lib/types";
import { demoSnapshot } from "./demo";

export type DeckStatus = "loading" | "ready" | "unsupported" | "error";

/** `null` = a operação passou. Assim a tela decide onde mostrar o erro. */
export type MutationResult = DeckError | null;

interface DeckStore {
  status: DeckStatus;
  snapshot: DeckSnapshot | null;
  /** Falha que impediu a leitura inicial; some ao recarregar com sucesso. */
  loadError: DeckError | null;
  load: () => Promise<void>;
  cycle: (direction: 1 | -1) => Promise<MutationResult>;
  activate: (id: string) => Promise<MutationResult>;
  createMode: (input: NewMode) => Promise<MutationResult>;
  updateMode: (input: ModeEdit) => Promise<MutationResult>;
  deleteMode: (id: string) => Promise<MutationResult>;
  saveGeneral: (general: General) => Promise<MutationResult>;
  saveAction: (modeId: string, input: ActionInput) => Promise<MutationResult>;
  deleteAction: (modeId: string, actionId: string) => Promise<MutationResult>;
  reorderActions: (modeId: string, ids: string[]) => Promise<MutationResult>;
  reorderModes: (ids: string[]) => Promise<MutationResult>;
  importDeck: (path: string) => Promise<MutationResult>;
}

function isDeckError(value: unknown): value is DeckError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof (value as { code: unknown }).code === "string"
  );
}

function toDeckError(cause: unknown, fallbackCode: string): DeckError {
  if (isDeckError(cause)) return cause;
  return { code: fallbackCode, detail: describeError(cause) };
}

/** Uma assinatura só para o processo inteiro: trocar de tela não reescreve. */
let unlisten: UnlistenFn | null = null;

export const useDeckStore = create<DeckStore>((set) => ({
  status: "loading",
  snapshot: null,
  loadError: null,

  load: async () => {
    if (!isTauri()) {
      set({ status: "unsupported", snapshot: demoSnapshot, loadError: null });
      return;
    }

    set({ status: "loading" });
    try {
      const snapshot = await commands.deckSnapshot();
      set({ snapshot, status: "ready", loadError: null });

      if (!unlisten) {
        unlisten = await listen<DeckSnapshot>("deck://changed", (event) => {
          set({ snapshot: event.payload, status: "ready", loadError: null });
        });
      }
    } catch (cause) {
      set({ status: "error", loadError: toDeckError(cause, "app.loadFailed") });
    }
  },

  cycle: async (direction) => run((input) => commands.deckCycleMode(input), direction, set),
  activate: async (id) => run((input) => commands.deckActivateMode(input), id, set),
  createMode: async (input) => run((value) => commands.deckCreateMode(value), input, set),
  updateMode: async (input) => run((value) => commands.deckUpdateMode(value), input, set),
  deleteMode: async (id) => run((value) => commands.deckDeleteMode(value), id, set),
  saveGeneral: async (general) =>
    run((value) => commands.deckSaveGeneral(value), general, set),
  saveAction: async (modeId, input) =>
    run(({ modeId, input }) => commands.deckSaveAction(modeId, input), { modeId, input }, set),
  deleteAction: async (modeId, actionId) =>
    run(
      ({ modeId, actionId }) => commands.deckDeleteAction(modeId, actionId),
      { modeId, actionId },
      set,
    ),
  reorderActions: async (modeId, ids) =>
    run(({ modeId, ids }) => commands.deckReorderActions(modeId, ids), { modeId, ids }, set),
  reorderModes: async (ids) => run((value) => commands.deckReorderModes(value), ids, set),
  importDeck: async (path) => run((value) => commands.deckImport(value), path, set),
}));

/**
 * Toda escrita devolve o retrato novo; o estado só muda com resposta do Rust.
 * Se o comando falhar, o retrato antigo continua valendo — nada de otimismo
 * que depois precisa ser desfeito.
 */
async function run<T>(
  call: (input: T) => Promise<DeckSnapshot>,
  input: T,
  set: (partial: Partial<DeckStore>) => void,
): Promise<MutationResult> {
  try {
    const snapshot = await call(input);
    set({ snapshot, status: "ready", loadError: null });
    return null;
  } catch (cause) {
    return toDeckError(cause, "app.writeFailed");
  }
}

/** Leitura derivada: o modo ativo nunca é procurado à mão em cada componente. */
export function useActiveMode() {
  return useDeckStore((state) => {
    const config = state.snapshot?.config;
    if (!config) return null;
    return config.modes.find((mode) => mode.id === config.activeMode) ?? null;
  });
}

/** Só para o modo navegador: as escritas não existem fora do Tauri. */
export function canWrite(): boolean {
  return useDeckStore.getState().status !== "unsupported";
}
