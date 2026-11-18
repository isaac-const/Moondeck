import { useEffect, useState, type ReactNode } from "react";
import { commands } from "@/lib/bindings";
import { isTauri } from "@/lib/runtime";
import type { ActionPayload } from "@/lib/types";

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|svg)$/i;

/** Quem tem cara de caminho de imagem; o resto é emoji ou texto curto. */
export function isImagePath(icon: string): boolean {
  return IMAGE_EXT.test(icon) && (icon.includes("/") || icon.includes("\\"));
}

// Cada arquivo/programa é lido uma vez por sessão: o HUD abre toda hora.
const cache = new Map<string, Promise<string | null>>();

function load(key: string, read: () => Promise<string | null>): Promise<string | null> {
  let hit = cache.get(key);
  if (!hit) {
    hit = read().catch(() => null);
    cache.set(key, hit);
  }
  return hit;
}

/** Esquece o que foi lido (ao trocar o arquivo da imagem, por exemplo). */
export function forgetIcon(icon: string): void {
  cache.delete(`img:${icon}`);
}

type Resolved = { key: string; url: string | null };

/**
 * A imagem de um botão: a escolhida pelo usuário ou, se o botão abre um
 * programa e nada foi escolhido, o ícone do programa.
 */
function useIconUrl(icon: string | null, payload: ActionPayload): string | null {
  const [resolved, setResolved] = useState<Resolved | null>(null);

  let key: string | null = null;
  let read: (() => Promise<string | null>) | null = null;
  if (icon && isImagePath(icon)) {
    key = `img:${icon}`;
    read = () => commands.overlayImage(icon);
  } else if (!icon && payload.kind === "app") {
    const command = payload.command;
    key = `app:${command}`;
    read = () => commands.appIcon(command);
  }

  useEffect(() => {
    if (!key || !read || !isTauri()) return;
    let cancelled = false;
    const wanted = key;
    void load(wanted, read).then((url) => {
      if (!cancelled) setResolved({ key: wanted, url });
    });
    return () => {
      cancelled = true;
    };
    // `read` é recriada a cada render; a chave identifica o que ler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return key && resolved?.key === key ? resolved.url : null;
}

export interface ActionIconProps {
  icon: string | null;
  payload: ActionPayload;
  size?: number;
  className?: string;
  /** O que mostrar quando o botão não tem figura. */
  fallback?: ReactNode;
}

/** A figura do botão (imagem, gif, emoji ou ícone do app). Nada se não houver. */
export function ActionIcon({ icon, payload, size = 22, className, fallback = null }: ActionIconProps) {
  const url = useIconUrl(icon, payload);
  const text = icon && !isImagePath(icon) ? icon : null;
  if (url) {
    return (
      <img
        src={url}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={className ?? "hud-icon"}
        style={{ width: size, height: size }}
      />
    );
  }
  if (text) {
    return (
      <span aria-hidden="true" className={className ?? "hud-icon"} style={{ width: size, height: size, fontSize: size * 0.8 }}>
        {text}
      </span>
    );
  }
  return <>{fallback}</>;
}
