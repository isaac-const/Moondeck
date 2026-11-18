# CSS próprio do overlay

Em **Aparência → Temas e CSS próprio** dá para escrever CSS que vale só para o
cartão do overlay. O CSS roda dentro de `@scope` no cartão, então `:scope` é o
próprio cartão e nada vaza para o resto do app.

```css
:scope {
  border-radius: 24px;
  box-shadow: 0 0 40px color-mix(in srgb, var(--hud-accent) 35%, transparent);
}
.hud-action {
  border-radius: 999px;
}
.hud-action[data-playing] {
  animation: pulso 600ms ease-out;
}
@keyframes pulso {
  50% { transform: scale(1.06); }
}
```

## O que dá para estilizar

| Seletor | O quê |
|---|---|
| `:scope` | o cartão inteiro |
| `.hud-action` | cada botão (`[data-playing]` no que acabou de disparar) |
| `.hud-action[data-style="tile"]` | botão quadrado |
| `.hud-tile__face`, `.hud-tile__glyph`, `.hud-tile__label`, `.hud-tile__key` | partes do botão quadrado |
| `.hud-icon` | a figura do botão |
| `.hud-dot` | os pontos de modo |
| `.hud-timer`, `.hud-ring` | temporizador em barra e em anel |
| `.hud-gear`, `.hud-foot`, `.hud-hint` | engrenagem, rodapé e dicas |

Atributos no cartão: `data-phase`, `data-anim`, `data-image`, `data-key-bg`,
`data-key-fg`, `data-key-shape`, `data-key-size`.

Variáveis: `--hud-bg`, `--hud-fg`, `--hud-accent`, `--hud-live` (cor da tecla
apertada), `--hud-line`, `--hud-surface`, `--hud-opacity`, `--hud-dim`,
`--hud-image`, `--hud-key-bg`, `--hud-key-ink`.

## O que é recusado

O CSS é validado ao salvar (e ao importar um tema):

- até 20 000 caracteres;
- sem `@import`, `@font-face`, `image-set()`, `src()`, `image()`, `cross-fade()`
  e `element()`;
- sem `url()` para endereços ou arquivos: só `url(data:…)`;
- sem `http:`, `https:`, `//`, `expression()`, `javascript:` e `</style`.

Imagens vão como `data:` URL (por exemplo, um SVG embutido) ou pela opção
**Imagem de fundo**, que o app lê do disco.

## Exportar e importar

**Exportar tema** grava um arquivo `.json` com cores, animação, estilo dos
botões, teclas e CSS. **Importar tema** aplica o arquivo passando pela mesma
validação. **Meus temas** guarda variações dentro da configuração.
