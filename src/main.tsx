import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource-variable/instrument-sans";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/geist-mono";

import "@/styles/app.css";
import "@/i18n";
import { primeDocument } from "@/theme/theme";
import { App } from "@/app/App";

// Antes do primeiro paint: tema e movimento já no valor persistido.
primeDocument();

const container = document.getElementById("root");
if (!container) throw new Error("Elemento #root não encontrado");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
