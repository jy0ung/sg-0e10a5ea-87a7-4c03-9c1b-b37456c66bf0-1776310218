import { Fragment } from 'react';
import { Check } from 'lucide-react';
import { cn } from './lib/utils';

export interface StepperStep {
  key: string;
  label: string;
  /** Optional description shown below the label when the step is active. */
  description?: string;
}

interface StepperProgressProps {
  steps: StepperStep[];
  currentStep: string;
  className?: string;
}

function stepIndex(steps: StepperStep[], key: string): number {
  return steps.findIndex(s => s.key === key);
}

export function StepperProgress({ steps, currentStep, className }: StepperProgressProps) {
  const currentIdx = stepIndex(steps, currentStep);

  return (
    <div className={cn('w-full', className)}>
      {/* Desktop: horizontal stepper */}
      <ol className="hidden sm:flex items-center w-full">
        {steps.map((step, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          return (
            <li key={step.key} className={cn('flex items-center', idx < steps.length - 1 && 'flex-1')}>
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                    done && 'border-success bg-success text-white',
                    active && 'border-primary bg-primary text-white',
                    !done && !active && 'border-border bg-background text-muted-foreground',
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : idx + 1}
                </span>
                <span
                  className={cn(
                    'mt-1.5 text-[11px] font-medium capitalize whitespace-nowrap',
                    active && 'text-primary',
                    done && 'text-success',
                    !active && !done && 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </span>
                {active && step.description && (
                  <span className="text-[10px] text-muted-foreground text-center max-w-[80px]">{step.description}</span>
                )}
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-2 mb-5 rounded-full transition-colors',
                    done ? 'bg-success' : 'bg-border',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Mobile: compact pill list */}
      <ol className="flex sm:hidden items-center gap-1.5 flex-wrap">
        {steps.map((step, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          return (
            <Fragment key={step.key}>
              <li
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  done && 'bg-success/15 text-success',
                  active && 'bg-primary/15 text-primary',
                  !done && !active && 'bg-muted text-muted-foreground',
                )}
              >
                {done && <Check className="h-3 w-3" />}
                <span className="capitalize">{step.label}</span>
              </li>
              {idx < steps.length - 1 && (
                <div className={cn('h-px w-3 rounded-full', done ? 'bg-success' : 'bg-border')} />
              )}
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}
