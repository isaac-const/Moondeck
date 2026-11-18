import { useEffect, useState } from "react";
import { commands } from "./bindings";
import { isTauri } from "./runtime";
import type { PlatformCaps } from "./types";

/** No navegador (sem Tauri) a interface mostra tudo, para poder ser vista. */
const everything: PlatformCaps = { os: "linux", virtualMic: true, keepAwake: true };

let cached: PlatformCaps | null = null;

/** O que o sistema atual suporta. Lido uma vez e guardado. */
export function usePlatformCaps(): PlatformCaps {
  const [caps, setCaps] = useState<PlatformCaps>(cached ?? everything);

  useEffect(() => {
    if (!isTauri() || cached) return;
    let active = true;
    void commands
      .platformCaps()
      .then((next) => {
        cached = next;
        if (active) setCaps(next);
      })
      // Sem resposta, vale o padrão: a interface continua usável.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return caps;
}
