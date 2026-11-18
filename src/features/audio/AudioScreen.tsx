import { listen } from "@tauri-apps/api/event";
import { Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Slider } from "@/components/ui/Slider";
import { Switch } from "@/components/ui/Switch";
import { useToastStore } from "@/components/ui/toast-store";
import { describeDeckError } from "@/features/deck/errors";
import { canWrite, useDeckStore } from "@/features/deck/store";
import { describeError } from "@/lib/describe-error";
import { isTauri } from "@/lib/runtime";
import { usePlatformCaps } from "@/lib/use-platform-caps";
import { commands } from "@/lib/bindings";
import type { General, MicStatus, SinkInfo, SourceInfo } from "@/lib/types";

export function AudioScreen() {
  const { t } = useTranslation();
  const snapshot = useDeckStore((s) => s.snapshot);
  const load = useDeckStore((s) => s.load);
  const saveGeneral = useDeckStore((s) => s.saveGeneral);
  const push = useToastStore((s) => s.push);
  const caps = usePlatformCaps();
  const [sinks, setSinks] = useState<SinkInfo[]>([]);
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [mic, setMic] = useState<MicStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // Saídas e microfones do sistema.
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    commands
      .audioDevices()
      .then((devices) => {
        if (cancelled) return;
        // Os dispositivos do próprio MoonDeck não são escolhas do usuário.
        setSinks(devices.sinks.filter((sink) => !sink.name.startsWith("moondeck_")));
        setSources(
          devices.sources.filter(
            (source) => !source.monitorOfSink && !source.name.startsWith("moondeck_"),
          ),
        );
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(describeError(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Estado do microfone virtual: leitura ao abrir e a cada mudança.
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let off: (() => void) | undefined;
    void commands.micStatus().then((status) => {
      if (!cancelled) setMic(status);
    });
    void listen<MicStatus>("mic://status", (event) => setMic(event.payload)).then((fn) => {
      if (cancelled) fn();
      else off = fn;
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  const general = snapshot?.config.general;
  const writable = canWrite();

  async function saveAudio(patch: Partial<General["audio"]>): Promise<void> {
    if (!general) return;
    const failure = await saveGeneral({ ...general, audio: { ...general.audio, ...patch } });
    if (failure) push(describeDeckError(t, failure), "danger");
  }

  async function beep(): Promise<void> {
    try {
      await commands.audioTest(general?.audio.sink ?? null);
    } catch (cause) {
      push(describeError(cause), "danger");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("audio.title")} description={t("audio.description")} />

      {error ? <Notice>{t("audio.loadError")}</Notice> : null}

      {general ? (
        <section className="card divide-y divide-line px-5">
          <Field
            title={t("audio.outputTitle")}
            description={t("audio.outputDescription")}
            htmlFor="audio-sink"
            control={
              <select
                id="audio-sink"
                className="input max-w-[280px]"
                disabled={!writable}
                value={general.audio.sink ?? ""}
                onChange={(event) => void saveAudio({ sink: event.target.value || null })}
              >
                <option value="">{t("audio.outputDefault")}</option>
                {sinks.map((sink) => (
                  <option key={sink.name} value={sink.name}>
                    {sink.description || sink.name}
                  </option>
                ))}
              </select>
            }
          />
          <Field
            title={t("audio.volumeTitle")}
            description={t("audio.volumeDescription")}
            control={
              <Slider
                label={t("audio.volumeTitle")}
                value={general.audio.volume}
                min={0}
                max={100}
                step={5}
                format={(value) => `${value}%`}
                disabled={!writable}
                onCommit={(volume) => void saveAudio({ volume })}
              />
            }
          />
          <Field
            title={t("audio.stopTitle")}
            description={t("audio.stopDescription")}
            htmlFor="audio-stop"
            control={
              <Switch
                id="audio-stop"
                disabled={!writable}
                checked={general.audio.stopPreviousSound}
                onCheckedChange={(stopPreviousSound) => void saveAudio({ stopPreviousSound })}
              />
            }
          />
          {caps.keepAwake ? (
          <Field
            title={t("audio.keepAwakeTitle")}
            description={t("audio.keepAwakeDescription")}
            htmlFor="audio-awake"
            control={
              <Switch
                id="audio-awake"
                disabled={!writable}
                checked={general.audio.keepAwake}
                onCheckedChange={(keepAwake) => void saveAudio({ keepAwake })}
              />
            }
          />
          ) : null}
          <Field
            title={t("audio.testTitle")}
            description={t("audio.testDescription")}
            control={
              <Button variant="secondary" disabled={!isTauri()} onClick={() => void beep()}>
                <Volume2 aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                {t("audio.testButton")}
              </Button>
            }
          />
        </section>
      ) : null}

      {general && caps.virtualMic ? (
        <section className="card px-5">
          <div className="border-b border-line py-4">
            <h2 className="t-h2">{t("audio.micTitle")}</h2>
            <p className="t-small mt-1 max-w-[62ch] text-text-secondary">{t("audio.micDescription")}</p>
          </div>
          <div className="divide-y divide-line">
            <Field
              title={t("audio.micToggleTitle")}
              description={t("audio.micToggleDescription")}
              htmlFor="audio-mic"
              control={
                <Switch
                  id="audio-mic"
                  disabled={!writable || !isTauri()}
                  checked={general.audio.micRouting}
                  onCheckedChange={(micRouting) => void saveAudio({ micRouting })}
                />
              }
            />
            <Field
              title={t("audio.micMonitorTitle")}
              description={t("audio.micMonitorDescription")}
              htmlFor="audio-mic-monitor"
              control={
                <Switch
                  id="audio-mic-monitor"
                  disabled={!writable || !isTauri()}
                  checked={general.audio.micMonitor}
                  onCheckedChange={(micMonitor) => void saveAudio({ micMonitor })}
                />
              }
            />
            <Field
              title={t("audio.micSourceTitle")}
              description={t("audio.micSourceDescription")}
              htmlFor="audio-mic-source"
              control={
                <select
                  id="audio-mic-source"
                  className="input max-w-[280px]"
                  disabled={!writable}
                  value={general.audio.micSource ?? ""}
                  onChange={(event) => void saveAudio({ micSource: event.target.value || null })}
                >
                  <option value="">{t("audio.micSourceDefault")}</option>
                  {sources.map((source) => (
                    <option key={source.name} value={source.name}>
                      {source.description || source.name}
                    </option>
                  ))}
                </select>
              }
            />
            <Field
              title={t("audio.micStatusTitle")}
              control={
                <span
                  className={
                    mic?.error
                      ? "t-small text-danger"
                      : mic?.running
                        ? "t-small text-live-strong"
                        : "t-small text-text-tertiary"
                  }
                  title={mic?.error ?? undefined}
                >
                  {mic?.error
                    ? t("audio.micError")
                    : mic?.running
                      ? mic.voice
                        ? t("audio.micVoiceNow", { name: t(`voice.${mic.voice}`) })
                        : t("audio.micRunning")
                      : t("audio.micStopped")}
                </span>
              }
            />
          </div>
        </section>
      ) : null}

      <p className="t-small text-text-tertiary">{t("audio.formats")}</p>
    </div>
  );
}
