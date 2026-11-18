import { create } from "zustand";
import type { ToastMessage, ToastTone } from "@/components/ui/Toast";

interface ToastStore {
  message: ToastMessage | null;
  push: (text: string, tone?: ToastTone) => void;
  dismiss: () => void;
}

/** Um toast só, no Shell: qualquer tela (ou o motor) avisa sem montar o seu. */
export const useToastStore = create<ToastStore>((set) => ({
  message: null,
  push: (text, tone = "neutral") => set({ message: { id: Date.now(), text, tone } }),
  dismiss: () => set({ message: null }),
}));
