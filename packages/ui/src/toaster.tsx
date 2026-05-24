import React from "react";
import { useToast } from "./hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "./toast";

type ToastEntry = { id: string; title?: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; [key: string]: unknown };

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {(toasts as ToastEntry[]).map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props as object}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
