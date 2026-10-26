import { AlertTriangle, CheckCircle2, Circle, ExternalLink, Loader2 } from "lucide-react";
import { STEP_STATUS } from "../web3/useStepFlow";

const ICONS = {
  [STEP_STATUS.IDLE]: <Circle className="size-5 text-slate-600" aria-hidden="true" />,
  [STEP_STATUS.ACTIVE]: <Loader2 className="size-5 animate-spin text-sky-300" aria-hidden="true" />,
  [STEP_STATUS.DONE]: <CheckCircle2 className="size-5 text-emerald-300" aria-hidden="true" />,
  [STEP_STATUS.ERROR]: <AlertTriangle className="size-5 text-rose-300" aria-hidden="true" />,
};

const STATUS_TEXT = {
  [STEP_STATUS.IDLE]: "Not started",
  [STEP_STATUS.ACTIVE]: "In progress",
  [STEP_STATUS.DONE]: "Done",
  [STEP_STATUS.ERROR]: "Failed",
};

/**
 * Shows each stage of an async action and what it is waiting on: hashing, pinning with a progress bar, the wallet
 * signature prompt, the pending transaction (with an explorer link), and the confirmation. Announced politely to
 * screen readers. Pair with useStepFlow().
 */
export default function TxProgress({ steps, title = "Progress" }) {
  return (
    <div aria-live="polite" aria-label={title} className="rounded-lg border border-slate-700/70 bg-slate-950/60 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">{title}</h3>
      <ol className="space-y-3">
        {steps.map((step) => (
          <li key={step.key} className="flex gap-3" data-status={step.status}>
            <span className="mt-0.5">{ICONS[step.status]}</span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${step.status === STEP_STATUS.IDLE ? "text-slate-400" : "text-slate-100"}`}>
                {step.label}
                <span className="sr-only">: {STATUS_TEXT[step.status]}</span>
              </p>
              {step.detail ? (
                <p className={`break-words text-xs ${step.status === STEP_STATUS.ERROR ? "text-rose-300" : "text-slate-300"}`}>{step.detail}</p>
              ) : null}
              {typeof step.progress === "number" ? (
                <div
                  role="progressbar"
                  aria-label={`${step.label} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(step.progress)}
                  className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-slate-800"
                >
                  <div className="h-full bg-sky-400 transition-[width]" style={{ width: `${Math.min(100, Math.max(0, step.progress))}%` }} />
                </div>
              ) : null}
              {step.link ? (
                <a
                  href={step.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-sky-300 underline underline-offset-2 hover:text-sky-200"
                >
                  {step.link.label}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
