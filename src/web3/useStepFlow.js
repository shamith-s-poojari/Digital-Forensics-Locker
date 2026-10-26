import { useCallback, useMemo, useReducer } from "react";

export const STEP_STATUS = Object.freeze({ IDLE: "idle", ACTIVE: "active", DONE: "done", ERROR: "error" });

const BLANK = { status: STEP_STATUS.IDLE, detail: null, progress: null, link: null };

function init(definitions) {
  return definitions.map((d) => ({ ...BLANK, key: d.key, label: d.label }));
}

function reducer(state, action) {
  switch (action.type) {
    case "patch":
      return state.map((step) => (step.key === action.key ? { ...step, ...action.patch } : step));
    case "reset":
      return state.map((step) => ({ ...step, ...BLANK }));
    default:
      return state;
  }
}

/**
 * Tracks a multi-step asynchronous action (hash the file, pin it, wait for the wallet, wait for the block) so the UI
 * can show exactly which step is waiting on what. Pair it with <TxProgress />.
 *
 *   const flow = useStepFlow([{ key: "pin", label: "Pin to IPFS" }, { key: "sign", label: "Sign in wallet" }]);
 *   flow.start("pin", "Uploading…"); flow.progress("pin", 40); flow.done("pin", "Pinned");
 *
 * @param {{ key: string, label: string }[]} definitions Must be a stable (module-level) array.
 */
export function useStepFlow(definitions) {
  const [steps, dispatch] = useReducer(reducer, definitions, init);

  const patch = useCallback((key, p) => dispatch({ type: "patch", key, patch: p }), []);
  const start = useCallback((key, detail = null) => patch(key, { status: STEP_STATUS.ACTIVE, detail, progress: null, link: null }), [patch]);
  const progress = useCallback((key, value, detail) => patch(key, { progress: value, ...(detail === undefined ? {} : { detail }) }), [patch]);
  const detail = useCallback((key, text) => patch(key, { detail: text }), [patch]);
  const link = useCallback((key, href, label) => patch(key, { link: href ? { href, label } : null }), [patch]);
  const done = useCallback((key, text = null) => patch(key, { status: STEP_STATUS.DONE, detail: text, progress: null }), [patch]);
  const fail = useCallback((key, message) => patch(key, { status: STEP_STATUS.ERROR, detail: message, progress: null }), [patch]);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  return useMemo(
    () => ({
      steps,
      start,
      progress,
      detail,
      link,
      done,
      fail,
      reset,
      isRunning: steps.some((s) => s.status === STEP_STATUS.ACTIVE),
      failedStep: steps.find((s) => s.status === STEP_STATUS.ERROR) ?? null,
      isIdle: steps.every((s) => s.status === STEP_STATUS.IDLE),
    }),
    [steps, start, progress, detail, link, done, fail, reset]
  );
}
