import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Botões de ação, alinhados à direita. */
  footer?: ReactNode;
  className?: string;
}

/**
 * Modal do transitions.dev: sobe de 0.96 → 1 em 250ms e fecha em 150ms (o
 * Radix espera a animação de saída antes de desmontar). O foco fica preso
 * dentro, Esc e clique fora fecham, e o foco volta a quem abriu.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  const { t } = useTranslation();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content
          className={cn("dialog-content", className)}
          aria-describedby={description ? undefined : undefined}
        >
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-[17px] font-semibold tracking-[-0.02em] text-text-primary">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="t-small mt-1 text-text-secondary">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close
              className="btn btn--ghost btn--sm btn--icon -mr-1.5 -mt-1"
              aria-label={t("common.close")}
            >
              <X aria-hidden="true" className="size-4" strokeWidth={1.8} />
            </DialogPrimitive.Close>
          </header>

          <div className="mt-5">{children}</div>

          {footer ? <footer className="mt-6 flex items-center justify-end gap-2">{footer}</footer> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
