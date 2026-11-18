import type { TFunction } from "i18next";
import type { DeckError } from "@/lib/types";

/**
 * Código estável → chave de tradução.
 *
 * O Rust nunca devolve frase pronta: devolve `mode.lastOne` e o fato técnico.
 * Este mapa é o contrato entre os dois lados. Código desconhecido não vira
 * tela em branco: cai em `errors.unknown` mostrando o código.
 */
const messages = {
  "config.parseFailed": "errors.config.parseFailed",
  "config.schemaNewer": "errors.config.schemaNewer",
  "config.readFailed": "errors.config.readFailed",
  "config.writeFailed": "errors.config.writeFailed",
  "config.recovered": "errors.config.recovered",
  "config.runningOnDefaults": "errors.config.runningOnDefaults",
  "config.noModes": "errors.config.noModes",
  "config.activeModeMissing": "errors.config.activeModeMissing",
  "config.ioFailed": "errors.config.ioFailed",
  "mode.limitReached": "errors.mode.limitReached",
  "mode.idEmpty": "errors.mode.idEmpty",
  "mode.idDuplicate": "errors.mode.idDuplicate",
  "mode.notFound": "errors.mode.notFound",
  "mode.nameEmpty": "errors.mode.nameEmpty",
  "mode.nameTooLong": "errors.mode.nameTooLong",
  "mode.duplicateName": "errors.mode.duplicateName",
  "mode.lastOne": "errors.mode.lastOne",
  "action.limitReached": "errors.action.limitReached",
  "action.keyDuplicate": "errors.action.keyDuplicate",
  "action.keyInvalid": "errors.action.keyInvalid",
  "action.notFound": "errors.action.notFound",
  "action.labelEmpty": "errors.action.labelEmpty",
  "action.labelTooLong": "errors.action.labelTooLong",
  "action.spanInvalid": "errors.action.spanInvalid",
  "action.fileMissing": "errors.action.fileMissing",
  "action.volumeOutOfRange": "errors.action.volumeOutOfRange",
  "action.comboInvalid": "errors.action.comboInvalid",
  "action.macroSteps": "errors.action.macroSteps",
  "action.macroStepInvalid": "errors.action.macroStepInvalid",
  "action.commandEmpty": "errors.action.commandEmpty",
  "action.commandInvalid": "errors.action.commandInvalid",
  "action.soundFileNotFound": "errors.action.soundFileNotFound",
  "general.modeKeyInvalid": "errors.general.modeKeyInvalid",
  "general.overlayDurationOutOfRange": "errors.general.overlayDurationOutOfRange",
  "general.customCssInvalid": "errors.general.customCssInvalid",
  "mode.columnsOutOfRange": "errors.mode.columnsOutOfRange",
  "action.iconInvalid": "errors.action.iconInvalid",
  "theme.limitReached": "errors.theme.limitReached",
  "theme.nameInvalid": "errors.theme.nameInvalid",
  "general.overlayColorInvalid": "errors.general.overlayColorInvalid",
  "general.overlayLookOutOfRange": "errors.general.overlayLookOutOfRange",
  "general.modeKeyInActionKeys": "errors.general.modeKeyInActionKeys",
  "general.volumeOutOfRange": "errors.general.volumeOutOfRange",
  "reorder.mismatch": "errors.reorder.mismatch",
  "state.poisoned": "errors.state.poisoned",
  "app.loadFailed": "errors.app.loadFailed",
  "app.writeFailed": "errors.app.writeFailed",
} as const;

type MessageKey = (typeof messages)[keyof typeof messages];

/** Texto do erro no idioma da interface. Nunca interpola o detalhe técnico. */
export function describeDeckError(t: TFunction, error: DeckError): string {
  const key = (messages as Record<string, MessageKey | undefined>)[error.code];
  return key ? t(key) : t("errors.unknown", { code: error.code });
}

/** Fato técnico, para quem for investigar. Some quando não há detalhe. */
export function deckErrorDetail(error: DeckError): string | null {
  const detail = error.detail?.trim();
  return detail ? detail : null;
}
