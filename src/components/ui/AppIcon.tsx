import logo from "@/assets/moondeck.svg";

export interface AppIconProps {
  size?: number;
  className?: string;
}

/**
 * O logo do app: uma tecla com a lua. É o mesmo arquivo de
 * `src-tauri/icons/source/moondeck.svg`, que também gera os ícones do sistema.
 */
export function AppIcon({ size = 28, className }: AppIconProps) {
  return <img src={logo} width={size} height={size} alt="" aria-hidden="true" draggable={false} className={className} />;
}
