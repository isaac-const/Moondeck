/**
 * Teclas do deck: nomes XKB (o formato do portal GlobalShortcuts) com
 * modificadores opcionais — `Home`, `Page_Up`, `F13`, `CTRL+Home`.
 *
 * O Rust é quem valida de verdade (`normalize_key`); aqui ficam a conversão do
 * `KeyboardEvent` (para gravar uma tecla) e o rótulo de keycap.
 */

const MODIFIER_ORDER = ["CTRL", "ALT", "SHIFT", "LOGO"] as const;

const modifierLabels: Record<string, string> = {
  CTRL: "Ctrl",
  ALT: "Alt",
  SHIFT: "Shift",
  LOGO: "Super",
};

const keyLabels: Record<string, string> = {
  Page_Up: "PgUp",
  Page_Down: "PgDn",
  Insert: "Ins",
  Delete: "Del",
  Return: "Enter",
  BackSpace: "Bksp",
  Escape: "Esc",
  space: "Space",
  grave: "`",
  minus: "-",
  equal: "=",
  comma: ",",
  period: ".",
  slash: "/",
  semicolon: ";",
  apostrophe: "'",
  backslash: "\\",
  bracketleft: "[",
  bracketright: "]",
  Scroll_Lock: "ScrLk",
  Print: "PrtSc",
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
};

/** Rótulo curto de keycap. Não é tradução: igual ao impresso no teclado. */
export function formatKey(key: string): string {
  return key
    .split("+")
    .map((part) => {
      const upper = part.toUpperCase();
      if (modifierLabels[upper]) return modifierLabels[upper];
      if (keyLabels[part]) return keyLabels[part];
      if (/^KP_/i.test(part)) return `Num ${part.slice(3).replace(/^Add$/, "+").replace(/^Subtract$/, "−").replace(/^Multiply$/, "×").replace(/^Divide$/, "÷").replace(/^Decimal$/, ".")}`;
      if (/^XF86/i.test(part)) return part.slice(4).replace(/([a-z])([A-Z0-9])/g, "$1 $2");
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join("+");
}

export function sameKey(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

const codeToKeysym: Record<string, string> = {
  Home: "Home",
  End: "End",
  PageUp: "Page_Up",
  PageDown: "Page_Down",
  Insert: "Insert",
  Delete: "Delete",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Space: "space",
  Enter: "Return",
  Tab: "Tab",
  Backspace: "BackSpace",
  Escape: "Escape",
  ScrollLock: "Scroll_Lock",
  Pause: "Pause",
  PrintScreen: "Print",
  NumLock: "Num_Lock",
  ContextMenu: "Menu",
  Backquote: "grave",
  Minus: "minus",
  Equal: "equal",
  BracketLeft: "bracketleft",
  BracketRight: "bracketright",
  Backslash: "backslash",
  IntlBackslash: "less",
  Semicolon: "semicolon",
  Quote: "apostrophe",
  Comma: "comma",
  Period: "period",
  Slash: "slash",
  NumpadAdd: "KP_Add",
  NumpadSubtract: "KP_Subtract",
  NumpadMultiply: "KP_Multiply",
  NumpadDivide: "KP_Divide",
  NumpadDecimal: "KP_Decimal",
  NumpadEnter: "KP_Enter",
  MediaPlayPause: "XF86AudioPlay",
  MediaStop: "XF86AudioStop",
  MediaTrackNext: "XF86AudioNext",
  MediaTrackPrevious: "XF86AudioPrev",
  AudioVolumeUp: "XF86AudioRaiseVolume",
  AudioVolumeDown: "XF86AudioLowerVolume",
  AudioVolumeMute: "XF86AudioMute",
  LaunchApp1: "XF86Launch1",
  LaunchApp2: "XF86Launch2",
  LaunchMail: "XF86Mail",
  BrowserHome: "XF86HomePage",
};

const MODIFIER_CODES = /^(Control|Shift|Alt|Meta|OS|AltGraph)(Left|Right)?$/;

/**
 * Converte o que o usuário apertou no nome da tecla. Devolve `null` para um
 * modificador sozinho (o usuário ainda está montando a combinação) e para
 * teclas que o navegador não identifica — nesse caso a tela oferece digitar o
 * nome à mão.
 */
export function keyFromEvent(event: KeyboardEvent): string | null {
  const { code } = event;
  if (!code || MODIFIER_CODES.test(code) || code === "CapsLock") return null;

  let name: string | null = null;
  if (codeToKeysym[code]) name = codeToKeysym[code];
  else if (/^F\d{1,2}$/.test(code)) name = code;
  else if (/^Key[A-Z]$/.test(code)) name = code.slice(3).toLowerCase();
  else if (/^Digit\d$/.test(code)) name = code.slice(5);
  else if (/^Numpad\d$/.test(code)) name = `KP_${code.slice(6)}`;
  else if (event.key.length === 1 && /[a-z0-9]/i.test(event.key)) name = event.key.toLowerCase();

  if (!name) return null;

  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push("CTRL");
  if (event.altKey) modifiers.push("ALT");
  if (event.shiftKey) modifiers.push("SHIFT");
  if (event.metaKey) modifiers.push("LOGO");
  modifiers.sort((a, b) => MODIFIER_ORDER.indexOf(a as never) - MODIFIER_ORDER.indexOf(b as never));
  return [...modifiers, name].join("+");
}

/** Mesma regra do Rust, para avisar antes de enviar. */
export function looksLikeKey(raw: string): boolean {
  const parts = raw.split("+").map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => part === "")) return false;
  return parts.every((part) => /^[A-Za-z0-9_]+$/.test(part)) && parts.length <= 5;
}
