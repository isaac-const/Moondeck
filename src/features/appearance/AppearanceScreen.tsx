import { open as openFile, save as saveFile } from "@tauri-apps/plugin-dialog";
import { Download, Eye, FolderOpen, RotateCcw, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { PositionPicker } from "@/components/ui/PositionPicker";
import { Segmented } from "@/components/ui/Segmented";
import { Slider } from "@/components/ui/Slider";
import { Switch } from "@/components/ui/Switch";
import { useToastStore } from "@/components/ui/toast-store";
import { describeDeckError } from "@/features/deck/errors";
import { canWrite, useDeckStore } from "@/features/deck/store";
import { commands } from "@/lib/bindings";
import { isTauri } from "@/lib/runtime";
import type { General, ModeColor, OverlayPreset } from "@/lib/types";
import { HudCard } from "@/features/overlay/HudCard";
import { ThemeGallery } from "./ThemeGallery";
import { readableOn } from "@/features/overlay/look";
import type { KeyLook } from "@/lib/types";
import { HUD_PRESETS, PRESET_ORDER } from "@/features/overlay/look";
import { useHudImage } from "@/features/overlay/useHudImage";
import { cn } from "@/lib/cn";
import { useTheme } from "@/theme/ThemeProvider";

/** A mesma ordem de `ModeColor` no Rust. Nome, nunca hex. */
const palette: readonly ModeColor[] = [
  "sky",
  "sage",
  "teal",
  "slate",
  "rose",
  "clay",
  "sand",
  "ash",
];

/** Ganchos que o CSS próprio pode usar: seletor → chave da explicação. */
const HOOKS: readonly (readonly [string, "card" | "action" | "playing" | "icon" | "dot" | "vars"])[] = [
  [":scope", "card"],
  [".hud-action", "action"],
  [".hud-action[data-playing]", "playing"],
  [".hud-icon", "icon"],
  [".hud-dot", "dot"],
  ["--hud-bg, --hud-fg, --hud-accent, --hud-live", "vars"],
];

export function AppearanceScreen() {
  const { t, i18n } = useTranslation();
  const { mode, motion, setMode, setMotion } = useTheme();
  const snapshot = useDeckStore((s) => s.snapshot);
  const load = useDeckStore((s) => s.load);
  const saveGeneral = useDeckStore((s) => s.saveGeneral);
  const push = useToastStore((s) => s.push);

  useEffect(() => {
    void load();
  }, [load]);

  const general = snapshot?.config.general;
  const writable = canWrite();

  async function saveOverlay(patch: Partial<General["overlay"]>): Promise<void> {
    if (!general) return;
    const error = await saveGeneral({ ...general, overlay: { ...general.overlay, ...patch } });
    if (error) push(describeDeckError(t, error), "danger");
  }

  const overlayLook = general?.overlay;
  const keys: KeyLook = overlayLook?.keys ?? {
    text: null,
    keyBg: null,
    keyFg: null,
    keyPressed: null,
    keyShape: "default",
    keySize: "md",
  };
  const saveKeys = (patch: Partial<KeyLook>): Promise<void> => saveOverlay({ keys: { ...keys, ...patch } });
  const image = useHudImage(overlayLook?.image ?? null);
  const previewMode =
    snapshot?.config.modes.find((m) => m.id === snapshot.config.activeMode) ?? snapshot?.config.modes[0];

  async function chooseImage(): Promise<void> {
    if (!isTauri()) return;
    const chosen = await openFile({
      multiple: false,
      directory: false,
      filters: [{ name: t("appearance.imageFiles"), extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    });
    if (typeof chosen === "string") await saveOverlay({ image: chosen });
  }

  const [css, setCss] = useState<{ source: string; text: string } | null>(null);
  const savedCss = overlayLook?.customCss ?? "";
  // O rascunho só vale enquanto parte do que está salvo; mudou por fora, volta a espelhar.
  const cssText = css && css.source === savedCss ? css.text : savedCss;
  const cssDirty = cssText !== savedCss;

  async function applyCss(text: string): Promise<void> {
    await saveOverlay({ customCss: text });
    setCss(null);
  }

  async function exportTheme(): Promise<void> {
    if (!isTauri()) return;
    const path = await saveFile({
      defaultPath: "moondeck-tema.json",
      filters: [{ name: t("general.jsonFiles"), extensions: ["json"] }],
    });
    if (!path) return;
    try {
      await commands.themeExport(path);
      push(t("appearance.themeExported"), "success");
    } catch (cause) {
      push(describeDeckError(t, cause as never), "danger");
    }
  }

  async function importTheme(): Promise<void> {
    if (!isTauri()) return;
    const chosen = await openFile({
      multiple: false,
      directory: false,
      filters: [{ name: t("general.jsonFiles"), extensions: ["json"] }],
    });
    if (typeof chosen !== "string") return;
    try {
      await commands.themeImport(chosen);
      await load();
      setCss(null);
      push(t("appearance.themeImported"), "success");
    } catch (cause) {
      push(describeDeckError(t, cause as never), "danger");
    }
  }

  const seconds = (ms: number): string =>
    t("appearance.overlayDurationValue", {
      seconds: new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(ms / 1000),
    });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("appearance.title")} description={t("appearance.description")} />

      <section className="card divide-y divide-line px-5">
        <Field
          title={t("appearance.themeTitle")}
          description={t("appearance.themeDescription")}
          control={
            <Segmented
              label={t("appearance.themeTitle")}
              value={mode}
              onChange={setMode}
              options={[
                { value: "system", label: t("appearance.themeSystem") },
                { value: "light", label: t("appearance.themeLight") },
                { value: "dark", label: t("appearance.themeDark") },
              ]}
            />
          }
        />

        <Field
          title={t("appearance.motionTitle")}
          description={t("appearance.motionDescription")}
          htmlFor="reduce-motion"
          control={
            <Switch
              id="reduce-motion"
              checked={motion === "reduced"}
              onCheckedChange={(checked) => setMotion(checked ? "reduced" : "full")}
            />
          }
        />

      </section>

      <section className="card px-5">
        <div className="border-b border-line py-4">
          <h2 className="t-h2">{t("appearance.overlayTitle")}</h2>
          <p className="t-small mt-1 max-w-[62ch] text-text-secondary">
            {t("appearance.overlayDescription")}
          </p>
        </div>
        {general ? (
          <div className="divide-y divide-line">
            <Field
              title={t("appearance.overlayEnabledTitle")}
              description={t("appearance.overlayEnabledDescription")}
              htmlFor="overlay-enabled"
              control={
                <Switch
                  id="overlay-enabled"
                  disabled={!writable}
                  checked={general.overlay.enabled}
                  onCheckedChange={(enabled) => void saveOverlay({ enabled })}
                />
              }
            />
            <Field
              title={t("appearance.overlayOnModeTitle")}
              description={t("appearance.overlayOnModeDescription")}
              htmlFor="overlay-on-mode"
              control={
                <Switch
                  id="overlay-on-mode"
                  disabled={!writable || !general.overlay.enabled}
                  checked={general.overlay.showOnModeChange}
                  onCheckedChange={(showOnModeChange) => void saveOverlay({ showOnModeChange })}
                />
              }
            />
            <Field
              title={t("appearance.overlayDurationTitle")}
              description={t("appearance.overlayDurationDescription")}
              control={
                <Slider
                  label={t("appearance.overlayDurationTitle")}
                  value={Math.max(500, general.overlay.hideAfterMs)}
                  min={500}
                  max={8000}
                  step={500}
                  format={seconds}
                  disabled={!writable || !general.overlay.enabled}
                  onCommit={(hideAfterMs) => void saveOverlay({ hideAfterMs })}
                />
              }
            />
            <Field
              title={t("appearance.overlayPositionTitle")}
              description={t("appearance.overlayPositionDescription")}
              control={
                <PositionPicker
                  value={general.overlay.position}
                  disabled={!writable || !general.overlay.enabled}
                  onChange={(position) => void saveOverlay({ position })}
                />
              }
            />
            <Field
              title={t("appearance.overlayMarginTitle")}
              description={t("appearance.overlayMarginDescription")}
              control={
                <Slider
                  label={t("appearance.overlayMarginTitle")}
                  value={general.overlay.margin}
                  min={0}
                  max={200}
                  step={4}
                  format={(px) => t("appearance.overlayMarginValue", { px })}
                  disabled={!writable || !general.overlay.enabled}
                  onCommit={(margin) => void saveOverlay({ margin })}
                />
              }
            />
            <Field
              title={t("appearance.overlayPreviewTitle")}
              description={t("appearance.overlayPreviewDescription")}
              control={
                <Button
                  variant="secondary"
                  disabled={!isTauri() || !general.overlay.enabled}
                  onClick={() => void commands.overlayPreview()}
                >
                  <Eye aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                  {t("appearance.overlayPreview")}
                </Button>
              }
            />
          </div>
        ) : null}
      </section>

      {general && overlayLook && previewMode ? (
        <section className="card px-5">
          <div className="border-b border-line py-4">
            <h2 className="t-h2">{t("appearance.lookTitle")}</h2>
            <p className="t-small mt-1 max-w-[62ch] text-text-secondary">
              {t("appearance.lookDescription")}
            </p>
          </div>

          {/* A prévia usa o mesmo cartão do overlay de verdade. */}
          <div className="look-stage my-5 overflow-x-auto rounded-xl border border-line p-6">
            <div className="mx-auto w-fit">
              <HudCard
                modes={snapshot?.config.modes ?? []}
                mode={previewMode}
                modeKey={general.modeKey}
                look={overlayLook}
                imageUrl={image.url}
                playing={previewMode.actions[0]?.key ?? null}
              />
            </div>
          </div>

          <div className="divide-y divide-line">
            <Field
              title={t("appearance.presetTitle")}
              control={
                <div role="radiogroup" aria-label={t("appearance.presetTitle")} className="flex flex-wrap gap-2">
                  {PRESET_ORDER.map((preset: OverlayPreset) => {
                    const palette = HUD_PRESETS[preset];
                    const selected = overlayLook.preset === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={!writable}
                        className={cn("preset-swatch", selected && "is-selected")}
                        onClick={() => void saveOverlay({ preset })}
                      >
                        <span
                          aria-hidden="true"
                          className="preset-swatch__chip"
                          style={{ background: palette.bg, color: palette.accent, borderColor: palette.accent }}
                        />
                        {t(`appearance.presets.${preset}`)}
                      </button>
                    );
                  })}
                </div>
              }
            />
            <Field
              title={t("appearance.colorsTitle")}
              description={t("appearance.colorsDescription")}
              control={
                <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
                  {(
                    [
                      ["background", "backgroundColor", HUD_PRESETS[overlayLook.preset].bg],
                      ["accent", "accentColor", HUD_PRESETS[overlayLook.preset].accent],
                    ] as const
                  ).map(([field, labelKey, fallback]) => (
                    <div key={field} className="flex items-center gap-2">
                      <label htmlFor={`overlay-${field}`} className="t-small text-text-secondary">
                        {t(`appearance.${labelKey}`)}
                      </label>
                      <input
                        id={`overlay-${field}`}
                        type="color"
                        className="color-input"
                        disabled={!writable}
                        value={overlayLook[field] ?? fallback}
                        onChange={(event) => void saveOverlay({ [field]: event.target.value })}
                      />
                      {overlayLook[field] ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!writable}
                          onClick={() => void saveOverlay({ [field]: null })}
                        >
                          {t("appearance.colorReset")}
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              }
            />
            <Field
              title={t("appearance.keysTitle")}
              description={t("appearance.keysDescription")}
              control={
                <div className="flex flex-col items-end gap-2">
                  <Segmented
                    label={t("appearance.keyShapeTitle")}
                    value={keys.keyShape}
                    onChange={(value) => void saveKeys({ keyShape: value })}
                    options={(["default", "square", "round", "pill"] as const).map((value) => ({
                      value,
                      label: t(`appearance.keyShapes.${value}`),
                    }))}
                  />
                  <Segmented
                    label={t("appearance.keySizeTitle")}
                    value={keys.keySize}
                    onChange={(value) => void saveKeys({ keySize: value })}
                    options={(["sm", "md", "lg"] as const).map((value) => ({
                      value,
                      label: t(`appearance.keySizes.${value}`),
                    }))}
                  />
                </div>
              }
            />
            <Field
              title={t("appearance.textColorsTitle")}
              description={t("appearance.textColorsDescription")}
              control={
                <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
                  {(
                    [
                      ["text", "textColor", readableOn(overlayLook.background ?? HUD_PRESETS[overlayLook.preset].bg)],
                      ["keyBg", "keyBgColor", "#d8dde4"],
                      ["keyFg", "keyFgColor", "#1a1f27"],
                      ["keyPressed", "keyPressedColor", overlayLook.accent ?? "#e8a33d"],
                    ] as const
                  ).map(([field, labelKey, fallback]) => (
                    <div key={field} className="flex items-center gap-2">
                      <label htmlFor={`overlay-key-${field}`} className="t-small text-text-secondary">
                        {t(`appearance.${labelKey}`)}
                      </label>
                      <input
                        id={`overlay-key-${field}`}
                        type="color"
                        className="color-input"
                        disabled={!writable}
                        value={keys[field] ?? fallback}
                        onChange={(event) => void saveKeys({ [field]: event.target.value })}
                      />
                      {keys[field] ? (
                        <Button size="sm" variant="ghost" disabled={!writable} onClick={() => void saveKeys({ [field]: null })}>
                          {t("appearance.colorReset")}
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              }
            />
            <Field
              title={t("appearance.imageTitle")}
              description={image.error ? t("appearance.imageError") : t("appearance.imageDescription")}
              control={
                <div className="flex items-center gap-2">
                  {overlayLook.image ? (
                    <span className="max-w-[160px] truncate font-mono text-xs text-text-tertiary" title={overlayLook.image}>
                      {overlayLook.image.split("/").pop()}
                    </span>
                  ) : null}
                  <Button variant="secondary" disabled={!writable || !isTauri()} onClick={() => void chooseImage()}>
                    <FolderOpen aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                    {t("appearance.imageChoose")}
                  </Button>
                  {overlayLook.image ? (
                    <Button variant="ghost" disabled={!writable} onClick={() => void saveOverlay({ image: null })}>
                      {t("appearance.imageRemove")}
                    </Button>
                  ) : null}
                </div>
              }
            />
            {overlayLook.image ? (
              <Field
                title={t("appearance.imageDimTitle")}
                description={t("appearance.imageDimDescription")}
                control={
                  <Slider
                    label={t("appearance.imageDimTitle")}
                    value={overlayLook.imageDim}
                    min={0}
                    max={90}
                    step={5}
                    format={(value) => t("appearance.percent", { value })}
                    disabled={!writable}
                    onCommit={(imageDim) => void saveOverlay({ imageDim })}
                  />
                }
              />
            ) : null}
            <Field
              title={t("appearance.opacityTitle")}
              description={t("appearance.opacityDescription")}
              control={
                <Slider
                  label={t("appearance.opacityTitle")}
                  value={overlayLook.opacity}
                  min={40}
                  max={100}
                  step={2}
                  format={(value) => t("appearance.percent", { value })}
                  disabled={!writable}
                  onCommit={(opacity) => void saveOverlay({ opacity })}
                />
              }
            />
            <Field
              title={t("appearance.scaleTitle")}
              description={t("appearance.scaleDescription")}
              control={
                <Slider
                  label={t("appearance.scaleTitle")}
                  value={overlayLook.scale}
                  min={70}
                  max={140}
                  step={5}
                  format={(value) => t("appearance.percent", { value })}
                  disabled={!writable}
                  onCommit={(scale) => void saveOverlay({ scale })}
                />
              }
            />
            <Field
              title={t("appearance.animationTitle")}
              description={t("appearance.animationDescription")}
              control={
                <Segmented
                  label={t("appearance.animationTitle")}
                  value={overlayLook.animation ?? "fade"}
                  onChange={(value) => void saveOverlay({ animation: value })}
                  options={(["fade", "slide", "scale", "pop", "none"] as const).map((value) => ({
                    value,
                    label: t(`appearance.animations.${value}`),
                  }))}
                />
              }
            />
            <Field
              title={t("appearance.timerTitle")}
              description={t("appearance.timerDescription")}
              control={
                <Segmented
                  label={t("appearance.timerTitle")}
                  value={overlayLook.timerStyle ?? "bar"}
                  onChange={(value) => void saveOverlay({ timerStyle: value })}
                  options={(["bar", "ring", "none"] as const).map((value) => ({
                    value,
                    label: t(`appearance.timers.${value}`),
                  }))}
                />
              }
            />
            <Field
              title={t("appearance.buttonsTitle")}
              description={t("appearance.buttonsDescription")}
              control={
                <Segmented
                  label={t("appearance.buttonsTitle")}
                  value={overlayLook.buttonStyle ?? "row"}
                  onChange={(value) => void saveOverlay({ buttonStyle: value })}
                  options={(["row", "tile"] as const).map((value) => ({
                    value,
                    label: t(`appearance.buttons.${value}`),
                  }))}
                />
              }
            />
            <div className="flex justify-end py-3">
              <Button
                variant="ghost"
                disabled={!writable}
                onClick={() =>
                  void saveOverlay({
                    preset: "midnight",
                    background: null,
                    accent: null,
                    image: null,
                    imageDim: 55,
                    opacity: 92,
                    scale: 100,
                    customCss: "",
                    animation: "fade",
                    timerStyle: "bar",
                    buttonStyle: "row",
                    keys: { text: null, keyBg: null, keyFg: null, keyPressed: null, keyShape: "default", keySize: "md" },
                  })
                }
              >
                <RotateCcw aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                {t("appearance.lookReset")}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {overlayLook ? (
        <section className="card p-5">
          <h2 className="t-h2">{t("appearance.cssTitle")}</h2>
          <p className="t-small mt-1 max-w-[62ch] text-ink-2">{t("appearance.cssDescription")}</p>
          {previewMode ? (
            <ThemeGallery
              overlay={overlayLook}
              savedThemes={general?.savedThemes ?? []}
              previewMode={previewMode}
              modes={snapshot?.config.modes ?? []}
              writable={writable}
              onApply={(look) => saveOverlay(look)}
            />
          ) : null}
          <h3 className="t-h2 mt-6">{t("appearance.cssEditorTitle")}</h3>
          <label htmlFor="custom-css" className="sr-only">
            {t("appearance.cssTitle")}
          </label>
          <textarea
            id="custom-css"
            className="input css-editor mt-4 w-full"
            spellCheck={false}
            rows={9}
            value={cssText}
            placeholder={t("appearance.cssPlaceholder")}
            disabled={!writable}
            onChange={(event) => setCss({ source: savedCss, text: event.target.value })}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={!writable || !cssDirty} onClick={() => void applyCss(cssText)}>
              {t("appearance.cssApply")}
            </Button>
            <Button variant="ghost" disabled={!writable || (!cssDirty && savedCss === "")} onClick={() => void applyCss("")}>
              {t("appearance.cssClear")}
            </Button>
            <Button
              variant="ghost"
              disabled={!writable}
              onClick={() => setCss({ source: savedCss, text: t("appearance.cssExample") })}
            >
              {t("appearance.cssInsertExample")}
            </Button>
          </div>
          <details className="mt-4">
            <summary className="t-small cursor-pointer text-ink-2">{t("appearance.cssHooks")}</summary>
            <dl className="t-small mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-ink-2">
              {HOOKS.map(([name, text]) => (
                <div key={name} className="contents">
                  <dt className="t-mono">{name}</dt>
                  <dd>{t(`appearance.hooks.${text}`)}</dd>
                </div>
              ))}
            </dl>
          </details>
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button variant="secondary" disabled={!isTauri()} onClick={() => void exportTheme()}>
              <Download aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
              {t("appearance.themeExport")}
            </Button>
            <Button variant="secondary" disabled={!isTauri() || !writable} onClick={() => void importTheme()}>
              <Upload aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
              {t("appearance.themeImport")}
            </Button>
            <p className="t-small text-ink-3">{t("appearance.themeHint")}</p>
          </div>
        </section>
      ) : null}

      <section className="card p-5">
        <h2 className="t-h2">{t("appearance.paletteTitle")}</h2>
        <p className="t-small mt-1 max-w-[62ch] text-ink-2">{t("appearance.paletteDescription")}</p>
        <ul aria-hidden="true" className="mt-4 flex flex-wrap gap-2">
          {palette.map((color) => (
            <li
              key={color}
              className="size-6 rounded-full border border-line"
              style={{ backgroundColor: `var(--mode-${color})` }}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
