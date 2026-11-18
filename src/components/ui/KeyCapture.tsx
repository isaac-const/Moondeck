import { Keyboard } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Keycap } from "@/components/ui/Keycap";
import { formatKey, keyFromEvent, looksLikeKey } from "@/features/deck/keys";
import { commands } from "@/lib/bindings";
import { cn } from "@/lib/cn";
import { isTauri } from "@/lib/runtime";

export interface KeyCaptureProps {
  value: string;
  onChange: (key: string) => void;
  /** Ex.: "Home" não pode ser tecla de ação. O pai diz o que já está em uso. */
  error?: string | null;
  className?: string;
}

/**
 * Grava uma tecla qualquer apertando-a. Enquanto grava, solta a captura global
 * do motor: com o `Home` registrado no compositor, a janela nunca receberia a
 * tecla. Se o navegador não souber nomear a tecla (algumas de macro), dá para
 * digitar o nome XKB à mão (`F13`, `XF86Launch5`).
 */
export function KeyCapture({ value, onChange, error, className }: KeyCaptureProps) {
  const { t } = useTranslation();
  // `preparing`: pedimos ao motor para soltar as teclas e esperamos ele
  // confirmar. Só depois disso a janela passa a receber `Home`, `PgUp`… —
  // antes, o compositor ainda as prende e a tecla "não registra".
  const [phase, setPhase] = useState<"idle" | "preparing" | "listening">("idle");
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState(value);
  const [unknown, setUnknown] = useState(false);
  const onChangeRef = useRef(onChange);
  const held = useRef(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  async function start(): Promise<void> {
    setManual(false);
    setUnknown(false);
    setPhase("preparing");
    if (isTauri()) {
      try {
        await commands.engineHold(true);
        held.current = true;
      } catch {
        // Sem motor (ou sem portal) não há nada a soltar: a gravação segue.
      }
    }
    setPhase("listening");
  }

  // Devolve as teclas ao motor quando a gravação termina ou o componente some.
  useEffect(() => {
    if (phase === "idle" && held.current) {
      held.current = false;
      void commands.engineHold(false);
    }
  }, [phase]);

  useEffect(() => {
    return () => {
      if (held.current) {
        held.current = false;
        void commands.engineHold(false);
      }
    };
  }, []);

  useEffect(() => {
    if (phase !== "listening") return;

    function onKeyDown(event: KeyboardEvent): void {
      // Antes do Radix: Esc cancela a gravação, não fecha o modal.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape" && !event.ctrlKey && !event.altKey && !event.metaKey) {
        setPhase("idle");
        return;
      }
      const key = keyFromEvent(event);
      if (key) {
        setUnknown(false);
        onChangeRef.current(key);
        setPhase("idle");
      } else if (!/^(Control|Shift|Alt|Meta|CapsLock)/.test(event.code)) {
        setUnknown(true);
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [phase]);

  function commitManual(): void {
    const next = draft.trim();
    if (next && looksLikeKey(next)) {
      onChange(next);
      setManual(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {phase !== "idle" ? (
          <span className="key-listening" role="status">
            <span className="key-listening__dot" aria-hidden="true" />
            {phase === "preparing" ? t("keys.capture.preparing") : t("keys.capture.listening")}
          </span>
        ) : (
          <Keycap tone={value ? "mode" : "ghost"}>{value ? formatKey(value) : "—"}</Keycap>
        )}

        <Button
          size="sm"
          variant={phase !== "idle" ? "primary" : "secondary"}
          disabled={phase === "preparing"}
          onClick={() => (phase === "idle" ? void start() : setPhase("idle"))}
        >
          <Keyboard aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
          {phase !== "idle" ? t("keys.capture.cancel") : t("keys.capture.record")}
        </Button>

        {phase === "idle" ? (
          <button
            type="button"
            className="t-small text-text-tertiary underline decoration-line-strong underline-offset-4 hover:text-text-secondary"
            onClick={() => {
              setDraft(value);
              setManual((current) => !current);
            }}
          >
            {t("keys.capture.typeName")}
          </button>
        ) : null}
      </div>

      {manual && phase === "idle" ? (
        <div className="flex items-center gap-2">
          <input
            className="input input--mono w-56"
            value={draft}
            placeholder="F13, XF86Launch5, CTRL+Home"
            aria-label={t("keys.capture.typeName")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitManual();
              }
            }}
          />
          <Button size="sm" variant="secondary" onClick={commitManual} disabled={!looksLikeKey(draft.trim())}>
            {t("keys.capture.use")}
          </Button>
        </div>
      ) : null}

      {unknown ? <p className="t-small text-danger">{t("keys.capture.unknown")}</p> : null}
      {error ? <p className="t-small text-danger">{error}</p> : null}
    </div>
  );
}
