export const views = ["modes", "keys", "appearance", "audio", "general", "about"] as const;

export type View = (typeof views)[number];
