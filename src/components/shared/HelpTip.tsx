import React from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface HelpTipProps {
  tip: string;
  children?: React.ReactNode;
  size?: number;
}

export function HelpTip({ tip, children, size = 14 }: HelpTipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 cursor-help">
            {children}
            <Info className="text-muted-foreground shrink-0" style={{ width: size, height: size }} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs">{tip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
