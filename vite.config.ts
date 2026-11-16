import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// O front é servido pelo dev server do Vite; o Tauri aponta para ele em
// `src-tauri/tauri.conf.json` (build.devUrl). Em produção o bundle é estático.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // O Tauri imprime os próprios logs; não limpar a tela em cima deles.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
