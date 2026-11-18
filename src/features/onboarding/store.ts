import { create } from "zustand";

interface TutorialStore {
  open: boolean;
  show: () => void;
  hide: () => void;
}

/** Abre e fecha o tutorial. Quem pede para rever (Geral) e quem mostra (Shell) não se conhecem. */
export const useTutorialStore = create<TutorialStore>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
