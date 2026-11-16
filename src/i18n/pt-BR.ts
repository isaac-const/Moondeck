/**
 * Fonte da verdade dos textos. `en.ts` é tipado a partir daqui: se faltar uma
 * chave em inglês, o build falha.
 *
 * Sobre `actionsCount`: o i18next resolve `_one`/`_other` em runtime, mas os
 * tipos só conhecem chaves literais — por isso a chave base existe também.
 */
export const ptBR = {
  common: {
    appName: "MoonDeck",
    phase: "Fase 0",
    preview: "Prévia",
    later: "Chega na {{phase}}",
  },
  nav: {
    label: "Navegação principal",
    modes: "Modos",
    keys: "Teclas",
    appearance: "Aparência",
    audio: "Áudio",
    general: "Geral",
    about: "Sobre",
    toggleTheme: "Alternar tema",
    skipToContent: "Ir para o conteúdo",
  },
  modes: {
    title: "Modos",
    description: "Um modo é uma camada de ações. A tecla de modo troca a camada ativa.",
    newMode: "Novo modo",
    notice: "Prévia com dados de exemplo. A edição de modos chega na Fase 5.",
    actionsCount: "{{count}} ações",
    actionsCount_one: "{{count}} ação",
    actionsCount_other: "{{count}} ações",
    modeKey: "Tecla de modo",
    actionKeys: "Teclas de ação",
    clusterTitle: "Teclas no seu teclado",
    clusterBody:
      "Home troca de modo. PgUp, PgDn e End disparam a ação mapeada no modo ativo. Insert e Delete ficam livres.",
    clusterLabel: "Cluster de navegação do teclado",
    names: {
      soundboard: "Soundboard",
      shortcuts: "Atalhos",
      apps: "Apps",
    },
    actions: {
      applause: "Aplausos",
      horn: "Buzina",
      farewell: "Tchau",
      copy: "Copiar",
      paste: "Colar",
      undo: "Desfazer",
      terminal: "Terminal",
      browser: "Navegador",
      music: "Música",
    },
    kinds: {
      sound: "Som",
      shortcut: "Atalho",
      app: "App",
    },
  },
  keys: {
    title: "Teclas",
    description: "Quais teclas viram gatilhos e qual delas troca de modo.",
    emptyTitle: "Escolha as teclas",
    emptyBody:
      "As teclas que você não usa — Home, PgUp, PgDn, End — viram um painel. A captura de teclas chega na Fase 5.",
  },
  appearance: {
    title: "Aparência",
    description: "Tema, movimento e o visual do overlay.",
    themeTitle: "Tema",
    themeDescription: "O padrão segue o sistema.",
    themeSystem: "Sistema",
    themeLight: "Claro",
    themeDark: "Escuro",
    motionTitle: "Movimento",
    motionDescription: "Reduz animações no app inteiro.",
    motionReduce: "Reduzir movimento",
    overlayTitle: "Overlay",
    overlayDescription: "Opacidade, tamanho, posição e tempo de exibição.",
    paletteTitle: "Cores de modo",
    paletteDescription:
      "Cada modo recebe uma cor de identidade. O âmbar é reservado para estado: gravando, ao vivo, ação em execução.",
  },
  audio: {
    title: "Áudio",
    description: "Saída de som e microfone virtual.",
    emptyTitle: "Nenhum dispositivo carregado",
    emptyBody:
      "A enumeração de dispositivos, o teste de som e o assistente de microfone virtual chegam na Fase 4.",
  },
  general: {
    title: "Geral",
    description: "Idioma, inicialização e pausa de emergência.",
    languageTitle: "Idioma",
    languageDescription: "Muda a interface na hora.",
    autostartTitle: "Iniciar com o sistema",
    autostartDescription: "Abre junto com a sessão.",
    emergencyTitle: "Atalho de emergência",
    emergencyDescription: "Pausa o app e libera as teclas.",
  },
  about: {
    title: "Sobre",
    description: "Versão, stack e licença.",
    tagline: "Um deck de ações contextuais para teclas subutilizadas.",
    version: "Versão",
    stack: "Stack",
    stackValue: "Tauri 2 · React 19 · Rust",
    license: "Licença",
    licenseValue: "A definir",
    licenseNote: "Definir antes de qualquer publicação.",
    links: "Links",
    repository: "Repositório",
    repositoryPending: "Ainda não publicado",
  },
} as const;

export default ptBR;
