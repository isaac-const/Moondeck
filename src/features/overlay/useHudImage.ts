import { useEffect, useState } from "react";
import { commands } from "@/lib/bindings";
import { isTauri } from "@/lib/runtime";

interface Loaded {
  path: string;
  url: string | null;
  error: string | null;
}

/**
 * Lê a imagem de fundo do overlay (o Rust devolve um `data:` URL). Troca de
 * caminho = leitura nova; enquanto carrega, nada de imagem velha.
 */
export function useHudImage(path: string | null): { url: string | null; error: string | null } {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!path || !isTauri()) return;
    let cancelled = false;
    commands
      .overlayImage(path)
      .then((url) => {
        if (!cancelled) setLoaded({ path, url, error: null });
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoaded({ path, url: null, error: String(cause) });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path || !loaded || loaded.path !== path) return { url: null, error: null };
  return { url: loaded.url, error: loaded.error };
}
