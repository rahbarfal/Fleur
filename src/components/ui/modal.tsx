"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Centred dialog. The overlay is a flex container and the panel sits inside
 * it, so the open/close animations only touch opacity and scale (no
 * translate-based centring for the animation to fight with).
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4",
            "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
          )}
        >
          <Dialog.Content
            className={cn(
              "flex max-h-[min(88dvh,820px)] w-full flex-col rounded-2xl bg-card shadow-pop outline-none will-change-transform",
              "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
              size === "sm" && "max-w-sm",
              size === "md" && "max-w-lg",
              size === "lg" && "max-w-2xl",
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <Dialog.Title className="text-base font-semibold text-ink">{title}</Dialog.Title>
                {description ? (
                  <Dialog.Description className="mt-0.5 text-[13px] text-muted">{description}</Dialog.Description>
                ) : (
                  <Dialog.Description className="sr-only">{title}</Dialog.Description>
                )}
              </div>
              <Dialog.Close
                className="-mr-1 inline-flex size-8 items-center justify-center rounded-lg text-muted transition hover:bg-soft hover:text-ink"
                aria-label="Close"
              >
                <X className="size-4" />
              </Dialog.Close>
            </div>
            <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
