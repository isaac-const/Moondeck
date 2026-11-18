import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { sameKey } from "@/features/deck/keys";
import { useDeckStore } from "@/features/deck/store";
import { commands } from "@/lib/bindings";
import { isTauri } from "@/lib/runtime";
import type { VoiceEffect } from "@/lib/types";
import { HudCard } from "./HudCard";
import { useHudImage } from "./useHudImage";

/** Padrão quando a config ainda não chegou. */
const DEFAULT_VISIBLE_MS = 2000;
/** Duração do fade de saída; o `hide()` só acontece depois dele. */
const LEAVE_MS = 180;
/** Quanto a tecla fica "tocando" depois do disparo. */
const PLAYING_MS = 700;

type Phase = "in" | "out";

/**
 * HUD da camada ativa. Mostra o modo e a posição das teclas; a tecla que
 * acabou de disparar "afunda" e acende em âmbar (estado, não decoração).
 *
 * - Some sozinho no tempo configurado; a linha embaixo esvazia mostrando
 *   quanto falta.
 * - Passar o mouse por cima **segura** o overlay (a linha para e enche de
 *   novo), e aí dá para clicar: trocar de modo pelos pontos ou abrir as
 *   configurações. Fora dele, nada é capturado — a janela tem o tamanho do
 *   cartão, não cobre a tela.
 * - A janela é transparente e o painel é sempre escuro (flutua sobre outro app).
 */
export function Overlay() {
  const snapshot = useDeckStore((s) => s.snapshot);
  const load = useDeckStore((s) => s.load);
  const inTauri = isTauri();

  const [shown, setShown] = useState(!inTauri);
  const [playing, setPlaying] = useState<string | null>(null);
  // O HUD abriu por causa da tecla de modo: vale lembrar que apertar de novo troca.
  const [modeTapped, setModeTapped] = useState(false);
  const [voice, setVoice] = useState<VoiceEffect | null>(null);
  const [paused, setPaused] = useState(false);
  const [phase, setPhase] = useState<Phase>("in");
  const [hovered, setHovered] = useState(false);
  // Cada exibição nova remonta o cartão (animação de entrada); cada disparo
  // dentro da mesma exibição só reinicia a linha do tempo.
  const [showId, setShowId] = useState(0);
  const [timerId, setTimerId] = useState(0);

  const ready = snapshot !== null;
  const hideAfterMs = snapshot?.config.general.overlay.hideAfterMs ?? DEFAULT_VISIBLE_MS;

  const shownRef = useRef(!inTauri);
  const playTimer = useRef<number | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const hideWindow = useCallback((): void => {
    shownRef.current = false;
    setShown(false);
    setModeTapped(false);
    if (inTauri) void getCurrentWindow().hide();
  }, [inTauri]);

  // A contagem vive num efeito: reinicia a cada gatilho (`timerId`), muda com o
  // tempo da config e fica parada enquanto o mouse está em cima. 0 = fixo.
  useEffect(() => {
    if (!ready || !shown || hovered || hideAfterMs <= 0) return;
    const leave = window.setTimeout(() => setPhase("out"), Math.max(0, hideAfterMs - LEAVE_MS));
    const hide = window.setTimeout(hideWindow, hideAfterMs);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(hide);
    };
  }, [ready, shown, hovered, hideAfterMs, timerId, hideWindow]);

  /** O Rust já posicionou a janela e a mostrou: entra o cartão. */
  const onShown = useCallback((): void => {
    void load();
    if (!shownRef.current) {
      shownRef.current = true;
      setShown(true);
      setShowId((id) => id + 1);
    }
    setPhase("in");
    setTimerId((id) => id + 1);
  }, [load]);

  useEffect(() => {
    void load();
    if (!inTauri) return;

    let disposed = false;
    let offs: UnlistenFn[] = [];
    void (async () => {
      const status = await commands.micStatus();
      if (!disposed) setVoice(status.voice);
      const engine = await commands.engineStatus();
      if (!disposed) setPaused(engine.paused);
      const subscriptions = await Promise.all([
        listen<{ voice: VoiceEffect | null }>("mic://status", (event) => setVoice(event.payload.voice)),
        listen<{ paused: boolean }>("engine://status", (event) => setPaused(event.payload.paused)),
        listen("overlay://show", onShown),
        listen<string>("overlay://fire", (event) => {
          const modeKey = useDeckStore.getState().snapshot?.config.general.modeKey;
          setModeTapped(modeKey !== undefined && sameKey(event.payload, modeKey));
          setPlaying(event.payload);
          if (playTimer.current !== null) window.clearTimeout(playTimer.current);
          playTimer.current = window.setTimeout(() => setPlaying(null), PLAYING_MS);
        }),
      ]);
      if (disposed) {
        for (const off of subscriptions) off();
        return;
      }
      offs = subscriptions;
      // Só agora o Rust pode mostrar a janela: o React já escuta.
      await commands.overlayReady();
    })();

    return () => {
      disposed = true;
      for (const off of offs) off();
      if (playTimer.current !== null) window.clearTimeout(playTimer.current);
    };
  }, [load, onShown, inTauri]);

  // A janela do sistema acompanha o tamanho do cartão (e o Rust a reposiciona:
  // as âncoras de baixo e da direita dependem do tamanho).
  useEffect(() => {
    const node = frameRef.current;
    if (!node || !inTauri) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = node.getBoundingClientRect();
        void commands.overlayFit(Math.ceil(rect.width), Math.ceil(rect.height));
      });
    });
    observer.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [inTauri, shown, snapshot]);

  const config = snapshot?.config;
  const overlay = config?.general.overlay;
  const image = useHudImage(overlay?.image ?? null);
  const mode = config?.modes.find((m) => m.id === config.activeMode) ?? config?.modes[0];
  if (!config || !overlay || !mode || !shown) return null;

  return (
    <div ref={frameRef} className="inline-block p-5">
      <HudCard
        key={showId}
        modes={config.modes}
        mode={mode}
        modeKey={config.general.modeKey}
        look={overlay}
        imageUrl={image.url}
        playing={playing}
        modeTapped={modeTapped}
        voice={voice}
        paused={paused}
        hideAfterMs={hideAfterMs}
        timerId={timerId}
        phase={phase}
        hovered={hovered}
        leaveMs={LEAVE_MS}
        onSelectMode={(id) => void commands.deckActivateMode(id)}
        onOpenSettings={() => {
          void commands.appOpenMain("modes");
          hideWindow();
        }}
        onPointerEnter={() => {
          setHovered(true);
          setPhase("in");
          setTimerId((id) => id + 1);
        }}
        onPointerLeave={() => {
          setHovered(false);
          setTimerId((id) => id + 1);
        }}
      />
    </div>
  );
}
