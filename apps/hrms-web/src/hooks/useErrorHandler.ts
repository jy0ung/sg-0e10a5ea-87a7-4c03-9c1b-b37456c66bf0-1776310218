import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { errorTrackingService } from "@/services/errorTrackingService";

export function useErrorHandler() {
  const { toast } = useToast();

  const handleError = useCallback((error: unknown, title?: string) => {
    errorTrackingService.captureException(
      error instanceof Error ? error : new Error(String(error)),
      { component: 'useErrorHandler' }
    );
    
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === "string" 
        ? error 
        : "An unexpected error occurred";

    toast({
      variant: "destructive",
      title: title || "Error",
      description: errorMessage,
    });
  }, [toast]);

  const handleSuccess = useCallback((message: string, title?: string) => {
    toast({
      title: title || "Success",
      description: message,
    });
  }, [toast]);

  const handleAsync = useCallback(async (
    operation: () => Promise<void>,
    options?: {
      successMessage?: string;
      successTitle?: string;
      errorMessage?: string;
      errorTitle?: string;
    }
  ) => {
    try {
      await operation();
      if (options?.successMessage) {
        handleSuccess(options.successMessage, options.successTitle);
      }
    } catch (error) {
      handleError(error, options?.errorTitle);
      throw error;
    }
  }, [handleError, handleSuccess]);

  return {
    handleError,
    handleSuccess,
    handleAsync,
  };
}