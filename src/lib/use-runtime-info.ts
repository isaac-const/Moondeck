import { useEffect, useState } from "react";
import { readRuntimeInfo, type RuntimeInfo } from "./runtime";

const initial: RuntimeInfo = {
  inTauri: false,
  version: "0.1.0",
  platform: null,
  arch: null,
};

/** Informação de build/plataforma. Assíncrona só na primeira leitura. */
export function useRuntimeInfo(): RuntimeInfo {
  const [info, setInfo] = useState<RuntimeInfo>(initial);

  useEffect(() => {
    let active = true;
    void readRuntimeInfo().then((next) => {
      if (active) setInfo(next);
    });
    return () => {
      active = false;
    };
  }, []);

  return info;
}
