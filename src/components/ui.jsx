import { Check, Copy, Loader2 } from "lucide-react";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";

/*
 * Small building blocks for the tactical dark UI: slate surfaces, high-contrast text, electric-blue accent.
 * Every Tailwind class below is written out in full so the class scanner can see it.
 */

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-md border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_VARIANTS = {
  primary: "border-sky-400 bg-sky-500 text-slate-950 hover:bg-sky-400 disabled:hover:bg-sky-500",
  secondary: "border-slate-600 bg-slate-800 text-slate-100 hover:border-slate-500 hover:bg-slate-700 disabled:hover:bg-slate-800",
  ghost: "border-transparent bg-transparent text-sky-300 hover:bg-slate-800",
  danger: "border-rose-500/60 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
};

const BUTTON_SIZES = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3.5 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm",
};

export function Button({ variant = "secondary", size = "md", loading = false, icon: Icon, children, className = "", disabled, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

const BADGE_TONES = {
  neutral: "border-slate-600 bg-slate-800/80 text-slate-200",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  danger: "border-rose-500/50 bg-rose-500/10 text-rose-200",
};

export function Badge({ tone = "neutral", icon: Icon, children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]} ${className}`}>
      {Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function Panel({ title, titleId, actions, children, className = "", bodyClassName = "p-4" }) {
  return (
    <section aria-labelledby={title ? titleId : undefined} className={`rounded-lg border border-slate-700/70 bg-slate-950/60 ${className}`}>
      {title ? (
        <header className="flex items-center justify-between gap-2 border-b border-slate-700/70 px-4 py-2.5">
          <h2 id={titleId} className="text-sm font-semibold uppercase tracking-wide text-slate-200">
            {title}
          </h2>
          {actions}
        </header>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** A hash, CID or address in monospace with a one-click copy button. */
export function CopyChip({ value, display, label, className = "", textClassName = "text-slate-100" }) {
  const { copiedKey, copy } = useCopyToClipboard();
  const copied = copiedKey === value;
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 ${className}`}>
      <code className={`truncate font-mono text-xs ${textClassName}`} title={value}>
        {display ?? value}
      </code>
      <button
        type="button"
        onClick={() => copy(value, value)}
        aria-label={`Copy ${label}`}
        className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-700 hover:text-sky-300"
      >
        {copied ? <Check className="size-3.5 text-emerald-300" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      </button>
      <span role="status" className="sr-only">
        {copied ? `${label} copied to clipboard` : ""}
      </span>
    </span>
  );
}

export function Field({ label, htmlFor, hint, error, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-300">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const INPUT_CLASS =
  "w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40";

export function Spinner({ label }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-slate-300">
      <Loader2 className="size-4 animate-spin text-sky-300" aria-hidden="true" />
      {label}
    </span>
  );
}
