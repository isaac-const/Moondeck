import { open as openFile } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Loader2, Play, Plus, RotateCcw, Square, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { KeyCapture } from "@/components/ui/KeyCapture";
import { Segmented } from "@/components/ui/Segmented";
import { Slider } from "@/components/ui/Slider";
import { Switch } from "@/components/ui/Switch";
import { sameKey } from "@/features/deck/keys";
import { MAX_ACTION_LABEL } from "@/features/deck/limits";
import { commands } from "@/lib/bindings";
import { describeError } from "@/lib/describe-error";
import { cn } from "@/lib/cn";
import { isTauri } from "@/lib/runtime";
import { usePlatformCaps } from "@/lib/use-platform-caps";
import type { Action, ActionInput, ActionPayload, MacroStep, PeaksReport, VoiceEffect } from "@/lib/types";
import { ActionIcon, forgetIcon, isImagePath } from "@/features/overlay/ActionIcon";
import { AppPicker } from "./AppPicker";
import { WaveformEditor } from "./WaveformEditor";

type Kind = ActionPayload["kind"];

const VOICE_EFFECTS: readonly VoiceEffect[] = [
  "deep",
  "high",
  "monster",
  "chipmunk",
  "alien",
  "robot",
  "radio",
  "whisper",
  "distortion",
  "echo",
  "cave",
];

export interface ActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = criar. */
  initial: Action | null;
  /** Teclas que não podem ser usadas aqui (tecla de modo e as outras ações). */
  takenKeys: readonly string[];
  onSubmit: (input: ActionInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}

function splitArgs(raw: string): string[] {
  const out: string[] = [];
  for (const match of raw.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) {
    out.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return out;
}

function joinArgs(args: readonly string[]): string {
  return args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(" ");
}

/** Criar e editar uma ação: tecla livre + som, atalho ou app. */
export function ActionDialog({
  open,
  onOpenChange,
  initial,
  takenKeys,
  onSubmit,
  onDelete,
}: ActionDialogProps) {
  const { t } = useTranslation();
  const creating = initial === null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={creating ? t("actions.createTitle") : t("actions.editTitle")}
      description={t("actions.description")}
      className="dialog-content--wide"
    >
      {/* Formulário montado só com o modal aberto: estado novo a cada abertura. */}
      <ActionForm
        initial={initial}
        takenKeys={takenKeys}
        onSubmit={onSubmit}
        onDelete={onDelete}
        onCancel={() => onOpenChange(false)}
      />
    </Dialog>
  );
}

