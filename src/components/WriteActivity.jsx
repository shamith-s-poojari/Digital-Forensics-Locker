import { X } from "lucide-react";
import TxProgress from "./TxProgress";

/**
 * Floating panel that shows the progress of the latest wallet transaction (from useWriteFlow). It stays until the
 * user dismisses it once the transaction is finished, so a failure can't vanish before it is read.
 */
export default function WriteActivity({ title, steps, isIdle, isRunning, onDismiss }) {
  if (isIdle) return null;
  return (
    <div className="fixed bottom-4 right-4 z-40 w-[22rem] max-w-[calc(100vw-2rem)]">
      <div className="relative">
        <TxProgress steps={steps} title={title} />
        {!isRunning ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss progress panel"
            className="absolute right-2 top-2 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
