import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import "@/styles/app.css";
import "@/i18n";
import { primeDocument } from "@/theme/theme";
import { App } from "@/app/App";
import { Overlay } from "@/features/overlay/Overlay";

// Antes do primeiro paint: tema e movimento já no valor persistido.
primeDocument();

// A mesma bundle serve o painel principal e a camada de overlay.
const surface = new URLSearchParams(window.location.search).get("surface");
const isHud = surface === "hud";
if (isHud) document.documentElement.dataset.surface = "overlay";
// O HUD flutua sobre outro app: é sempre escuro, independente do tema do painel.
if (isHud) document.documentElement.dataset.theme = "dark";

const container = document.getElementById("root");
if (!container) throw new Error("Elemento #root não encontrado");

createRoot(container).render(
  <StrictMode>
    {isHud ? <Overlay /> : <App />}
  </StrictMode>,
);