interface ActionFormProps {
  initial: Action | null;
  takenKeys: readonly string[];
  onSubmit: (input: ActionInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}

function ActionForm({ initial, takenKeys, onSubmit, onDelete, onCancel }: ActionFormProps) {
  const { t } = useTranslation();
  const caps = usePlatformCaps();
  const creating = initial === null;

  const payload = initial?.payload;
  const [label, setLabel] = useState(initial?.label ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "");
  const [key, setKey] = useState(initial?.key ?? "");
  const [kind, setKind] = useState<Kind>(payload?.kind ?? "sound");
  const [file, setFile] = useState(payload?.kind === "sound" ? payload.file : "");
  const [volume, setVolume] = useState(payload?.kind === "sound" ? payload.volume : 100);
  const sound = payload?.kind === "sound" ? payload : null;
  const [startMs, setStartMs] = useState(sound?.startMs ?? 0);
  const [endMs, setEndMs] = useState(sound?.endMs ?? 0);
  const [fadeInMs, setFadeInMs] = useState(sound?.fadeInMs ?? 0);
  const [fadeOutMs, setFadeOutMs] = useState(sound?.fadeOutMs ?? 0);
  const [playing, setPlaying] = useState(false);
  // Cada início de prévia ganha um número: a barra de progresso reinicia nele.
  const [playRun, setPlayRun] = useState(0);
  const [playLength, setPlayLength] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [wave, setWave] = useState<{ file: string; report?: PeaksReport; error?: string } | null>(null);
  const [stopOthers, setStopOthers] = useState(payload?.kind === "sound" ? payload.stopOthers : true);
  const [combo, setCombo] = useState(payload?.kind === "shortcut" ? payload.combo : "");
  const [effect, setEffect] = useState<VoiceEffect>(payload?.kind === "voice" ? payload.effect : "deep");
  const [hold, setHold] = useState(payload?.kind === "voice" ? payload.hold : false);
  const [steps, setSteps] = useState<MacroStep[]>(
    payload?.kind === "macro" ? payload.steps : [{ kind: "shortcut", combo: "" }],
  );
  const [command, setCommand] = useState(payload?.kind === "app" ? payload.command : "");
  const [args, setArgs] = useState(payload?.kind === "app" ? joinArgs(payload.args) : "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Forma de onda: lê o arquivo (com folga para o usuário terminar de digitar).
  useEffect(() => {
    const path = file.trim();
    if (kind !== "sound" || path === "" || !isTauri()) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      commands
        .soundPeaks(path, 480)
        .then((report) => {
          if (!cancelled) setWave({ file: path, report });
        })
        .catch((cause: unknown) => {
          if (!cancelled) setWave({ file: path, error: describeError(cause) });
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [file, kind]);

  // Fechar o modal corta a prévia que estiver tocando.
  useEffect(() => {
    return () => {
      if (isTauri()) void commands.soundStop();
    };
  }, []);

  const waveReport = wave && wave.file === file.trim() ? wave.report : undefined;
  const waveError = wave && wave.file === file.trim() ? wave.error : undefined;
  const waveLoading = kind === "sound" && file.trim() !== "" && isTauri() && !waveReport && !waveError;

  function changeFile(next: string): void {
    setFile(next);
    // Outro arquivo, outro trecho: o corte antigo não faz sentido nele.
    setStartMs(0);
    setEndMs(0);
    setFadeInMs(0);
    setFadeOutMs(0);
    setPreviewError(null);
  }

  async function preview(): Promise<void> {
    if (playing) {
      await commands.soundStop();
      setPlaying(false);
      return;
    }
    setPreviewError(null);
    try {
      // O Rust devolve a duração real do trecho já cortado: a barra de
      // progresso anda por ela e o botão volta sozinho ao fim.
      const length = await commands.soundPreview(file.trim(), { volume, startMs, endMs, fadeInMs, fadeOutMs });
      setPlayLength(length);
      setPlayRun((run) => run + 1);
      setPlaying(true);
    } catch (cause) {
      setPreviewError(describeError(cause));
    }
  }

  const keyTaken = key !== "" && takenKeys.some((taken) => sameKey(taken, key));

  const payloadReady =
    kind === "sound"
      ? file.trim() !== ""
      : kind === "shortcut"
        ? combo.trim() !== ""
        : kind === "voice"
          ? true
          : kind === "macro"
            ? steps.length > 0 &&
              steps.every((step) =>
                step.kind === "shortcut" ? step.combo.trim() !== "" : step.kind === "sound" ? step.file.trim() !== "" : true,
              )
            : command.trim() !== "";
  const canSubmit = label.trim() !== "" && key !== "" && !keyTaken && payloadReady && !busy;

  function buildPayload(): ActionPayload {
    if (kind === "sound") {
      return { kind, file: file.trim(), volume, stopOthers, startMs, endMs, fadeInMs, fadeOutMs };
    }
    if (kind === "shortcut") return { kind, combo: combo.trim() };
    if (kind === "voice") return { kind, effect, hold };
    if (kind === "macro") return { kind, steps };
    return { kind, command: command.trim(), args: splitArgs(args) };
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit({ id: initial?.id ?? null, label: label.trim(), key, payload: buildPayload(), icon: icon.trim() || null });
    } finally {
      setBusy(false);
    }
  }

  async function pickFile(): Promise<void> {
    if (!isTauri()) return;
    const chosen = await openFile({
      multiple: false,
      directory: false,
      filters: [
        {
          name: t("actions.audioFiles"),
          extensions: ["mp3", "wav", "ogg", "flac", "m4a", "aac", "mp4", "mka"],
        },
      ],
    });
    if (typeof chosen === "string") changeFile(chosen);
  }

  async function pickIcon(): Promise<void> {
    if (!isTauri()) return;
    const chosen = await openFile({
      multiple: false,
      directory: false,
      filters: [{ name: t("actions.imageFiles"), extensions: ["png", "jpg", "jpeg", "webp", "gif", "avif", "svg"] }],
    });
    if (typeof chosen === "string") {
      forgetIcon(chosen);
      setIcon(chosen);
    }
  }

  async function remove(): Promise<void> {
    if (!onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <label htmlFor="action-label" className="t-label block">
          {t("actions.labelLabel")}
        </label>
        <input
          id="action-label"
          className="input mt-1.5 w-full"
          value={label}
          maxLength={MAX_ACTION_LABEL}
          placeholder={t("actions.labelPlaceholder")}
          onChange={(event) => setLabel(event.target.value)}
          autoComplete="off"
        />
      </div>

      <div>
        <span className="t-label block">{t("actions.iconLabel")}</span>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="action-icon-slot" aria-hidden="true">
            <ActionIcon
              icon={icon.trim() || null}
              payload={kind === "app" ? { kind: "app", command: command.trim(), args: [] } : { kind: "shortcut", combo: "" }}
              size={28}
            />
          </span>
          {isImagePath(icon) ? (
            <span className="t-small min-w-0 flex-1 truncate text-text-secondary" title={icon}>
              {icon.split(/[\\/]/).pop()}
            </span>
          ) : (
            <input
              id="action-icon"
              className="input w-24"
              value={icon}
              maxLength={8}
              placeholder={t("actions.iconPlaceholder")}
              aria-label={t("actions.iconLabel")}
              onChange={(event) => setIcon(event.target.value)}
              autoComplete="off"
            />
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => void pickIcon()}>
            <FolderOpen aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
            {t("actions.iconPick")}
          </Button>
          {icon ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setIcon("")}>
              {t("actions.iconClear")}
            </Button>
          ) : null}
        </div>
        <p className="t-body mt-1.5 text-ink-3">{kind === "app" ? t("actions.iconAutoApp") : t("actions.iconHint")}</p>
      </div>

      <div>
        <span className="t-label block">{t("actions.keyLabel")}</span>
        <KeyCapture
          className="mt-2"
          value={key}
          onChange={setKey}
          error={keyTaken ? t("actions.keyTaken") : null}
        />
      </div>

      <div>
        <span className="t-label block">{t("actions.kindLabel")}</span>
        <Segmented<Kind>
          className="mt-2"
          label={t("actions.kindLabel")}
          value={kind}
          onChange={setKind}
          options={[
            { value: "sound", label: t("modes.kinds.sound") },
            { value: "shortcut", label: t("modes.kinds.shortcut") },
            { value: "macro", label: t("modes.kinds.macro") },
            ...(caps.virtualMic || kind === "voice"
              ? [{ value: "voice" as const, label: t("modes.kinds.voice") }]
              : []),
            { value: "app", label: t("modes.kinds.app") },
          ]}
        />
      </div>

      {kind === "sound" ? (
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="action-file" className="t-label block">
              {t("actions.fileLabel")}
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="action-file"
                className="input input--mono min-w-0 flex-1"
                value={file}
                placeholder="/home/…/sons/buzina.wav"
                onChange={(event) => changeFile(event.target.value)}
              />
              {isTauri() ? (
                <Button type="button" variant="secondary" onClick={() => void pickFile()}>
                  <FolderOpen aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                  {t("actions.chooseFile")}
                </Button>
              ) : null}
            </div>
          </div>
          <div>
            <span className="t-label block">{t("actions.audioEdit")}</span>
            {waveReport ? (
              <div className="mt-2">
                <WaveformEditor
                  peaks={waveReport.peaks.map((peak) => peak ?? 0)}
                  durationMs={waveReport.durationMs}
                  startMs={startMs}
                  endMs={endMs}
                  fadeInMs={fadeInMs}
                  fadeOutMs={fadeOutMs}
                  playing={playing}
                  playRun={playRun}
                  playLengthMs={playLength}
                  onPlayEnd={() => setPlaying(false)}
                  onTrim={(nextStart, nextEnd) => {
                    setStartMs(nextStart);
                    setEndMs(nextEnd);
                  }}
                />
              </div>
            ) : (
              <div className="wave mt-2 flex items-center justify-center text-text-tertiary" style={{ height: 96 }}>
                <span className="t-small">
                  {waveError
                    ? t("actions.waveError")
                    : waveLoading
                      ? t("actions.waveLoading")
                      : t("audio.formats")}
                </span>
              </div>
            )}
            {waveError ? <p className="t-small mt-1.5 text-danger">{waveError}</p> : null}
          </div>

          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
            <div>
              <span className="t-label block">{t("actions.volumeLabel")}</span>
              <Slider
                className="mt-1.5"
                label={t("actions.volumeLabel")}
                value={volume}
                min={0}
                max={200}
                step={5}
                format={(value) => `${value}%`}
                onCommit={setVolume}
              />
            </div>
            <div>
              <span className="t-label block">{t("actions.fadeInLabel")}</span>
              <Slider
                className="mt-1.5"
                label={t("actions.fadeInLabel")}
                value={fadeInMs}
                min={0}
                max={3000}
                step={50}
                format={(value) => t("actions.seconds", { value: (value / 1000).toFixed(2) })}
                onCommit={setFadeInMs}
              />
            </div>
            <div>
              <span className="t-label block">{t("actions.fadeOutLabel")}</span>
              <Slider
                className="mt-1.5"
                label={t("actions.fadeOutLabel")}
                value={fadeOutMs}
                min={0}
                max={3000}
                step={50}
                format={(value) => t("actions.seconds", { value: (value / 1000).toFixed(2) })}
                onCommit={setFadeOutMs}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2.5 t-small text-text-secondary">
              <Switch checked={stopOthers} onCheckedChange={setStopOthers} />
              {t("actions.stopOthers")}
            </label>
            <div className="flex items-center gap-2">
              {startMs > 0 || endMs > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setStartMs(0);
                    setEndMs(0);
                  }}
                >
                  <RotateCcw aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                  {t("actions.trimReset")}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!isTauri() || file.trim() === "" || !waveReport}
                onClick={() => void preview()}
              >
                {playing ? (
                  <Square aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                ) : (
                  <Play aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                )}
                {playing ? t("actions.previewStop") : t("actions.previewPlay")}
              </Button>
            </div>
          </div>
          {previewError ? <p className="t-small text-danger">{previewError}</p> : null}
        </div>
      ) : null}

      {kind === "shortcut" ? (
        <div>
          <label htmlFor="action-combo" className="t-label block">
            {t("actions.comboLabel")}
          </label>
          <input
            id="action-combo"
            className="input input--mono mt-1.5 w-full"
            value={combo}
            placeholder="ctrl+shift+m"
            onChange={(event) => setCombo(event.target.value)}
            autoComplete="off"
          />
          <p className="t-small mt-1.5 text-text-tertiary">{t("actions.comboHint")}</p>
        </div>
      ) : null}

      {kind === "macro" ? (
        <div>
          <span className="t-label block">{t("actions.macroLabel")}</span>
          <ol className="mt-2 flex flex-col gap-2">
            {steps.map((step, index) => (
              <li key={index} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-right font-mono text-xs text-text-tertiary">{index + 1}</span>
                <select
                  className="input w-[120px] shrink-0"
                  aria-label={t("actions.macroStepType")}
                  value={step.kind}
                  onChange={(event) => {
                    const next = event.target.value as MacroStep["kind"];
                    setSteps((all) =>
                      all.map((item, i) =>
                        i !== index
                          ? item
                          : next === "wait"
                            ? { kind: "wait", ms: 500 }
                            : next === "sound"
                              ? { kind: "sound", file: "" }
                              : { kind: "shortcut", combo: "" },
                      ),
                    );
                  }}
                >
                  <option value="shortcut">{t("actions.macroShortcut")}</option>
                  <option value="wait">{t("actions.macroWait")}</option>
                  <option value="sound">{t("actions.macroSound")}</option>
                </select>
                {step.kind === "wait" ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      className="input input--mono w-28"
                      type="number"
                      min={0}
                      max={30000}
                      step={50}
                      aria-label={t("actions.macroWait")}
                      value={step.ms}
                      onChange={(event) =>
                        setSteps((all) =>
                          all.map((item, i) =>
                            i === index ? { kind: "wait", ms: Math.max(0, Math.min(30000, Number(event.target.value) || 0)) } : item,
                          ),
                        )
                      }
                    />
                    <span className="t-small text-text-tertiary">ms</span>
                  </div>
                ) : (
                  <input
                    className="input input--mono min-w-0 flex-1"
                    aria-label={step.kind === "sound" ? t("actions.macroSound") : t("actions.macroShortcut")}
                    placeholder={step.kind === "sound" ? "/home/…/som.mp3" : "ctrl+shift+m"}
                    value={step.kind === "sound" ? step.file : step.combo}
                    onChange={(event) =>
                      setSteps((all) =>
                        all.map((item, i) =>
                          i !== index
                            ? item
                            : step.kind === "sound"
                              ? { kind: "sound", file: event.target.value }
                              : { kind: "shortcut", combo: event.target.value },
                        ),
                      )
                    }
                    autoComplete="off"
                  />
                )}
                {step.kind === "sound" && isTauri() ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    iconOnly
                    aria-label={t("actions.chooseFile")}
                    onClick={() =>
                      void openFile({
                        multiple: false,
                        directory: false,
                        filters: [{ name: t("actions.audioFiles"), extensions: ["mp3", "wav", "ogg", "flac", "m4a", "aac"] }],
                      }).then((chosen) => {
                        if (typeof chosen === "string")
                          setSteps((all) => all.map((item, i) => (i === index ? { kind: "sound", file: chosen } : item)));
                      })
                    }
                  >
                    <FolderOpen aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  iconOnly
                  aria-label={t("actions.macroRemove")}
                  disabled={steps.length <= 1}
                  onClick={() => setSteps((all) => all.filter((_, i) => i !== index))}
                >
                  <X aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                </Button>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="t-small text-text-tertiary">{t("actions.macroHint")}</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={steps.length >= 20}
              onClick={() => setSteps((all) => [...all, { kind: "shortcut", combo: "" }])}
            >
              <Plus aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
              {t("actions.macroAdd")}
            </Button>
          </div>
        </div>
      ) : null}

      {kind === "voice" ? (
        <div>
          <span className="t-label block">{t("actions.voiceLabel")}</span>
          <div role="radiogroup" aria-label={t("actions.voiceLabel")} className="mt-2 flex flex-wrap gap-1.5">
            {VOICE_EFFECTS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={effect === value}
                onClick={() => setEffect(value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  effect === value
                    ? "border-line-strong bg-surface-raised font-medium text-text-primary"
                    : "border-line text-text-secondary hover:text-text-primary",
                )}
              >
                {t(`voice.${value}`)}
              </button>
            ))}
          </div>
          <p className="t-small mt-2 text-text-tertiary">{t("actions.voiceHint")}</p>
          <label className="mt-3 flex items-center gap-2.5 t-small text-text-secondary">
            <Switch checked={hold} onCheckedChange={setHold} />
            {t("actions.voiceHold")}
          </label>
        </div>
      ) : null}

      {kind === "app" ? (
        <div className="flex flex-col gap-4">
          {caps.os === "linux" ? (
            <AppPicker
              onPick={(app) => {
                setCommand(app.command);
                setArgs(joinArgs(app.args));
                setLabel((current) => (current.trim() ? current : app.name.slice(0, MAX_ACTION_LABEL)));
              }}
            />
          ) : null}
          <div>
            <label htmlFor="action-command" className="t-label block">
              {t("actions.commandLabel")}
            </label>
            <input
              id="action-command"
              className="input input--mono mt-1.5 w-full"
              value={command}
              placeholder={caps.os === "windows" ? "C:\\Program Files\\…\\app.exe" : caps.os === "macos" ? "Safari" : "firefox"}
              onChange={(event) => setCommand(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="action-args" className="t-label block">
              {t("actions.argsLabel")}
            </label>
            <input
              id="action-args"
              className="input input--mono mt-1.5 w-full"
              value={args}
              placeholder="--new-window https://…"
              onChange={(event) => setArgs(event.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
      ) : null}

      <div className="mt-1 flex items-center gap-2">
        {!creating && onDelete ? (
          <Button
            type="button"
            variant={confirmDelete ? "danger" : "ghost"}
            onClick={() => void remove()}
            disabled={busy}
          >
            {confirmDelete ? t("actions.deleteConfirm") : t("actions.delete")}
          </Button>
        ) : null}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            {t("modes.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            {busy ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" strokeWidth={2} /> : null}
            {creating ? t("actions.create") : t("modes.save")}
          </Button>
        </div>
      </div>
    </form>
  );
}
