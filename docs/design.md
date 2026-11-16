# Sistema visual — MoonDeck

Documento curto e normativo. Se uma decisão de UI contrariar este arquivo, um dos
dois está errado — e precisa ser dito qual.

## 1. A ideia

MoonDeck é um **HUD de teclado**. O app existe para uma sequência de três gestos:

```
tecla de modo  →  overlay mostra a camada  →  tecla de ação  →  algo acontece
```

O overlay não é enfeite: é o que ensina memória muscular. Toda decisão visual
serve a esse loop. Se uma tela não ajuda o usuário a **descobrir, configurar ou
confirmar** uma ação, ela não pertence ao app.

## 2. Cor

A base é fria — tinta noturna, cinzas azulados, branco-luar. O app é a lua.
Existe **uma** temperatura quente, e ela é semântica.

| Token | Papel | Onde pode aparecer |
|---|---|---|
| `--bg`, `--surface*` | planos | janela, cards, campos |
| `--line*` | separação | bordas de 1px, divisores |
| `--ink*` | texto | títulos, corpo, metadados |
| `--accent` (luar) | **identidade e controle** | botão primário, item ativo, foco, barra de nav |
| `--live` (âmbar) | **estado** | gravando, ao vivo, ação disparando, modo ativo |
| `--danger`, `--success`, `--info` | feedback | erros, confirmações, avisos |

Regras duras:

1. **Âmbar nunca é cor de botão, borda decorativa ou ícone comum.** Se aparece
   âmbar, algo está acontecendo agora. Um app com âmbar em todo lugar perde o
   único sinal que importa.
2. **Nada de violeta/lavanda**, nem como gradiente, nem como tint.
3. **Sem gradiente decorativo.** Superfícies são planas. A única translucidez é
   a do overlay, porque ele flutua sobre outra janela — e mesmo ela é opcional
   (modo sólido).
4. Cores de modo vêm da configuração e são **identidade de dado** (um ponto de
   8px, um anel). Não viram cor de controle.
5. O tema claro é uma **variante desenhada**: papel quente off-white, tinta
   escura, luar convertido em tinta-slate. Não é a inversão do escuro — inverter
   acinzentaria o papel e apagaria a hierarquia.

## 3. Tipografia

| Família | Uso | Por quê |
|---|---|---|
| Instrument Sans | toda a UI | grotesca com detalhe, aguenta 12px sem virar Inter genérica |
| Instrument Serif | **só** nome do modo, onboarding, estados vazios | dá o momento editorial sem contaminar o uso diário |
| Geist Mono | keycaps, atalhos, nomes de arquivo, rodapé | tecla é objeto físico: mono caixa-alta lê como teclado |

Escala: 10.5 (label mono) · 11.5 (mono) · 12.5 (small) · 13.5 (corpo) ·
14 (h2) · 20 (h1) · 30 (display).

**Orçamento de serifa:** no máximo um elemento serifado por tela. Se a tela
inteira é serifada, o app vira revista.

## 4. A keycap

É o elemento-assinatura: mono, caixa alta, borda inferior de 2px mais escura que
a superior, raio de 6px. Uma tecla precisa parecer uma tecla — é o que conecta a
tela ao teclado do usuário.

Variantes: `mode` (a tecla que troca de camada), `live` (executando agora),
`ghost` (não mapeada). Nenhuma delas usa âmbar fora de `live`.

## 5. Layout

- Sidebar de 224px, navegação em lista, item ativo com barra de 2px em luar.
- Conteúdo em coluna única, `max-width: 900px`, padding 32px. Bordas esquerda e
  direita sempre alinhadas.
- Densidade de ferramenta: linha de configuração com 16px de respiro vertical,
  não 48px de landing page.
- Uma ação primária por tela, no topo à direita. O resto é secundário ou fantasma.

## 6. Movimento

Escala única em `src/styles/tokens.css`, importada do `transitions.dev` /
`transitions-polish`:

| Token | Valor | Uso |
|---|---|---|
| `--duration-micro` | 80ms | press, resposta de ponteiro |
| `--duration-quick` | 150ms | hover, troca de cor, fechar |
| `--duration-fast` | 250ms | abrir, deslizar pílula, trocar conteúdo |
| `--duration-medium` | 350ms | painel fechando |
| `--duration-slow` | 400ms | painel abrindo |
| `--duration-very-slow` | 500ms | momento de ênfase (onboarding) |

Regras: hover entra rápido (150ms), sai macio; fechar é mais rápido que abrir;
nada de fade-in por scroll (não existe scroll-reveal no app); nada de tilt.
`prefers-reduced-motion` e o toggle do app param tudo.

## 7. Acessibilidade

- Foco visível com `outline: 2px sólido` na cor de accent, offset 2px.
- Skip link primeiro no Tab.
- Toda navegação é alcançável por teclado; tablist com setas, Home/End.
- Contraste AA em texto normal nos dois temas.
- Nada é comunicado só por cor: o modo tem ponto **e** nome; o estado tem âmbar
  **e** texto.
