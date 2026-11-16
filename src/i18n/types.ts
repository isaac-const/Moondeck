import type ptBR from "./pt-BR";

/** Mantém a estrutura, mas alarga literais para `string` (permite tradução). */
export type DeepString<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepString<T[K]>;
};

export type Dictionary = DeepString<typeof ptBR>;

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: {
      translation: Dictionary;
    };
  }
}
